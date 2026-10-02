import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ChatLog = require('../integrations/google-sheets/Core.js')
const ChatAnalysis = require('../integrations/google-sheets/Analysis.js')
const presentation = require('../integrations/google-sheets/Presentation.js')
const ChatDetails = require('../integrations/google-sheets/Details.js')
const fixtures = JSON.parse(readFileSync(resolve(root, 'integrations/google-sheets/demo-data.json'), 'utf8'))
const parsed = ChatAnalysis.parseRules(ChatAnalysis.defaultRows)
const dayCounts = [3, 5, 2, 4, 6, 3, 5]
const days = dayCounts.flatMap((count, day) => Array.from({ length: count }, () => day))
const logs = fixtures.map((fixture, index) => {
  const record = {
    schemaVersion: 1,
    environment: 'test',
    appId: 'demo-app',
    requestId: `demo-request-${index + 1}`,
    conversationId: `demo-conversation-${Math.floor(index / 2) + 1}`,
    messageId: `demo-message-${index + 1}`,
    createdAt: new Date(Date.UTC(2026, 8, 26 + days[index], 1, index * 2)).toISOString(),
    query: fixture.query,
    answer: fixture.answer,
    status: fixture.status || 'completed',
    capture: 'full',
  }
  if (!ChatLog.validate(record)) { throw new Error(`Invalid demo record ${index + 1}`) }
  const row = ChatLog.row(record)
  const category = ChatAnalysis.classify(record.query, parsed)
  row[3] = category.category
  row[4] = fixture.manualCategory || ''
  row[5] = row[4] || row[3]
  row[7] = fixture.review || '未確認'
  row[8] = fixture.memo || ''
  row[14] = category.ruleId
  row[15] = category.version
  return row
})
const period = { start: '2026-09-26', end: '2026-10-02', updatedAt: '2026-10-02 18:00' }
const summary = ChatAnalysis.aggregate(logs, period)
const model = presentation.dashboardModel(summary, period)
const { colors, layout } = presentation
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' })[char])
const rgb = value => `rgb(${['red', 'green', 'blue'].map(key => Math.round((value[key] || 0) * 255)).join(',')})`

// Read the same Sheets formatting requests as GAS, including merged cells,
// column widths and row heights. The preview deliberately uses sheet geometry.
function sheetGeometry(requests, rowCount, columnCount) {
  const widths = Array.from({ length: columnCount }, () => 80)
  const heights = Array.from({ length: rowCount }, () => 22)
  const cells = Array.from({ length: rowCount }, () => Array.from({ length: columnCount }, () => ({})))
  const merges = []
  for (const request of requests) {
    const dimension = request.updateDimensionProperties
    if (dimension) {
      const dimensions = dimension.range.dimension === 'ROWS' ? heights : widths
      for (let i = dimension.range.startIndex; i < dimension.range.endIndex && i < dimensions.length; i++) {
        if (dimension.properties.pixelSize !== undefined) { dimensions[i] = dimension.properties.pixelSize }
        if (dimension.properties.hiddenByUser === true) { dimensions[i] = 0 }
      }
    }
    if (request.mergeCells) { merges.push(request.mergeCells.range) }
    if (request.repeatCell) {
      const { range, cell } = request.repeatCell
      for (let row = range.startRowIndex; row < Math.min(range.endRowIndex, rowCount); row++) {
        for (let column = range.startColumnIndex || 0; column < Math.min(range.endColumnIndex, columnCount); column++) {
          Object.assign(cells[row][column], cell.userEnteredFormat)
        }
      }
    }
  }
  const positions = dimensions => dimensions.reduce((all, value) => [...all, all[all.length - 1] + value], [0])
  return { widths, heights, cells, merges, x: positions(widths), y: positions(heights) }
}

