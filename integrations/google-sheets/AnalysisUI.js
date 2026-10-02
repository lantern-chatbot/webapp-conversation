/* global ChatLog, ChatAnalysis, logSpreadsheet, Sheets, SpreadsheetApp, LockService, Utilities, Charts */
/* exported setupChatAnalysis, classifyLogRow, refreshChatAnalysis, reclassifyChatLogs */
const analysisReportNames = ['集計', 'その他', '要確認']

function analysisHeader(sheet, expected) {
  if (sheet.getLastRow() && JSON.stringify(sheet.getRange(1, 1, 1, expected.length).getValues()[0]) !== JSON.stringify(expected)) {
    throw new Error(`${sheet.getName()}の列が一致しません。既存データを変更せず、シート名を確認してください。`)
  }
}

function analysisCapacity(sheet, rows, columns) {
  const requests = []
  if (rows > sheet.getMaxRows()) { requests.push({ appendDimension: { sheetId: sheet.getSheetId(), dimension: 'ROWS', length: rows - sheet.getMaxRows() } }) }
  if (columns > sheet.getMaxColumns()) { requests.push({ appendDimension: { sheetId: sheet.getSheetId(), dimension: 'COLUMNS', length: columns - sheet.getMaxColumns() } }) }
  return requests
}

function analysisUpdate(sheet, startRow, startColumn, rows, endRow = startRow + rows.length, width = Math.max(...rows.map(row => row.length))) {
  return { updateCells: {
    range: { sheetId: sheet.getSheetId(), startRowIndex: startRow, endRowIndex: endRow, startColumnIndex: startColumn, endColumnIndex: startColumn + width },
    rows: rows.map(row => ({ values: row.map(value => ({ userEnteredValue: typeof value === 'number' ? { numberValue: value } : { stringValue: String(value ?? '') } })) })),
    fields: 'userEnteredValue',
  } }
}

function analysisWrite(spreadsheet, sheet, startRow, rows, width) {
  const end = Math.max(sheet.getLastRow(), startRow + rows.length)
  const capacity = analysisCapacity(sheet, end, width)
  for (let offset = 0; startRow + offset < end; offset += 500) {
    const values = rows.slice(offset, offset + 500)
    Sheets.Spreadsheets.batchUpdate({ requests: [...(offset === 0 ? capacity : []), analysisUpdate(sheet, startRow + offset, 0, values, Math.min(startRow + offset + 500, end), width)] }, spreadsheet.getId())
  }
}

function analysisLock(callback) {
  // Manual analysis is bound to this spreadsheet and must not block ingestion.
  const lock = LockService.getDocumentLock()
  if (!lock) { throw new Error('スプレッドシートに紐づく Apps Script から実行してください。') }
  if (!lock.tryLock(1000)) { throw new Error('ログの記録・分析処理中です。少し待って再実行してください。') }
  try { return callback() }
  finally {
    try { SpreadsheetApp.flush() }
    finally { lock.releaseLock() }
  }
}

function analysisDate(value) {
  if (value instanceof Date) { return Utilities.formatDate(value, 'Asia/Tokyo', 'yyyy-MM-dd') }
  return String(value || '').trim()
}

function analysisRules(spreadsheet) {
  const sheet = spreadsheet.getSheetByName('分類ルール')
  if (!sheet) { throw new Error('先に初期設定を実行してください。') }
  analysisHeader(sheet, ChatAnalysis.headers)
  const rows = sheet.getLastRow() > 1 ? sheet.getRange(2, 1, sheet.getLastRow() - 1, ChatAnalysis.headers.length).getValues() : []
  return ChatAnalysis.parseRules(rows)
}

