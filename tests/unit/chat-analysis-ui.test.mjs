import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ChatLog from '../../integrations/google-sheets/Core.js'
import ChatAnalysis from '../../integrations/google-sheets/Analysis.js'
import ChatPresentation from '../../integrations/google-sheets/Presentation.js'
import Details from '../../integrations/google-sheets/Details.js'

const source = readFileSync(new URL('../../integrations/google-sheets/AnalysisUI.js', import.meta.url), 'utf8')

function harness(initial = {}) {
  const batches = []
  const sheets = new Map()
  const state = { locked: false, releases: 0, busy: false, flushFails: false, documentLocks: 0, scriptLocks: 0, unbound: false }
  function makeSheet(name, data = []) {
    const sheet = {
      name,
      data: structuredClone(data),
      rows: Math.max(20, data.length),
      columns: 26,
      charts: [],
      links: new Map(),
      hiddenColumns: new Set(),
      rowHeights: new Map(),
      getName: () => name,
      getSheetId: () => [...sheets.keys()].indexOf(name) + 1,
      getMaxRows: () => sheet.rows,
      getMaxColumns: () => sheet.columns,
      getLastRow: () => sheet.data.reduce((last, row, index) => row.some(value => value !== '' && value !== undefined) ? index + 1 : last, 0),
      getRange: (row, column, height = 1, width = 1) => ({
        getValues: () => Array.from({ length: height }, (_, r) => Array.from({ length: width }, (_, c) => sheet.data[row - 1 + r]?.[column - 1 + c] ?? '')),
        createTextFinder: (key) => {
          const finder = {
            matchEntireCell: () => finder,
            useRegularExpression: () => finder,
            findNext: () => sheet.data.slice(row - 1, row - 1 + height).some(values => values[column - 1] === key),
          }
          return finder
        },
        row,
        column,
        height,
        width,
        sheetName: name,
      }),
      setFrozenRows: (value) => { sheet.frozenRows = value },
      hideSheet: () => { sheet.hidden = true },
      getCharts: () => sheet.charts.slice(),
      removeChart: (chart) => { sheet.charts.splice(sheet.charts.indexOf(chart), 1) },
      insertChart: (chart) => { sheet.charts.push(chart) },
      newChart: () => {
        const chart = {}
        const builder = {
          setChartType: (value) => { chart.type = value; return builder },
          addRange: (value) => { chart.range = value; return builder },
          setNumHeaders: (value) => { chart.headers = value; return builder },
          setHiddenDimensionStrategy: (value) => { chart.hiddenStrategy = value; return builder },
          setOption: (key, value) => { chart[key] = value; return builder },
          setPosition: (...values) => { chart.position = values; return builder },
          build: () => chart,
        }
        return builder
      },
    }
    sheets.set(name, sheet)
    return sheet
  }
  for (const [name, rows] of Object.entries(initial)) { makeSheet(name, rows) }
  const spreadsheet = { getId: () => 'sheet-id', getSheetByName: name => sheets.get(name), insertSheet: makeSheet }
  const lock = {
    tryLock: () => { if (state.busy) { return false }; assert.equal(state.locked, false); state.locked = true; return true },
    releaseLock: () => { state.locked = false; state.releases++ },
  }
  const context = vm.createContext({
    ChatLog,
    ChatAnalysis,
    ChatPresentation,
    logRowFormatRequests: Details.logRowFormatRequests,
    Date,
    logSpreadsheet: () => spreadsheet,
    LockService: {
      getScriptLock: () => { state.scriptLocks++; return lock },
      getDocumentLock: () => { state.documentLocks++; return state.unbound ? null : lock },
    },
    SpreadsheetApp: { openById: () => spreadsheet, flush: () => { if (state.flushFails) { throw new Error('flush failed') } } },
    PropertiesService: { getScriptProperties: () => ({ getProperty: key => ({ SPREADSHEET_ID: 'sheet-id', CHAT_LOG_SECRET: 'a'.repeat(32), CHAT_LOG_ENVIRONMENT: 'test' })[key] }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: text => ({ setMimeType: () => JSON.parse(text) }) },
    Charts: { ChartType: { BAR: 'BAR', LINE: 'LINE' }, ChartHiddenDimensionStrategy: { SHOW_BOTH: 'SHOW_BOTH' } },
    Utilities: { formatDate: (date, zone, format) => {
      assert.equal(zone, 'Asia/Tokyo')
      const value = new Date(date.getTime() + 9 * 3600000).toISOString()
      return format === 'yyyy-MM-dd' ? value.slice(0, 10) : value.slice(0, 19).replace('T', ' ')
    } },
    Sheets: { Spreadsheets: { batchUpdate: (body, id) => {
      assert.equal(id, 'sheet-id')
      batches.push(structuredClone(body))
      for (const request of body.requests) {
        if (request.appendDimension) {
          const dim = request.appendDimension
          const sheet = [...sheets.values()].find(item => item.getSheetId() === dim.sheetId)
          if (dim.dimension === 'ROWS') { sheet.rows += dim.length }
          else { sheet.columns += dim.length }
          continue
        }
        if (request.updateSheetProperties) {
          const properties = request.updateSheetProperties.properties
          const sheet = [...sheets.values()].find(item => item.getSheetId() === properties.sheetId)
          if (properties.gridProperties?.frozenRowCount !== undefined) { sheet.frozenRows = properties.gridProperties.frozenRowCount }
          continue
        }
        if (request.updateDimensionProperties) {
          const { range, properties } = request.updateDimensionProperties
          const sheet = [...sheets.values()].find(item => item.getSheetId() === range.sheetId)
          assert.ok(range.endIndex <= (range.dimension === 'ROWS' ? sheet.rows : sheet.columns), 'capacity grows before dimension formatting')
          for (let index = range.startIndex; index < range.endIndex; index++) {
            if (range.dimension === 'COLUMNS' && properties.hiddenByUser) { sheet.hiddenColumns.add(index) }
            if (range.dimension === 'ROWS' && properties.pixelSize) { sheet.rowHeights.set(index, properties.pixelSize) }
          }
          continue
        }
        const update = request.updateCells || request.repeatCell || request.mergeCells || request.unmergeCells || request.setBasicFilter?.filter
        assert.ok(update, `unsupported request ${Object.keys(request)}`)
        const range = update.range
        const sheet = [...sheets.values()].find(item => item.getSheetId() === range.sheetId)
        assert.ok(range.endRowIndex <= sheet.rows, 'capacity grows before a write')
        assert.ok(range.endColumnIndex <= sheet.columns, 'column capacity grows before a write')
        if (request.setBasicFilter) { sheet.filter = range; continue }
        if (!request.updateCells) { continue }
        for (let r = range.startRowIndex; r < range.endRowIndex; r++) {
          for (let c = range.startColumnIndex; c < range.endColumnIndex; c++) {
            const cell = update.rows[r - range.startRowIndex]?.values[c - range.startColumnIndex]
            if (update.fields === 'userEnteredFormat.textFormat.link') {
              sheet.links.set(`${r}:${c}`, cell?.userEnteredFormat?.textFormat?.link?.uri)
              continue
            }
            assert.equal(update.fields, 'userEnteredValue', 'style-only updates must not clear values')
            const value = cell?.userEnteredValue
            if (value && 'formulaValue' in value) {
              assert.equal(sheet.name, '会話ログ')
              assert.equal(c, 5)
              assert.equal(value.formulaValue, `=IF(E${r + 1}<>"",E${r + 1},D${r + 1})`)
            }
            sheet.data[r] ||= []
            sheet.data[r][c] = value?.stringValue ?? value?.numberValue ?? value?.formulaValue ?? ''
          }
        }
      }
    } } },
  })
  vm.runInContext(source, context)
  return { context, sheets, batches, state }
}

function log(query, overrides = {}) {
  const row = ChatLog.row({ createdAt: '2026-10-01T16:00:00.000Z', query, answer: '=SUM(1,2)', status: 'completed', capture: 'full', appId: 'app', requestId: 'r', conversationId: 'c', messageId: 'm' })
  for (const [index, value] of Object.entries(overrides)) { row[index] = value }
  return row
}

test('setup initializes owned sheets once and preserves edited rules and report date controls', () => {
  const h = harness()
  h.context.setupChatAnalysis()
  assert.equal(h.sheets.size, 5)
  assert.equal(h.sheets.get('集計データ').hidden, true)
  const rules = h.sheets.get('分類ルール')
  rules.data[1][3] = '=CUSTOM_CATEGORY'
  const report = h.sheets.get('集計')
  report.data[1][1] = '2026-10-02'
  const before = h.batches.length
  h.context.setupChatAnalysis()
  assert.equal(h.batches.length, before)
  assert.equal(rules.data[1][3], '=CUSTOM_CATEGORY')
  assert.equal(report.data[1][1], '2026-10-02')
  assert.equal(h.state.locked, false)
  assert.equal(h.state.documentLocks, 2)
  assert.equal(h.state.scriptLocks, 0)
})

test('setup refuses incompatible existing sheets before writing or creating anything', () => {
  const h = harness({ 要確認: [['Existing user notes']] })
  assert.throws(() => h.context.setupChatAnalysis(), /列が一致/)
  assert.equal(h.batches.length, 0)
  assert.equal(h.sheets.size, 1)
  assert.equal(h.state.releases, 1)
})

test('analysis requires a bound spreadsheet and never falls back to the ingestion script lock', () => {
  const h = harness()
  h.state.unbound = true
  assert.throws(() => h.context.setupChatAnalysis(), /紐づく/)
  assert.equal(h.batches.length, 0)
  assert.equal(h.state.scriptLocks, 0)
  assert.equal(h.state.releases, 0)
})

test('classification fills reserved metadata, leaves originals and manual corrections intact', () => {
  const h = harness()
  const original = log('料金は？', { 4: '個別対応', 7: '要改善', 8: '人が書いたメモ' })
  assert.equal(h.context.classifyLogRow(original), original)
  h.context.setupChatAnalysis()
  const row = h.context.classifyLogRow(original)
  assert.equal(row[3], '料金')
  assert.equal(row[14], 'pricing')
  assert.match(row[15], /^rules-/)
  for (const index of [1, 2, 4, 7, 8]) { assert.equal(row[index], original[index]) }
  assert.equal(original[3], 'その他')
})

test('reclassification patches only D and O:Q, respects blank row indices, and bounds batches', () => {
  const rows = Array.from({ length: 1001 }, (_, index) => log(`料金${index}`, { 4: '手動', 7: '問題なし', 8: 'メモ' }))
  rows.splice(3, 0, Array.from({ length: 20 }, () => ''))
  const h = harness({ 会話ログ: [ChatLog.headers, ...rows] })
  h.sheets.get('会話ログ').rows = rows.length + 1
  h.context.setupChatAnalysis()
  h.batches.length = 0
  assert.equal(h.context.reclassifyChatLogs(), 1001)
  assert.equal(h.batches.length, 3)
  for (const batch of h.batches) {
    for (const { updateCells: update } of batch.requests) {
      assert.ok(update.rows.length <= 500)
      assert.ok((update.range.startColumnIndex === 3 && update.range.endColumnIndex === 4) || (update.range.startColumnIndex === 14 && update.range.endColumnIndex === 17))
    }
  }
  const actual = h.sheets.get('会話ログ').data
  assert.deepEqual(actual[4], rows[3])
  assert.equal(actual[5][3], '料金')
  assert.equal(actual.at(-1)[3], '料金')
  for (let i = 0; i < rows.length; i++) {
    for (const column of [1, 2, 4, 7, 8]) { assert.equal(actual[i + 1][column], rows[i][column]) }
  }
})

test('invalid rules and lock contention do not mutate stored logs', () => {
  const h = harness({ 会話ログ: [ChatLog.headers, log('料金')] })
  h.context.setupChatAnalysis()
  h.sheets.get('分類ルール').data[1][1] = 'bad priority'
  h.batches.length = 0
  const original = log('料金')
  const fallback = h.context.classifyLogRow(original)
  assert.equal(fallback[1], original[1])
  assert.equal(fallback[2], original[2])
  assert.equal(fallback[3], 'その他')
  assert.equal(fallback[15], 'rules-error')
  assert.throws(() => h.context.reclassifyChatLogs(), /優先順位/)
  assert.equal(h.batches.length, 0)
  assert.equal(h.state.locked, false)
  h.state.busy = true
  assert.throws(() => h.context.refreshChatAnalysis(), /処理中/)
  assert.equal(h.batches.length, 0)
})

test('refresh honors JST period, preserves controls, copies literal texts, clears stale generated rows, and builds charts', () => {
  const h = harness({ 会話ログ: [ChatLog.headers, log('=料金', { 0: '2026-10-02 01:00:00', 4: '=manual', 7: '要改善' }), log('古い質問', { 0: '2026-10-01 01:00:00' })] })
  h.context.setupChatAnalysis()
  const report = h.sheets.get('集計')
  report.data[1][1] = new Date('2026-10-01T15:00:00.000Z')
  report.data[2][1] = '2026-10-02'
  h.sheets.get('その他').data[12] = Array(21).fill('stale')
  h.sheets.get('要確認').data[5] = Array(21).fill('old-wide-report')
  const rawBefore = structuredClone(h.sheets.get('会話ログ').data)
  assert.equal(h.context.refreshChatAnalysis(), 1)
  assert.equal(report.data[1][1].toISOString(), '2026-10-01T15:00:00.000Z')
  assert.equal(report.data[2][1], '2026-10-02')
  assert.equal(report.data[8][0], '1')
  assert.ok(h.sheets.get('その他').data[12].every(value => value === ''))
  const needs = h.sheets.get('要確認').data[5]
  assert.equal(needs[0], '2026-10-02 01:00:00')
  assert.equal(needs[1], '=manual')
  assert.equal(needs[2], '=料金')
  assert.equal(needs[3], '=SUM(1,2)')
  assert.equal(needs[5], '原本', 'adding a styled hyperlink must retain the text')
  assert.equal(needs[6], 2)
  assert.equal(needs[7], rawBefore[1][13])
  assert.ok(needs.slice(8).every(value => value === ''), 'old 21-column raw copies are cleared')
  assert.deepEqual(h.sheets.get('要確認').data[4].slice(0, 6), ChatPresentation.listHeaders)
  assert.equal(h.sheets.get('要確認').filter.startRowIndex, 4)
  assert.equal(h.sheets.get('要確認').filter.endColumnIndex, 8, 'filter sorts must include hidden row and key metadata')
  assert.equal(h.sheets.get('要確認').frozenRows, 5)
  assert.ok(h.sheets.get('要確認').hiddenColumns.has(6))
  assert.ok(h.sheets.get('要確認').hiddenColumns.has(7))
  assert.equal(h.sheets.get('要確認').links.get('5:5'), 'https://docs.google.com/spreadsheets/d/sheet-id/edit#gid=1&range=A2:T2')
  assert.equal(report.charts.length, 2)
  const helper = h.sheets.get('集計データ')
  for (const [index, column, label] of [[0, 1, 'カテゴリ'], [1, 4, '日付']]) {
    const chart = report.charts[index]
    assert.equal(chart.range.sheetName, '集計データ')
    assert.equal(chart.range.row, 3)
    assert.equal(chart.range.column, column)
    assert.equal(helper.data[chart.range.row - 1][column - 1], label)
    assert.equal(chart.hiddenStrategy, 'SHOW_BOTH')
  }
  assert.equal(helper.hidden, true)
  assert.deepEqual(h.sheets.get('会話ログ').data, rawBefore)
  h.context.refreshChatAnalysis()
  assert.equal(report.charts.length, 2)
  assert.equal(report.data[1][1].toISOString(), '2026-10-01T15:00:00.000Z')
  assert.equal(report.data[2][1], '2026-10-02')
  assert.deepEqual(h.sheets.get('会話ログ').data, rawBefore)
})

test('invalid dates fail before any report mutation and release the lock', () => {
  const h = harness({ 会話ログ: [ChatLog.headers, log('料金')] })
  h.context.setupChatAnalysis()
  h.sheets.get('集計').data[1][1] = '2026-02-30'
  h.batches.length = 0
  assert.throws(() => h.context.refreshChatAnalysis(), /集計期間/)
  assert.equal(h.batches.length, 0)
  assert.equal(h.state.locked, false)
})

test('refresh upgrades existing v1 reports by adding hidden chart data without resetting controls or manual edits', () => {
  const h = harness({
    会話ログ: [ChatLog.headers, log('料金', { 4: '特別対応', 7: '要改善', 8: '既存メモ' })],
    分類ルール: [ChatAnalysis.headers, ...ChatAnalysis.defaultRows],
    集計: [['会話分析 v1', '集計'], ['開始日', '2026-10-02'], ['終了日', '2026-10-02'], [], ['指標', '件数'], ['質問数', 999]],
    その他: [['会話分析 v1', 'その他']],
    要確認: [['会話分析 v1', '要確認'], [], [], [], ['会話ログ行', ...ChatLog.headers], [2, ...log('古い表示')]],
  })
  const before = structuredClone(h.sheets.get('会話ログ').data)
  assert.equal(h.context.refreshChatAnalysis(), 1)
  assert.equal(h.sheets.size, 6)
  assert.equal(h.sheets.get('集計データ').hidden, true)
  assert.deepEqual(h.sheets.get('集計データ').data[0], ['会話分析 v1', '集計データ'])
  assert.equal(h.sheets.get('集計').data[1][1], '2026-10-02')
  assert.equal(h.sheets.get('集計').data[2][1], '2026-10-02')
  assert.equal(h.sheets.get('集計').data[8][0], '1')
  assert.equal(h.sheets.get('要確認').data[5][1], '特別対応')
  assert.deepEqual(h.sheets.get('会話ログ').data, before)
})

test('an unrelated sheet using the helper name is rejected before setup or refresh changes anything', () => {
  for (const method of ['setupChatAnalysis', 'refreshChatAnalysis']) {
    const h = harness({
      会話ログ: [ChatLog.headers, log('料金')],
      分類ルール: [ChatAnalysis.headers, ...ChatAnalysis.defaultRows],
      集計: [['会話分析 v1', '集計']],
      その他: [['会話分析 v1', 'その他']],
      要確認: [['会話分析 v1', '要確認']],
      集計データ: [['利用者が作成したデータ']],
    })
    const before = structuredClone([...h.sheets].map(([name, sheet]) => [name, sheet.data]))
    assert.throws(() => h.context[method](), /列が一致/)
    assert.equal(h.batches.length, 0)
    assert.deepEqual([...h.sheets].map(([name, sheet]) => [name, sheet.data]), before)
    assert.equal(h.state.locked, false)
  }
})

test('report growth uses atomic API capacity changes and failing flush still releases the lock', () => {
  const rows = Array.from({ length: 510 }, (_, index) => log(`質問${index}`))
  const h = harness({ 会話ログ: [ChatLog.headers, ...rows] })
  h.context.setupChatAnalysis()
  for (const name of ['集計', 'その他', '要確認', '集計データ']) { h.sheets.get(name).columns = 8 }
  h.batches.length = 0
  h.context.refreshChatAnalysis()
  assert.ok(h.batches.some(batch => batch.requests[0].appendDimension))
  for (const batch of h.batches) {
    for (const request of batch.requests) {
      if (request.updateCells) { assert.ok(request.updateCells.rows.length <= 500) }
    }
  }
  assert.equal(h.sheets.get('その他').data[514][6], 511)
  assert.equal(h.sheets.get('その他').data[514][7], rows[509][13])
  assert.equal(h.sheets.get('その他').columns, 21)
  assert.equal(h.sheets.get('集計').columns, 12)
  assert.equal(h.sheets.get('集計データ').columns, 12)
  h.state.flushFails = true
  assert.throws(() => h.context.reclassifyChatLogs(), /flush failed/)
  assert.equal(h.state.locked, false)
})

test('actual GAS doPost stores a classified record and retries do not replace its manual review', () => {
  const h = harness({ 会話ログ: [ChatLog.headers] })
  h.context.setupChatAnalysis()
  vm.runInContext(readFileSync(new URL('../../integrations/google-sheets/Code.js', import.meta.url), 'utf8'), h.context)
  const record = { schemaVersion: 1, environment: 'test', createdAt: '2026-10-01T16:00:00.000Z', query: '料金を教えて', answer: '=HYPERLINK("https://example.invalid")', status: 'completed', capture: 'full', appId: 'app', requestId: 'r', conversationId: 'c', messageId: 'm' }
  const event = { postData: { contents: JSON.stringify({ secret: 'a'.repeat(32), record }) } }
  assert.equal(h.context.doPost(event).code, 'stored')
  const saved = h.sheets.get('会話ログ').data[1]
  assert.equal(saved[2], record.answer)
  assert.equal(saved[3], '料金')
  assert.equal(saved[14], 'pricing')
  saved[4] = '手動'
  saved[7] = '問題なし'
  saved[8] = '確認済み'
  assert.equal(h.context.doPost(event).code, 'duplicate')
  assert.equal(saved[4], '手動')
  assert.equal(saved[7], '問題なし')
  assert.equal(saved[8], '確認済み')
  assert.equal(h.sheets.get('会話ログ').data.length, 2)
  h.sheets.get('分類ルール').data[1][1] = 'invalid'
  const second = { ...record, messageId: 'm2', requestId: 'r2' }
  assert.equal(h.context.doPost({ postData: { contents: JSON.stringify({ secret: 'a'.repeat(32), record: second }) } }).code, 'stored')
  assert.equal(h.sheets.get('会話ログ').data[2][3], 'その他')
  assert.equal(h.sheets.get('会話ログ').data[2][15], 'rules-error')
  assert.equal(h.state.scriptLocks, 3)
  assert.equal(h.state.documentLocks, 1)
})
