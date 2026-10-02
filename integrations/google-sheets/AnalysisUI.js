/* global ChatLog, ChatAnalysis, ChatPresentation, logSpreadsheet, Sheets, SpreadsheetApp, LockService, Utilities */
/* exported setupChatAnalysis, classifyLogRow, refreshChatAnalysis, reclassifyChatLogs */
const analysisReportNames = ['集計', 'その他', '要確認']
const analysisDataName = '集計データ'

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
    const schemas = [['分類ルール', ChatAnalysis.headers], ...[...analysisReportNames, analysisDataName].map(name => [name, ['会話分析 v1', name]])]
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
    spreadsheet.getSheetByName(analysisDataName).hideSheet()
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

// Helper data stays separate from visible cells, so growing tables never move charts.
function analysisChartData(result, model) {
  const tables = [
    { column: 0, rows: [['カテゴリ', '件数'], ...model.categories.map(item => [item.category, item.count])] },
    { column: 3, rows: [['日付', '件数'], ...model.daily.map(item => [Date.parse(`${item.date}T00:00:00Z`) / 86400000 + 25569, item.count])] },
    { column: 6, rows: [['生成状態', '件数'], ...result.statuses.map(item => [item.status, item.count])] },
    { column: 9, rows: [['質問（正規化）', '件数', '質問例'], ...result.questions.map(item => [item.normalizedQuery, item.count, item.example])] },
  ]
  const rows = Array.from({ length: Math.max(...tables.map(table => table.rows.length)) }, () => Array.from({ length: 12 }, () => ''))
  for (const table of tables) {
    table.rows.forEach((values, row) => values.forEach((value, column) => { rows[row][table.column + column] = value }))
  }
  return rows
}

function analysisUnmerge(sheet, startRow, endRow, width) {
  return { unmergeCells: { range: { sheetId: sheet.getSheetId(), startRowIndex: startRow, endRowIndex: endRow, startColumnIndex: 0, endColumnIndex: width } } }
}

function analysisCharts(spreadsheet, sheet, data, model) {
  const rgb = hex => ({ red: Number.parseInt(hex.slice(1, 3), 16) / 255, green: Number.parseInt(hex.slice(3, 5), 16) / 255, blue: Number.parseInt(hex.slice(5, 7), 16) / 255 })
  const color = name => ({ rgbColor: rgb(ChatPresentation.colors[name]) })
  const text = (size, bold = false) => ({ fontFamily: 'Arial', fontSize: size, bold, foregroundColorStyle: color('navy') })
  const requests = sheet.getCharts().map(chart => ({ deleteEmbeddedObject: { objectId: chart.getChartId() } }))
  const charts = [
    { count: model.categories.length, column: 0, title: 'カテゴリ別の質問数', type: 'BAR', subtitle: '件数の多い順 / 詳しい割合は下の表へ' },
    { count: model.daily.length, column: 3, title: '日別の質問数', type: 'LINE', subtitle: '質問が記録された日の推移' },
  ]
  charts.forEach(({ count, column, title, type, subtitle }, index) => {
    if (!count) { return }
    const position = ChatPresentation.layout.charts[index]
    const maximum = Math.max(...(type === 'BAR' ? model.categories : model.daily).map(item => item.count))
    const source = offset => ({ sourceRange: { sources: [{ sheetId: data.getSheetId(), startRowIndex: 2, endRowIndex: count + 3, startColumnIndex: column + offset, endColumnIndex: column + offset + 1 }] } })
    const series = {
      series: source(1),
      targetAxis: type === 'BAR' ? 'BOTTOM_AXIS' : 'LEFT_AXIS',
      colorStyle: color(type === 'BAR' ? 'teal' : 'navy'),
      dataLabel: { type: 'DATA', textFormat: text(12, true), placement: type === 'BAR' ? 'OUTSIDE_END' : 'ABOVE' },
    }
    if (type === 'LINE') {
      series.lineStyle = { width: 3, type: 'SOLID' }
      series.pointStyle = { size: 7, shape: 'CIRCLE' }
    }
    else {
      series.styleOverrides = model.categories.flatMap((item, itemIndex) => item.category === 'その他' ? [{ index: itemIndex, colorStyle: color('amber') }] : [])
    }
    requests.push({ addChart: { chart: {
      spec: {
        title,
        subtitle,
        titleTextFormat: text(16, true),
        subtitleTextFormat: { ...text(11), foregroundColorStyle: color('muted') },
        titleTextPosition: { horizontalAlignment: 'LEFT' },
        subtitleTextPosition: { horizontalAlignment: 'LEFT' },
        fontName: 'Arial',
        backgroundColorStyle: color('white'),
        hiddenDimensionStrategy: 'SHOW_ALL',
        basicChart: {
          chartType: type,
          legendPosition: 'NO_LEGEND',
          headerCount: 1,
          axis: [{ position: type === 'BAR' ? 'BOTTOM_AXIS' : 'LEFT_AXIS', title: '質問数（件）', format: text(11), viewWindowOptions: { viewWindowMin: 0, viewWindowMax: maximum + Math.max(1, Math.ceil(maximum * 0.2)), viewWindowMode: 'EXPLICIT' } }],
          domains: [{ domain: source(0) }],
          series: [series],
          ...(type === 'LINE' ? { lineSmoothing: false } : {}),
        },
      },
      border: { colorStyle: color('white') },
      position: { overlayPosition: { anchorCell: { sheetId: sheet.getSheetId(), rowIndex: position.row - 1, columnIndex: position.column - 1 }, offsetXPixels: 0, offsetYPixels: 0, widthPixels: position.width, heightPixels: position.height } },
    } } })
  })
  // Replace charts together so an invalid chart request leaves the existing charts intact.
  if (requests.length) { Sheets.Spreadsheets.batchUpdate({ requests }, spreadsheet.getId()) }
}