function analysisLogRows(spreadsheet) {
  const sheet = spreadsheet.getSheetByName('会話ログ')
  if (!sheet) { throw new Error('会話ログがありません。') }
  analysisHeader(sheet, ChatLog.headers)
  const rows = sheet.getLastRow() > 1 ? sheet.getRange(2, 1, sheet.getLastRow() - 1, ChatLog.headers.length).getValues() : []
  for (const row of rows) {
    if (row[0] instanceof Date) { row[0] = Utilities.formatDate(row[0], 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss') }
  }
  return { sheet, rows }
}

// eslint-disable-next-line unused-imports/no-unused-vars
function setupChatAnalysis() {
  return analysisLock(() => {
    const spreadsheet = logSpreadsheet()
    const schemas = [['分類ルール', ChatAnalysis.headers], ...analysisReportNames.map(name => [name, ['会話分析 v1', name]])]
    // Validate every destination before creating or changing any of them.
    for (const [name, header] of schemas) {
      const sheet = spreadsheet.getSheetByName(name)
      if (sheet) { analysisHeader(sheet, header) }
    }
    for (const [name, header] of schemas) {
      const sheet = spreadsheet.getSheetByName(name) || spreadsheet.insertSheet(name)
      if (sheet.getLastRow()) { continue }
      SpreadsheetApp.flush()
      const rows = name === '分類ルール' ? [header, ...ChatAnalysis.defaultRows] : [header]
      const requests = [...analysisCapacity(sheet, Math.max(rows.length, 5), header.length), analysisUpdate(sheet, 0, 0, rows)]
      if (name === '集計') { requests.push(analysisUpdate(sheet, 1, 0, [['開始日（空欄は全期間）'], ['終了日（空欄は全期間）']])) }
      Sheets.Spreadsheets.batchUpdate({ requests }, spreadsheet.getId())
      sheet.setFrozenRows(name === '分類ルール' ? 1 : 5)
    }
  })
}

// eslint-disable-next-line unused-imports/no-unused-vars
function classifyLogRow(row) {
  const next = [...row]
  try {
    const spreadsheet = logSpreadsheet()
    if (!spreadsheet.getSheetByName('分類ルール')) { return row }
    const result = ChatAnalysis.classify(row[1], analysisRules(spreadsheet))
    next[3] = result.category
    next[14] = result.ruleId
    next[15] = result.version
  }
  catch {
    // Preserve the conversation even when an operator is editing invalid rules.
    next[3] = 'その他'
    next[14] = ''
    next[15] = 'rules-error'
  }
  next[16] = ChatAnalysis.normalize(row[1])
  return next
}

function analysisSummary(result) {
  const rows = [
    ['指標', '件数'],
    ['質問数', result.questionCount],
    ['会話数', result.conversationCount],
    ['会話ID不明', result.missingConversationCount],
    [],
    ['カテゴリ', '件数'],
    ...result.categories.map(item => [item.category, item.count]),
    [],
    ['日付', '件数'],
    ...result.daily.map(item => [item.date, item.count]),
    [],
    ['生成状態', '件数'],
    ...result.statuses.map(item => [item.status, item.count]),
    [],
    ['同じ質問（表記を正規化）', '件数', '質問例'],
    ...result.questions.map(item => [item.normalizedQuery, item.count, item.example]),
  ]
  return rows
}

function analysisCharts(sheet, result) {
  for (const chart of sheet.getCharts()) { sheet.removeChart(chart) }
  const categoryRow = 10
  const dailyRow = categoryRow + result.categories.length + 2
  for (const [count, row, title, type, position] of [
    [result.categories.length, categoryRow, 'カテゴリ別の質問数', Charts.ChartType.BAR, 5],
    [result.daily.length, dailyRow, '日別の質問数', Charts.ChartType.LINE, 22],
  ]) {
    if (!count) { continue }
    const chart = sheet.newChart().setChartType(type).addRange(sheet.getRange(row, 1, count + 1, 2)).setNumHeaders(1).setOption('title', title).setPosition(position, 5, 0, 0).build()
    sheet.insertChart(chart)
  }
}

// eslint-disable-next-line unused-imports/no-unused-vars
function refreshChatAnalysis() {
  return analysisLock(() => {
    const spreadsheet = logSpreadsheet()
    const reports = analysisReportNames.map((name) => {
      const sheet = spreadsheet.getSheetByName(name)
      if (!sheet) { throw new Error('先に初期設定を実行してください。') }
      analysisHeader(sheet, ['会話分析 v1', name])
      return sheet
    })
    const dates = reports[0].getRange(2, 2, 2, 1).getValues()
    const { rows } = analysisLogRows(spreadsheet)
    const result = ChatAnalysis.aggregate(rows, { start: analysisDate(dates[0][0]), end: analysisDate(dates[1][0]) })
    analysisWrite(spreadsheet, reports[0], 4, analysisSummary(result), 3)
    const listRows = items => [['会話ログ行', ...ChatLog.headers], ...items.map(item => [item.index + 2, ...rows[item.index]])]
    analysisWrite(spreadsheet, reports[1], 4, listRows(result.other), ChatLog.headers.length + 1)
    analysisWrite(spreadsheet, reports[2], 4, listRows(result.needsReview), ChatLog.headers.length + 1)
    SpreadsheetApp.flush()
    analysisCharts(reports[0], result)
    return result.questionCount
  })
}

// eslint-disable-next-line unused-imports/no-unused-vars
function reclassifyChatLogs() {
  return analysisLock(() => {
    const spreadsheet = logSpreadsheet()
    const parsed = analysisRules(spreadsheet)
    const { sheet, rows } = analysisLogRows(spreadsheet)
    const patches = ChatAnalysis.reclassify(rows, parsed)
    for (let start = 0; start < patches.length; start += 500) {
      const chunk = patches.slice(start, start + 500)
      const runs = []
      for (const item of chunk) {
        const previous = runs[runs.length - 1]
        if (previous && previous[previous.length - 1].index + 1 === item.index) { previous.push(item) }
        else { runs.push([item]) }
      }
      const requests = runs.flatMap(run => [
        analysisUpdate(sheet, run[0].index + 1, 3, run.map(item => [item.autoCategory])),
        analysisUpdate(sheet, run[0].index + 1, 14, run.map(item => [item.ruleId, item.version, item.normalizedQuery])),
      ])
      Sheets.Spreadsheets.batchUpdate({ requests }, spreadsheet.getId())
    }
    return patches.length
  })
}
