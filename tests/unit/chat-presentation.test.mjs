import assert from 'node:assert/strict'
import { test } from 'node:test'
import Analysis from '../../integrations/google-sheets/Analysis.js'
import Presentation from '../../integrations/google-sheets/Presentation.js'

function log(index, overrides = {}) {
  const row = ['2026-10-02 12:00:00', `質問 ${index}`, `回答 ${index}`, 'サービス', '', '', '完了', '未確認', '', `conv-${index}`, '', '', 'app', '', '', '', '', '', '', 'full']
  for (const [column, value] of Object.entries(overrides)) { row[Number(column)] = value }
  return row
}

test('空期間のKPIはゼロと未定義の割合を区別し、案内を表示する', () => {
  const model = Presentation.dashboardModel(Analysis.aggregate([]))
  assert.deepEqual(model.tiles.map(tile => tile.value), ['0', '0', '0', '—'])
  assert.ok(model.emptyText.includes('期間'))
  assert.deepEqual(model.frequency, [])
  assert.deepEqual(model.categories, [])
})

test('KPIは実集計と一致し、上位件数表示と残りのまとめで総数を失わない', () => {
  const logs = Array.from({ length: 15 }, (_, index) => log(index, { 3: index === 0 ? '集計上のまとめ（9位以下）' : `カテゴリ ${index}`, 6: index < 2 ? 'エラー' : '完了' }))
  logs.push(log(16, { 3: 'その他', 9: '' }))
  const summary = Analysis.aggregate(logs)
  const before = structuredClone(summary)
  const model = Presentation.dashboardModel(summary, { start: '2026-10-01', end: '2026-10-02', updatedAt: '2026-10-02 15:00' })
  assert.deepEqual(model.tiles.map(tile => tile.value), ['16', '15', '2', '6.3%'])
  assert.match(model.tiles[1].context, /会話IDなし 1 件/)
  assert.equal(model.categories.length, 9)
  assert.equal(model.categories.reduce((sum, item) => sum + item.count, 0), summary.questionCount)
  assert.ok(!summary.categories.some(item => item.category === model.categories.at(-1).category))
  assert.equal(model.frequency.length, 10)
  assert.equal(model.frequency.at(-1).rank, 10)
  assert.equal(model.frequency[0].share, '6.3%', 'top ten shares use all 16 questions as denominator')
  assert.deepEqual(model.statuses, summary.statuses)
  assert.deepEqual(model.daily, summary.daily)
  assert.ok(model.subtitle.includes('2026-10-01 〜 2026-10-02'))
  assert.equal(model.emptyText, '')
  assert.deepEqual(summary, before)
})

test('一覧は抜粋と安全な原文リンクを生成し、改行・長いUnicode・手修正を壊さない', () => {
  const answer = `原文\n${'😀'.repeat(200)} [[LANTERN_CARD:ai-consulting]]`
  const rows = [log(0, { 2: answer, 4: '=手修正カテゴリ', 7: '要改善' })]
  const summary = Analysis.aggregate(rows)
  const before = structuredClone(summary)
  const [item] = Presentation.compactRows(summary.needsReview, { spreadsheetId: 'trusted_id-123', logSheetId: 0 })
  assert.equal(item.values.length, 6)
  assert.equal(item.values[1], '=手修正カテゴリ')
  assert.equal(item.values[4], '要改善')
  assert.equal(item.rawRow, 2)
  assert.equal(item.detailUrl, 'https://docs.google.com/spreadsheets/d/trusted_id-123/edit#gid=0&range=A2:T2')
  assert.equal(Array.from(item.values[3]).length, 120)
  assert.ok(item.values[3].endsWith('…'))
  assert.ok(!/[\uD800-\uDBFF]$/.test(item.values[3].slice(0, -1)))
  assert.deepEqual(summary, before)
  assert.equal(rows[0][2], answer)
  assert.equal(Presentation.compactExcerpt('  一行\n二行  ', 20), '一行 二行')
  assert.equal(Presentation.compactExcerpt('長文', 1), '…')
})

test('一覧は不正な参照先や行番号を拒否し生成エラーも見落とさない', () => {
  const items = Analysis.aggregate([log(0, { 6: 'エラー' })]).needsReview
  assert.equal(Presentation.compactRows(items, { spreadsheetId: 'id', logSheetId: 12 })[0].values[4], '未確認 / エラー')
  for (const destination of [{ spreadsheetId: 'bad/id', logSheetId: 0 }, { spreadsheetId: 'id', logSheetId: -1 }, { spreadsheetId: 'id', logSheetId: '0' }]) {
    assert.throws(() => Presentation.compactRows(items, destination))
  }
  assert.throws(() => Presentation.compactRows([{ ...items[0], index: -1 }], { spreadsheetId: 'id', logSheetId: 0 }))
  assert.throws(() => Presentation.compactExcerpt('text', 0))
})