function cellStyle(format) {
  const text = format.textFormat || {}
  const borders = Object.entries(format.borders || {}).map(([side, border]) => `border-${side}:${border.style === 'SOLID_MEDIUM' ? 2 : 1}px solid ${border.color ? rgb(border.color) : colors.line}`)
  return [format.backgroundColor && `background:${rgb(format.backgroundColor)}`, text.foregroundColor && `color:${rgb(text.foregroundColor)}`, text.fontSize && `font-size:${text.fontSize * 4 / 3}px`, text.bold && 'font-weight:700', text.underline && 'text-decoration:underline', `text-align:${format.horizontalAlignment === 'CENTER' ? 'center' : format.horizontalAlignment === 'RIGHT' ? 'right' : 'left'}`, format.wrapStrategy === 'WRAP' ? 'white-space:normal' : 'white-space:nowrap', ...borders].filter(Boolean).join(';')
}

function renderGrid(geometry, values, extra = '', rowLookup = new Map()) {
  const { x, y, cells, merges, widths, heights } = geometry
  let html = ''
  cells.forEach((rowCells, row) => rowCells.forEach((format, column) => {
    if (!widths[column] || !heights[row]) { return }
    const merge = merges.find(range => row >= range.startRowIndex && row < range.endRowIndex && column >= range.startColumnIndex && column < range.endColumnIndex)
    if (merge && (row !== merge.startRowIndex || column !== merge.startColumnIndex)) { return }
    const endColumn = merge ? merge.endColumnIndex : column + 1
    const endRow = merge ? merge.endRowIndex : row + 1
    const value = values.get(`${row},${column}`) ?? ''
    html += `<div class="cell" ${rowLookup.has(row) ? `data-select="${rowLookup.get(row)}"` : ''} style="left:${x[column]}px;top:${y[row]}px;width:${x[endColumn] - x[column]}px;height:${y[endRow] - y[row]}px;${cellStyle(format)}">${escape(value)}</div>`
  }))
  return `<div class="sheet" style="width:${x[x.length - 1]}px;height:${y[y.length - 1]}px">${html}${extra}</div>`
}

function chart(title, kind, items, position, geometry) {
  const { width, height } = position
  const max = Math.max(1, ...items.map(item => item.count))
  const plot = { left: kind === 'bar' ? 135 : 58, top: 82, right: width - 38, bottom: height - 52 }
  let graphic = `<rect width="${width}" height="${height}" fill="${colors.white}"/><text x="22" y="31" font-size="21.333" font-weight="700" fill="${colors.navy}">${escape(title)}</text>`
  const subtitle = kind === 'bar' ? '件数の多い順 / 詳しい割合は下の表へ' : '質問が記録された日の推移'
  graphic += `<text x="22" y="54" font-size="14.667" fill="${colors.muted}">${escape(subtitle)}</text>`
  if (kind === 'bar') {
    const rowHeight = Math.min(28, (plot.bottom - plot.top) / Math.max(items.length, 1))
    items.forEach((item, index) => {
      const y = plot.top + index * rowHeight
      const barHeight = Math.max(12, rowHeight - 8)
      const barWidth = item.count / max * (plot.right - plot.left - 18)
      graphic += `<text x="${plot.left - 14}" y="${y + barHeight / 2 + 5}" text-anchor="end" font-size="14" fill="${colors.muted}">${escape(item.category)}</text><rect x="${plot.left}" y="${y}" width="${barWidth}" height="${barHeight}" fill="${item.category === 'その他' ? colors.amber : colors.teal}"/><text x="${plot.left + barWidth + 8}" y="${y + barHeight / 2 + 5}" font-size="16" font-weight="700" fill="${colors.navy}">${item.count}</text>`
    })
    graphic += `<text x="${(plot.left + plot.right) / 2}" y="${height - 9}" text-anchor="middle" font-size="14.667" fill="${colors.navy}">質問数（件）</text>`
    for (let count = 0; count <= max; count += Math.max(1, Math.ceil(max / 3))) {
      const x = plot.left + count / max * (plot.right - plot.left - 18)
      graphic += `<text x="${x}" y="${height - 32}" text-anchor="middle" font-size="14.667" fill="${colors.navy}">${count}</text>`
    }
  }
  else {
    const chartX = index => plot.left + index / Math.max(1, items.length - 1) * (plot.right - plot.left)
    const chartY = count => plot.bottom - count / max * (plot.bottom - plot.top)
    for (let count = 0; count <= max; count += Math.max(1, Math.ceil(max / 3))) {
      graphic += `<path d="M${plot.left} ${chartY(count)} H${plot.right}" stroke="${colors.line}"/><text x="${plot.left - 14}" y="${chartY(count) + 5}" text-anchor="end" font-size="14" fill="${colors.muted}">${count}</text>`
    }
    graphic += `<polyline points="${items.map((item, index) => `${chartX(index)},${chartY(item.count)}`).join(' ')}" fill="none" stroke="${colors.navy}" stroke-width="3"/>`
    items.forEach((item, index) => {
      graphic += `<circle cx="${chartX(index)}" cy="${chartY(item.count)}" r="3.5" fill="${colors.navy}"/><text x="${chartX(index)}" y="${height - 16}" text-anchor="middle" font-size="13" fill="${colors.muted}">${escape(`${Number(item.date.slice(5, 7))}/${Number(item.date.slice(8, 10))}`)}</text><text x="${chartX(index)}" y="${chartY(item.count) - 12}" text-anchor="middle" font-size="16" font-weight="700" fill="${colors.navy}">${item.count}</text>`
    })
    graphic += `<text transform="translate(17 ${(plot.top + plot.bottom) / 2}) rotate(-90)" text-anchor="middle" font-size="14.667" fill="${colors.navy}">質問数（件）</text>`
  }
  return `<svg role="img" aria-label="${escape(title)}（説明用。Google スプレッドシートのグラフとは描画が異なります）" style="position:absolute;left:${geometry.x[position.column - 1]}px;top:${geometry.y[position.row - 1]}px" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${graphic}</svg>`
}

