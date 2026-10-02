/* global ChatLog, PropertiesService, SpreadsheetApp, LockService, ContentService, Sheets */
/* exported setupChatLog, doPost, onOpen */
function logSpreadsheet() {
  const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID')
  if (!id) { throw new Error('SPREADSHEET_ID is required') }
  return SpreadsheetApp.openById(id)
}

// GAS invokes these entry points by name.
// eslint-disable-next-line unused-imports/no-unused-vars
function setupChatLog() {
  const spreadsheet = logSpreadsheet()
  spreadsheet.setSpreadsheetTimeZone('Asia/Tokyo')
  let sheet = spreadsheet.getSheetByName('会話ログ')
  if (!sheet) { sheet = spreadsheet.insertSheet('会話ログ') }
  if (sheet.getMaxColumns() < ChatLog.headers.length) { sheet.insertColumnsAfter(sheet.getMaxColumns(), ChatLog.headers.length - sheet.getMaxColumns()) }
  if (sheet.getLastRow() === 0) { sheet.getRange(1, 1, 1, ChatLog.headers.length).setValues([ChatLog.headers]) }
  else if (JSON.stringify(sheet.getRange(1, 1, 1, ChatLog.headers.length).getValues()[0]) !== JSON.stringify(ChatLog.headers)) {
    throw new Error('会話ログの列が一致しません。既存の列を変更せず、別シートで初期化してください。')
  }
  sheet.setFrozenRows(1)
  sheet.getRange(1, 1, 1, ChatLog.headers.length).setFontWeight('bold').setBackground('#e7eef7')
  sheet.setColumnWidths(2, 2, 340)
  sheet.getRange('B:C').setWrap(true)
  sheet.hideColumns(10, ChatLog.headers.length - 9)
  if (!sheet.getFilter()) { sheet.getRange(1, 1, sheet.getMaxRows(), ChatLog.headers.length).createFilter() }
  const review = SpreadsheetApp.newDataValidation().requireValueInList(['未確認', '問題なし', '要改善', '判断不可'], true).setAllowInvalid(false).build()
  sheet.getRange(2, 8, sheet.getMaxRows() - 1, 1).setDataValidation(review)
}

function appendLogRow(spreadsheet, sheet, row) {
  const index = sheet.getLastRow()
  const requests = []
  // Expand and write atomically through the same API, without pending UI writes.
  if (index >= sheet.getMaxRows()) { requests.push({ appendDimension: { sheetId: sheet.getSheetId(), dimension: 'ROWS', length: 100 } }) }
  // Typed stringValue retains leading '=' and apostrophes exactly. Only our
  // effective-category formula is executable; no user text becomes a formula.
  const values = row.map((value, column) => ({ userEnteredValue: column === 5
    ? { formulaValue: `=IF(E${index + 1}<>"",E${index + 1},D${index + 1})` }
    : { stringValue: String(value) } }))
  requests.push({ updateCells: {
    range: { sheetId: sheet.getSheetId(), startRowIndex: index, endRowIndex: index + 1, startColumnIndex: 0, endColumnIndex: row.length },
    rows: [{ values }],
    fields: 'userEnteredValue',
  } })
  Sheets.Spreadsheets.batchUpdate({ requests }, spreadsheet.getId())
}

// eslint-disable-next-line unused-imports/no-unused-vars
function doPost(event) {
  let result
  try {
    const raw = event?.postData?.contents || ''
    if (raw.length > 750000) { return jsonResult({ ok: false, code: 'invalid_record' }) }
    let envelope
    try { envelope = JSON.parse(raw) }
    catch { return jsonResult({ ok: false, code: 'invalid_record' }) }
    const properties = PropertiesService.getScriptProperties()
    const config = { secret: properties.getProperty('CHAT_LOG_SECRET'), environment: properties.getProperty('CHAT_LOG_ENVIRONMENT') }
    // Resolve the spreadsheet only after validation/authentication in receive().
    const lock = LockService.getScriptLock()
    let spreadsheet
    let sheet
    result = ChatLog.receive(envelope, config, {
      lock: () => lock.tryLock(1000),
      unlock: () => lock.releaseLock(),
      exists: (key) => {
        spreadsheet = logSpreadsheet()
        sheet = spreadsheet.getSheetByName('会話ログ')
        if (!sheet || JSON.stringify(sheet.getRange(1, 1, 1, ChatLog.headers.length).getValues()[0]) !== JSON.stringify(ChatLog.headers)) { throw new Error('not initialized') }
        if (sheet.getLastRow() < 2) { return false }
        return !!sheet.getRange(2, 14, sheet.getLastRow() - 1, 1).createTextFinder(key).matchEntireCell(true).useRegularExpression(false).findNext()
      },
      append: row => appendLogRow(spreadsheet, sheet, row),
    })
  }
  catch { result = { ok: false, code: 'storage_unavailable' } }
  return jsonResult(result)
}

function jsonResult(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON)
}

// eslint-disable-next-line unused-imports/no-unused-vars
function onOpen() {
  SpreadsheetApp.getUi().createMenu('会話ログ').addItem('初期設定', 'setupChatLog').addToUi()
}