test('書式変更は集計の管理範囲に限定し、期間入力・値・validation・行列構造を変更しない', () => {
  const requests = Presentation.dashboardRequests(7)
  const permitted = new Set(['repeatCell', 'mergeCells', 'updateSheetProperties', 'updateDimensionProperties'])
  for (const request of requests) {
    assert.ok(permitted.has(Object.keys(request)[0]))
    if (request.repeatCell) {
      const { range, fields, cell } = request.repeatCell
      assert.equal(range.sheetId, 7)
      assert.ok(range.endColumnIndex <= 12 && range.endRowIndex <= 62)
      assert.ok(!fields.includes('userEnteredValue') && !fields.includes('dataValidation'))
      assert.deepEqual(Object.keys(cell), ['userEnteredFormat'])
    }
    if (request.mergeCells) {
      const { range } = request.mergeCells
      assert.ok(range.startRowIndex >= 1, 'Preserve the marker')
      if (range.startRowIndex < 3) {
        assert.equal(range.endRowIndex, range.startRowIndex + 1, 'Keep separate date controls')
        assert.ok(range.startColumnIndex === 1 || range.startColumnIndex === 3, 'Retain the B2/B3 date anchors')
      }
      assert.ok(range.endColumnIndex <= 12 && range.endRowIndex <= 62)
      assert.ok(range.endRowIndex <= 13 || range.startRowIndex >= 26, 'Reserve chart region')
    }
  }
  for (const chart of Presentation.layout.charts) {
    assert.ok((chart.column - 1) * Presentation.layout.columnWidth + chart.width <= Presentation.layout.columns * Presentation.layout.columnWidth)
    assert.ok(chart.row + chart.height / 26 < 27)
  }
})

test('一覧書式は表示6列と原文行番号の非表示列に収まり、固定行高で巨大セルを防ぐ', () => {
  const requests = Presentation.listRequests(11, 6)
  assert.ok(requests.some(request => request.updateDimensionProperties?.properties.hiddenByUser === true))
  assert.ok(requests.some(request => request.updateDimensionProperties?.range.dimension === 'ROWS' && request.updateDimensionProperties.properties.pixelSize === 80))
  for (const request of requests) {
    if (request.repeatCell) {
      assert.ok(request.repeatCell.range.endRowIndex <= 6)
      assert.ok(request.repeatCell.range.endColumnIndex <= 6)
      assert.ok(!request.repeatCell.fields.includes('userEnteredValue'))
    }
  }
  assert.doesNotThrow(() => Presentation.listRequests(11, 5))
  assert.throws(() => Presentation.listRequests(11, 0))
})

test('セル値は62行12列の固定配置で、期間入力とグラフ予約領域に書き込まない', () => {
  const model = Presentation.dashboardModel(Analysis.aggregate([log(0)]))
  const rows = Presentation.dashboardValues(model)
  assert.equal(rows.length, 62)
  assert.ok(rows.every(row => row.length === 12))
  assert.ok(rows.slice(0, 4).every(row => row.every(value => value === '')))
  assert.ok(rows.slice(13, 25).every(row => row.every(value => value === '')))
  assert.equal(rows[4][0], model.title)
  assert.equal(rows[8][0], '1')
  assert.equal(rows[42][1], model.frequency[0].question)
  assert.equal(rows[42][10], 1)
  assert.equal(rows[42][11], '100.0%')
  assert.match(rows[61][0], /割合は期間内の全質問が分母/)
  const empty = Presentation.dashboardModel(Analysis.aggregate([]))
  assert.equal(Presentation.dashboardValues(empty)[26][0], empty.emptyText)
})

