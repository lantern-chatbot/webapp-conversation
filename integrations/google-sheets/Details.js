/* global ChatLog, SpreadsheetApp, HtmlService, logSpreadsheet */
/* exported showSelectedChatLog, formatLogSheet, logRowFormatRequests */
const ChatDetails = (() => {
  const logLayout = {
    columns: [[1, 170], [2, 300], [3, 420], [5, 130], [6, 130], [7, 135], [8, 115], [9, 180]],
    rowHeight: 88,
    headerHeight: 40,
    headerBackground: '#243b53',
    headerText: '#ffffff',
    editableBackground: '#fff9e9',
  }
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' })[character])
  function render(row) {
    const answer = [row[2], row[17], row[18]].map(value => String(value ?? '')).join('')
    const time = Object.prototype.toString.call(row[0]) === '[object Date]'
      ? new Date(row[0].getTime() + 9 * 3600000).toISOString().slice(0, 19).replace('T', ' ')
      : row[0]
    const section = (label, value, className) => `<section class="${className}"><h2>${label}</h2><div class="text">${escapeHtml(value)}</div></section>`
    return `<!doctype html><html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>質問と回答</title><style>
      *{box-sizing:border-box}body{margin:0;background:#f3f6fa;color:#24354b;font:15px/1.8 Arial,"Noto Sans JP",sans-serif}
      main{max-width:900px;margin:auto;padding:24px}header{margin-bottom:20px}h1{font-size:23px;margin:0 0 6px;letter-spacing:.02em}
      .date{color:#60748a;font-size:13px}.badges{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}.badge{background:#e4eef3;border-radius:6px;padding:3px 10px;font-size:12px}
      section{background:white;border:1px solid #dce4ec;border-radius:10px;margin:14px 0;padding:20px 24px}h2{font-size:13px;letter-spacing:.06em;margin:0 0 12px;color:#506781}
      .question{border-left:5px solid #365779}.answer{border-left:5px solid #16877e}.answer h2{color:#147269}.memo{background:#fff9e9;border-color:#f1e0b4}
      .text{white-space:pre-wrap;overflow-wrap:anywhere;word-break:normal}.hint{font-size:12px;color:#637488}.warning{padding:12px 16px;border-radius:8px;background:#fff0d7;color:#865315}
    </style></head><body><main><header><h1>質問と回答</h1><div class="date">${escapeHtml(time)} · 日本時間</div><div class="badges"><span class="badge">カテゴリ：${escapeHtml(row[4] || row[3] || 'その他')}</span><span class="badge">生成：${escapeHtml(row[6])}</span><span class="badge">評価：${escapeHtml(row[7] || '未確認')}</span></div></header>
      ${row[19] && row[19] !== 'full' ? '<p class="warning">回答を完全に記録できていない可能性があります。保存済みの本文を表示しています。</p>' : ''}
      ${section('質問', row[1], 'question')}${section('回答', answer || '（回答は記録されていません）', 'answer')}${section('担当者メモ', row[8] || 'メモはまだありません。', 'memo')}
      <p class="hint">本文は保存した原文です。カテゴリ・評価・メモの編集は「会話ログ」で行えます。生成の完了は、回答の正しさを保証するものではありません。</p>
    </main></body></html>`
  }
  return { escapeHtml, render, logLayout }
})()

// eslint-disable-next-line unused-imports/no-unused-vars
function showSelectedChatLog() {
  const ui = SpreadsheetApp.getUi()
  const active = SpreadsheetApp.getActiveSpreadsheet()
  const spreadsheet = logSpreadsheet()
  const selection = active?.getActiveRange()
  const alert = message => ui.alert('質問と回答', message, ui.ButtonSet.OK)
  if (!active || active.getId() !== spreadsheet.getId() || !selection) {
    alert('会話ログを記録しているスプレッドシートで、質問の行を選択してください。')
    return
  }
  const selectedSheet = selection.getSheet()
  const name = selectedSheet.getName()
  const selectedRow = selection.getRow()
  if (selection.getNumRows() !== 1 || !['会話ログ', 'その他', '要確認'].includes(name)
    || selectedRow < (name === '会話ログ' ? 2 : 6)) {
    alert('「会話ログ」「その他」「要確認」の質問を1行選び、もう一度実行してください。')
    return
  }
  const raw = spreadsheet.getSheetByName('会話ログ')
  if (!raw || JSON.stringify(raw.getRange(1, 1, 1, ChatLog.headers.length).getValues()[0]) !== JSON.stringify(ChatLog.headers)) {
    alert('会話ログの列を確認できませんでした。列を移動せず、管理者に初期設定の確認を依頼してください。')
    return
  }
  const rowNumber = name === '会話ログ' ? selectedRow : selectedSheet.getRange(selectedRow, 7).getValue()
  if (!Number.isSafeInteger(rowNumber) || rowNumber < 2 || rowNumber > raw.getLastRow()) {
    alert('選択した行に質問がありません。集計を更新してから、質問の行を選択してください。')
    return
  }
  let row = raw.getRange(rowNumber, 1, 1, ChatLog.headers.length).getValues()[0]
  const referenceKey = name === '会話ログ' ? '' : String(selectedSheet.getRange(selectedRow, 8).getValue() ?? '')
  // A sheet sort can move the original row after the report was generated.
  // Legacy reports without a saved key retain the existing row-number lookup.
  if (referenceKey && referenceKey !== String(row[13])) {
    const matches = raw.getRange(2, 14, raw.getLastRow() - 1, 1).createTextFinder(referenceKey).matchEntireCell(true).matchCase(true).useRegularExpression(false).findAll()
    if (matches.length !== 1) {
      alert('元の質問を特定できませんでした。集計を更新してから、質問を選択してください。')
      return
    }
    row = raw.getRange(matches[0].getRow(), 1, 1, ChatLog.headers.length).getValues()[0]
    if (String(row[13]) !== referenceKey) {
      alert('会話ログの並び順が変更されました。もう一度実行してください。')
      return
    }
  }
  if (!String(row[1] ?? '').trim()) {
    alert('選択した行に質問がありません。質問のある行を選択してください。')
    return
  }
  ui.showModalDialog(HtmlService.createHtmlOutput(ChatDetails.render(row)).setWidth(880).setHeight(680), '質問と回答')
}