function analysisList(spreadsheet, sheet, items, raw, period) {
  const compact = ChatPresentation.compactRows(items.map(item => ({ ...item, date: raw.rows[item.index][0] })), { spreadsheetId: spreadsheet.getId(), logSheetId: raw.sheet.getSheetId() })
  const end = Math.max(sheet.getLastRow(), compact.length + 5, 6)
  Sheets.Spreadsheets.batchUpdate({ requests: [...analysisCapacity(sheet, end, 21), analysisUnmerge(sheet, 1, end, 21)] }, spreadsheet.getId())
  // Clear the previous 21-column report as well as stale compact rows.
  const rows = [[sheet.getName()], [`${items.length} 件 | ${period} | 行を選択 → 会話ログ → 選択行の詳細を開く`], [], ChatPresentation.listHeaders, ...compact.map((item, index) => [...item.values, item.rawRow, raw.rows[items[index].index][13]])]
  analysisWrite(spreadsheet, sheet, 1, rows, 21)
  const requests = ChatPresentation.listRequests(sheet.getSheetId(), end)
  requests.push({ setBasicFilter: { filter: { range: { sheetId: sheet.getSheetId(), startRowIndex: 4, endRowIndex: end, startColumnIndex: 0, endColumnIndex: 8 } } } })
  // Menu details resolve the saved record key even if raw rows were sorted later.
  // The link is a convenience jump to the row at the time of this snapshot.
  for (let offset = 0; offset < compact.length; offset += 500) {
    requests.push({ updateCells: {
      range: { sheetId: sheet.getSheetId(), startRowIndex: offset + 5, endRowIndex: Math.min(offset + 500, compact.length) + 5, startColumnIndex: 5, endColumnIndex: 6 },
      rows: compact.slice(offset, offset + 500).map(item => ({ values: [{ userEnteredFormat: { textFormat: { link: { uri: item.detailUrl } } } }] })),
      fields: 'userEnteredFormat.textFormat.link',
    } })
  }
  Sheets.Spreadsheets.batchUpdate({ requests }, spreadsheet.getId())
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
    const raw = analysisLogRows(spreadsheet)
    const period = { start: analysisDate(dates[0][0]), end: analysisDate(dates[1][0]) }
    const result = ChatAnalysis.aggregate(raw.rows, period)
    const existingData = spreadsheet.getSheetByName(analysisDataName)
    if (existingData) { analysisHeader(existingData, ['会話分析 v1', analysisDataName]) }
    const model = ChatPresentation.dashboardModel(result, { ...period, updatedAt: Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss') })
    // All input validation precedes creating or replacing any report data.
    const data = existingData || spreadsheet.insertSheet(analysisDataName)
    if (!data.getLastRow()) {
      Sheets.Spreadsheets.batchUpdate({ requests: [analysisUpdate(data, 0, 0, [['会話分析 v1', analysisDataName]])] }, spreadsheet.getId())
    }
    analysisWrite(spreadsheet, data, 2, analysisChartData(result, model), 12)
    // Keep real dates (including the year) while using compact, readable chart labels.
    if (model.daily.length) { Sheets.Spreadsheets.batchUpdate({ requests: [{ repeatCell: {
      range: { sheetId: data.getSheetId(), startRowIndex: 3, endRowIndex: model.daily.length + 3, startColumnIndex: 3, endColumnIndex: 4 },
      cell: { userEnteredFormat: { numberFormat: { type: 'DATE', pattern: new Set(model.daily.map(item => item.date.slice(0, 4))).size > 1 ? 'yy/M/d' : 'M/d' } } },
      fields: 'userEnteredFormat.numberFormat',
    } }] }, spreadsheet.getId()) }
    const dashboard = reports[0]
    const end = Math.max(dashboard.getLastRow(), ChatPresentation.layout.lastRow)
    Sheets.Spreadsheets.batchUpdate({ requests: [...analysisCapacity(dashboard, end, 12), analysisUnmerge(dashboard, 1, end, 12)] }, spreadsheet.getId())
    analysisWrite(spreadsheet, dashboard, 4, ChatPresentation.dashboardValues(model).slice(4), 12)
    Sheets.Spreadsheets.batchUpdate({ requests: [
      analysisUpdate(dashboard, 1, 0, [['開始日'], ['終了日']]),
      analysisUpdate(dashboard, 1, 3, [['日付を入力して「会話ログ → 集計を更新」'], ['空欄なら全期間（日本時間）']], 3, 9),
      ...ChatPresentation.dashboardRequests(dashboard.getSheetId()),
    ] }, spreadsheet.getId())
    const caption = `${period.start || '記録開始'} 〜 ${period.end || '最新'}`
    analysisList(spreadsheet, reports[1], result.other, raw, caption)
    analysisList(spreadsheet, reports[2], result.needsReview, raw, caption)
    SpreadsheetApp.flush()
    analysisCharts(spreadsheet, dashboard, data, model)
    data.hideSheet()
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