const geometry = sheetGeometry(presentation.dashboardRequests(1), layout.lastRow, layout.columns)
const values = new Map(presentation.dashboardValues(model).flatMap((row, index) => row.map((value, column) => [`${index},${column}`, value])))
const put = (row, column, value) => values.set(`${row - 1},${column - 1}`, value)
put(2, 1, '開始日')
put(2, 2, period.start)
put(2, 4, '日付を入力して「会話ログ → 集計を更新」')
put(3, 1, '終了日')
put(3, 2, period.end)
put(3, 4, '空欄なら全期間（日本時間）')
const dashboard = renderGrid(geometry, values, chart('カテゴリ別の質問数', 'bar', model.categories, layout.charts[0], geometry) + chart('日別の質問数', 'line', model.daily, layout.charts[1], geometry))

function list(items, title) {
  const compact = presentation.compactRows(items.map(item => ({ ...item, date: logs[item.index][0] })), { spreadsheetId: 'preview-only', logSheetId: 0 })
  const dataStart = layout.listDataRow - 1
  const listGeometry = sheetGeometry(presentation.listRequests(2, compact.length + dataStart), compact.length + dataStart, 6)
  const listValues = new Map(presentation.listHeaders.map((value, column) => [`${layout.listHeaderRow - 1},${column}`, value]))
  listValues.set('1,0', title)
  listValues.set('2,0', `${compact.length} 件 | ${period.start} 〜 ${period.end} | 行を選択 → 会話ログ → 選択行の詳細を開く`)
  const rowLookup = new Map()
  compact.forEach((item, index) => {
    item.values.forEach((value, column) => listValues.set(`${index + dataStart},${column}`, value))
    rowLookup.set(index + dataStart, item.rawRow - 2)
  })
  const links = compact.map((item, index) => `<button class="detail-link" data-original="${item.rawRow - 2}" style="left:${listGeometry.x[5]}px;top:${listGeometry.y[index + dataStart]}px;width:${listGeometry.widths[5]}px;height:${listGeometry.heights[index + dataStart]}px" aria-label="${escape(item.values[2])}の原本">原本</button>`).join('')
  return renderGrid(listGeometry, listValues, links, rowLookup)
}
function rawLog() {
  const rawLayout = ChatDetails.logLayout
  const totalWidth = rawLayout.columns.reduce((total, [, width]) => total + width, 0)
  const headers = rawLayout.columns.map(([column, width]) => `<th style="width:${width}px;min-width:${width}px">${escape(ChatLog.headers[column - 1])}</th>`).join('')
  const body = logs.map((row, index) => `<tr data-select="${index}" id="raw-${index}">${rawLayout.columns.map(([column, width]) => `<td style="width:${width}px;min-width:${width}px;${[5, 8, 9].includes(column) ? `background:${rawLayout.editableBackground}` : ''}"><div style="height:${rawLayout.rowHeight - 16}px">${escape(row[column - 1])}</div></td>`).join('')}</tr>`).join('')
  return `<table class="raw-log" style="width:${totalWidth}px;--header-background:${rawLayout.headerBackground};--header-text:${rawLayout.headerText};--header-height:${rawLayout.headerHeight}px;--row-height:${rawLayout.rowHeight}px"><thead><tr>${headers}</tr></thead><tbody>${body}</tbody></table>`
}
const details = logs.map((row, index) => `<template id="detail-${index}"><iframe title="質問と回答" sandbox="" srcdoc="${escape(ChatDetails.render(row))}"></iframe></template>`).join('')
const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>会話ログ・スプレッドシート表示例</title><style>
*{box-sizing:border-box}body{margin:0;background:#eef1f5;color:${colors.navy};font:14px Arial,"Noto Sans JP","Yu Gothic",sans-serif}.app-title{padding:16px 24px 8px;background:#fff;font-size:17px;font-weight:700}.disclaimer{padding:0 24px 14px;background:#fff;color:${colors.muted};font-size:12px;line-height:1.7}.menu button{font:inherit;padding:5px 10px;background:white;border:1px solid ${colors.line};color:${colors.navy};cursor:pointer}.menu button:disabled{opacity:.5;cursor:default}[data-select]{cursor:pointer}[data-select].selected{outline:2px solid ${colors.teal};outline-offset:-2px}.menu{padding:8px 24px;background:#f8f9fa;border-block:1px solid ${colors.line};color:#586779;font-size:12px}.book{overflow:auto;padding:20px 24px 28px;min-height:calc(100vh - 176px)}.tab-panel{display:none;width:max-content}.tab-panel.active{display:block}.sheet{position:relative;background:${colors.background};box-shadow:0 0 0 1px ${colors.line};overflow:hidden}.cell{position:absolute;padding:3px 8px;display:flex;align-items:center;overflow:hidden;line-height:1.25}.cell[style*="text-align:center"]{justify-content:center}.cell[style*="text-align:right"]{justify-content:flex-end}.detail-link{position:absolute;background:white;border:0;color:${colors.teal};text-decoration:underline;cursor:pointer;font:inherit}.tabs{position:sticky;bottom:0;display:flex;gap:6px;padding:9px 24px;background:#fff;border-top:1px solid ${colors.line};z-index:2}.tabs button{padding:10px 22px;border:0;background:#fff;color:${colors.muted};font:inherit;cursor:pointer}.tabs button[aria-selected=true]{background:${colors.lightTeal};color:${colors.teal};font-weight:700;border-bottom:3px solid ${colors.teal}}.sheet-note{color:${colors.muted};font-size:12px;margin:0 0 12px}.detail-meta{color:${colors.muted};font-size:12px;line-height:1.8}dialog{border:1px solid ${colors.line};border-radius:6px;padding:24px;width:930px;max-width:95vw;max-height:95vh;color:${colors.navy}}dialog iframe{width:100%;height:680px;max-height:75vh;border:0}dialog::backdrop{background:#14263d55}dialog h2{margin:0 0 12px}dialog h3{font-size:14px;margin:24px 0 8px}dialog pre{white-space:pre-wrap;overflow-wrap:anywhere;font:14px/1.8 Arial,"Yu Gothic",sans-serif;background:${colors.background};padding:14px;margin:0}.close{float:right;padding:7px 14px;background:white;border:1px solid ${colors.line};cursor:pointer;color:${colors.navy}}.raw-log{table-layout:fixed;border-collapse:collapse;background:white;font-size:14.67px}.raw-log th{height:var(--header-height);background:var(--header-background);color:var(--header-text);text-align:left;padding:8px}.raw-log td{height:var(--row-height);padding:8px;vertical-align:top;border-bottom:1px solid ${colors.line}}.raw-log td div{overflow:hidden;white-space:nowrap}.raw-log th,.raw-log td{overflow:hidden}a{color:${colors.teal}}
</style></head><body><header class="app-title">会話ログ分析 ─ 配置確認用プレビュー</header><div class="disclaimer"><strong>架空データ・配置確認用</strong> · このHTMLは実際のスプレッドシートではありません。完成状態の確認には、Google スプレッドシートを使用してください。<br>集計値・セル寸法・文字サイズは実装と共通です。グラフは説明用の描画で、ネイティブグラフとは目盛り・文字配置などが異なります。期間入力・保存は操作できません。</div><div class="menu">操作例 / 行を選択 → <button id="open-detail" disabled>選択行の詳細を開く</button> / Google アカウントへの接続・保存は行いません</div><main class="book"><section id="dashboard" class="tab-panel active">${dashboard}</section><section id="review" class="tab-panel"><p class="sheet-note">要確認 ${summary.needsReview.length} 件 · 行を選択し、上部の「選択行の詳細を開く」から全文を確認できます。</p>${list(summary.needsReview, '要確認')}</section><section id="other" class="tab-panel"><p class="sheet-note">その他 ${summary.other.length} 件 · 分類ルールの見直し候補です。</p>${list(summary.other, 'その他')}</section><section id="raw" class="tab-panel"><p class="sheet-note">原本は20列を保持し、自動分類と技術用IDなどを隠して表示します。淡黄色の列はカテゴリ修正・評価・メモの入力欄です。</p>${rawLog()}</section></main><nav class="tabs" role="tablist" aria-label="シート"><button role="tab" aria-selected="true" data-tab="dashboard">集計</button><button role="tab" aria-selected="false" data-tab="review">要確認</button><button role="tab" aria-selected="false" data-tab="other">その他</button><button role="tab" aria-selected="false" data-tab="raw">会話ログ</button></nav><dialog><button class="close">閉じる</button><h2>会話の詳細</h2><div id="detail-body"></div></dialog>${details}<script>
let selected=null;
function selectRow(index){selected=index;document.querySelector('#open-detail').disabled=false;document.querySelectorAll('[data-select]').forEach(cell=>cell.classList.toggle('selected',Number(cell.dataset.select)===index))}
function selectTab(name){document.querySelectorAll('[data-tab]').forEach(tab=>tab.setAttribute('aria-selected',String(tab.dataset.tab===name)));document.querySelectorAll('.tab-panel').forEach(panel=>panel.classList.toggle('active',panel.id===name));window.scrollTo(0,0)}
document.querySelectorAll('[data-tab]').forEach(button=>button.addEventListener('click',()=>selectTab(button.dataset.tab)));
document.querySelectorAll('[data-select]').forEach(cell=>cell.addEventListener('click',()=>selectRow(Number(cell.dataset.select))));
document.querySelectorAll('[data-original]').forEach(button=>button.addEventListener('click',()=>{selectRow(Number(button.dataset.original));selectTab('raw');document.querySelector('#raw-'+selected).scrollIntoView({block:'center'})}));
document.querySelector('#open-detail').addEventListener('click',()=>{if(selected===null)return;document.querySelector('#detail-body').replaceChildren(document.querySelector('#detail-'+selected).content.cloneNode(true));document.querySelector('dialog').showModal()});
document.querySelector('.close').addEventListener('click',()=>document.querySelector('dialog').close());

</script></body></html>`
const output = resolve(process.argv[2] || resolve(root, 'docs/development/sheets-preview.html'))
mkdirSync(dirname(output), { recursive: true })
writeFileSync(output, html)
console.log(`Preview: ${output}\n${summary.questionCount} questions, ${summary.conversationCount} conversations, ${summary.needsReview.length} need review, ${summary.other.length} other`)