test('要確認の理由は重複を保持し質問数と混同せず、例は新しい順の5件に絞る', () => {
  const logs = Array.from({ length: 7 }, (_, index) => log(index, { 0: `2026-10-0${index + 1} 12:00:00`, 6: index === 0 ? 'エラー' : '完了', 7: index % 2 === 0 ? '要改善' : '判断不可' }))
  logs.push(log(8, { 7: '問題なし' }))
  const summary = Analysis.aggregate(logs)
  const original = structuredClone(summary)
  const model = Presentation.dashboardModel(summary)
  assert.equal(model.tiles[2].value, '7')
  assert.deepEqual(model.reviewBreakdown.map(item => item.count), [1, 4, 3])
  assert.equal(model.reviewExamples.length, 5)
  assert.deepEqual(model.reviewExamples.map(item => item.question), ['質問 6', '質問 5', '質問 4', '質問 3', '質問 2'])
  assert.match(model.insight, /生成異常・完了未確認 1 件/)
  assert.equal(model.categoryBreakdown[0].share, '100.0%')
  assert.equal(model.frequency[0].share, '12.5%', 'frequency denominator is all questions, not top ten')
  assert.match(Presentation.dashboardValues(model)[34][6], /重複あり/)
  assert.deepEqual(summary, original)
})

test('同日の要確認例は行順で新しいものを優先し、理由と空状態を区別する', () => {
  const summary = Analysis.aggregate([log(0, { 6: 'エラー', 7: '要改善' }), log(1, { 7: '判断不可' })])
  const model = Presentation.dashboardModel(summary)
  assert.deepEqual(model.reviewExamples.map(item => item.question), ['質問 1', '質問 0'])
  assert.equal(model.reviewExamples[1].reason, 'エラー / 要改善')
  const completed = Presentation.dashboardValues(Presentation.dashboardModel(Analysis.aggregate([log(0)])))
  const empty = Presentation.dashboardValues(Presentation.dashboardModel(Analysis.aggregate([])))
  assert.equal(completed[55][4], 'この期間に要確認の質問はありません')
  assert.equal(empty[55][4], 'この期間のデータはありません')
})

test('拡張表の結合は重ならず各値を結合の先頭セルへ配置する', () => {
  const summary = Analysis.aggregate(Array.from({ length: 12 }, (_, index) => log(index, { 3: `分類${index}`, 6: 'エラー' })))
  const rows = Presentation.dashboardValues(Presentation.dashboardModel(summary))
  const merged = new Map()
  for (const request of Presentation.dashboardRequests(7)) {
    if (!request.mergeCells) { continue }
    const range = request.mergeCells.range
    for (let row = range.startRowIndex; row < range.endRowIndex; row++) {
      for (let column = range.startColumnIndex; column < range.endColumnIndex; column++) {
        const key = `${row}:${column}`
        assert.ok(!merged.has(key), `merge overlap at ${key}`)
        merged.set(key, true)
        if (row !== range.startRowIndex || column !== range.startColumnIndex) { assert.equal(rows[row][column], '', `value hidden by merge at ${key}`) }
      }
    }
  }
})

test('一覧はマーカーを隠しタイトルと説明を確保してヘッダ5行目まで固定する', () => {
  const requests = Presentation.listRequests(11, 6)
  assert.ok(requests.some(request => request.updateSheetProperties?.properties.gridProperties.frozenRowCount === 5))
  assert.ok(requests.some(request => request.updateDimensionProperties?.range.dimension === 'COLUMNS' && request.updateDimensionProperties.range.startIndex === 6 && request.updateDimensionProperties.range.endIndex === 21 && request.updateDimensionProperties.properties.hiddenByUser))
  assert.ok(requests.some(request => request.mergeCells?.range.startRowIndex === 1 && request.mergeCells.range.endColumnIndex === 6))
})

test('KPIカードは色付きの上罫線で区別し、要確認の数値だけ警告色にする', () => {
  const { colors } = Presentation
  const rgb = hex => ({ red: Number.parseInt(hex.slice(1, 3), 16) / 255, green: Number.parseInt(hex.slice(3, 5), 16) / 255, blue: Number.parseInt(hex.slice(5, 7), 16) / 255 })
  const cells = Presentation.dashboardRequests(7).map(request => request.repeatCell).filter(Boolean)
  const tops = [0, 3, 6, 9].map(column => cells.find(cell => cell.range.startRowIndex === 7 && cell.range.endRowIndex === 8 && cell.range.startColumnIndex === column && cell.cell.userEnteredFormat.borders?.top))
  assert.deepEqual(tops.map(cell => cell.cell.userEnteredFormat.borders.top.color), [colors.accent, colors.accent, colors.danger, colors.attention].map(rgb))
  const values = [0, 3, 6, 9].map(column => cells.find(cell => cell.range.startRowIndex === 8 && cell.range.startColumnIndex === column && cell.cell.userEnteredFormat.textFormat?.fontSize === 34))
  assert.deepEqual(values.map(cell => cell.cell.userEnteredFormat.textFormat.foregroundColor), [colors.ink, colors.ink, colors.danger, colors.ink].map(rgb))
})