// Formatting is separate from values: appending never changes older rows.
function logRowFormatRequests(sheetId, startRowIndex) {
  const range = { sheetId, startRowIndex, endRowIndex: startRowIndex + 1, startColumnIndex: 0, endColumnIndex: 20 }
  return [
    { updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: startRowIndex, endIndex: startRowIndex + 1 }, properties: { pixelSize: ChatDetails.logLayout.rowHeight }, fields: 'pixelSize' } },
    { repeatCell: { range, cell: { userEnteredFormat: { wrapStrategy: 'CLIP', verticalAlignment: 'TOP', textFormat: { fontFamily: 'Arial', fontSize: 11 }, backgroundColor: { red: 1, green: 1, blue: 1 } } }, fields: 'userEnteredFormat.wrapStrategy,userEnteredFormat.verticalAlignment,userEnteredFormat.textFormat,userEnteredFormat.backgroundColor' } },
    ...[[4, 5], [7, 9]].map(([startColumnIndex, endColumnIndex]) => ({ repeatCell: { range: { ...range, startColumnIndex, endColumnIndex }, cell: { userEnteredFormat: { backgroundColor: { red: 1, green: 0.976, blue: 0.914 } } }, fields: 'userEnteredFormat.backgroundColor' } })),
  ]
}

// eslint-disable-next-line unused-imports/no-unused-vars
function formatLogSheet(sheet) {
  const layout = ChatDetails.logLayout
  sheet.setHiddenGridlines(true)
  sheet.setFrozenRows(1)
  sheet.setFrozenColumns(1)
  sheet.showColumns(1, 9)
  sheet.hideColumns(4)
  sheet.hideColumns(10, 11)
  for (const [column, width] of layout.columns) {
    sheet.setColumnWidth(column, width)
  }
  sheet.setRowHeight(1, layout.headerHeight)
  sheet.getRange(1, 1, 1, 20).setBackground(layout.headerBackground).setFontColor(layout.headerText).setFontWeight('bold').setVerticalAlignment('middle')
  sheet.getRange('E1').setNote('カテゴリを手動で修正する欄です。空欄にすると自動分類を使います。')
  sheet.getRange('H1').setNote('回答を確認した結果を選択してください。生成状態とは別の評価です。')
  sheet.getRange('I1').setNote('改善点・対応内容などを記録できます。')
  if (sheet.getLastRow() > 1) {
    sheet.setRowHeightsForced(2, sheet.getLastRow() - 1, layout.rowHeight)
    sheet.getRange(2, 1, sheet.getLastRow() - 1, 20).setFontFamily('Arial').setFontSize(11).setVerticalAlignment('top').setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP).setBackground('#ffffff')
    sheet.getRange(2, 5, sheet.getLastRow() - 1, 1).setBackground(layout.editableBackground)
    sheet.getRange(2, 8, sheet.getLastRow() - 1, 2).setBackground(layout.editableBackground)
  }
  const specifications = [
    ['=AND(ROW()>1,$B1<>"",$G1<>"完了")', 'G1:G', '#fff0d7', '#865315'],
    ['=AND(ROW()>1,$B1<>"",$H1="要改善")', 'H1:H', '#fde8e7', '#9f3235'],
    ['=AND(ROW()>1,$B1<>"",$H1="問題なし")', 'H1:H', '#def3eb', '#146a50'],
  ]
  const formulas = specifications.map(item => item[0])
  const others = sheet.getConditionalFormatRules().filter(rule => !formulas.includes(String(rule.getBooleanCondition()?.getCriteriaValues()?.[0] ?? '')))
  const rules = specifications.map(([formula, range, background, foreground]) => SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied(formula).setRanges([sheet.getRange(range)]).setBackground(background).setFontColor(foreground).build())
  sheet.setConditionalFormatRules([...others, ...rules])
}

if (typeof module !== 'undefined') { module.exports = { ...ChatDetails, logRowFormatRequests } }
