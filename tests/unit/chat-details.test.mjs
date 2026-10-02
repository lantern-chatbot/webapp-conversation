import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import ChatLog from '../../integrations/google-sheets/Core.js'
import Details from '../../integrations/google-sheets/Details.js'

const source = readFileSync(new URL('../../integrations/google-sheets/Details.js', import.meta.url), 'utf8')
const sample = () => ['2026-10-02 12:00:00', '料金は？', '回答前半', '料金', '担当者カテゴリ', '料金', '完了', '要改善', '確認メモ', 'private-conversation', 'private-message', 'private-request', 'private-app', 'private-key', '', '', '', '回答中間', '回答末尾', 'full']

function runtime({ name = '会話ログ', selectedRow = 2, reference = 3, referenceKey = '', matches = [], movedRow, numRows = 1, headers = ChatLog.headers, row = sample(), sameSpreadsheet = true, noSelection = false, lastRow = 3 } = {}) {
  const alerts = []
  const dialogs = []
  const reads = []
  const raw = {
    getLastRow: () => lastRow,
    getRange: (r, c, h, w) => {
      reads.push([r, c, h, w])
      return {
        getValues: () => [r === 1 ? headers : (movedRow && r === 2 ? movedRow : row)],
        createTextFinder: (key) => {
          assert.equal(c, 14)
          assert.equal(key, referenceKey)
          const finder = { findAll: () => matches.map(index => ({ getRow: () => index })) }
          for (const [method, expected] of [['matchEntireCell', true], ['matchCase', true], ['useRegularExpression', false]]) {
            finder[method] = (value) => { assert.equal(value, expected); return finder }
          }
          return finder
        },
      }
    },
  }
  const selectedSheet = { getName: () => name, getRange: (r, c) => { assert.equal(r, selectedRow); assert.ok([7, 8].includes(c)); return { getValue: () => c === 7 ? reference : referenceKey } } }
  const selection = { getSheet: () => selectedSheet, getRow: () => selectedRow, getNumRows: () => numRows }
  const spreadsheet = { getId: () => 'configured', getSheetByName: n => n === '会話ログ' ? raw : null }
  const context = vm.createContext({
    ChatLog,
    logSpreadsheet: () => spreadsheet,
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ({ getId: () => sameSpreadsheet ? 'configured' : 'different', getActiveRange: () => noSelection ? null : selection }),
      getUi: () => ({ ButtonSet: { OK: 'OK' }, alert: (...args) => alerts.push(args), showModalDialog: (html, title) => dialogs.push({ ...html, title }) }),
    },
    HtmlService: { createHtmlOutput: content => ({ content, setWidth(width) { this.width = width; return this }, setHeight(height) { this.height = height; return this } }) },
  })
  vm.runInContext(source, context)
  return { open: () => context.showSelectedChatLog(), context, reads, dialogs, alerts }
}

test('選択した会話ログの原文と手修正カテゴリを読むだけで詳細表示する', () => {
  const state = runtime()
  state.open()
  assert.equal(state.alerts.length, 0)
  assert.equal(state.dialogs.length, 1)
  assert.deepEqual(state.reads, [[1, 1, 1, 20], [2, 1, 1, 20]])
  const detail = state.dialogs[0]
  assert.equal(detail.width, 880)
  assert.equal(detail.height, 680)
  for (const text of ['料金は？', '回答前半回答中間回答末尾', '担当者カテゴリ', '要改善', '確認メモ']) { assert.ok(detail.content.includes(text)) }
  assert.ok(!detail.content.includes('private-'))
})

test('整理したリストの非表示G列を使いプレビューではなく元ログ全文を開く', () => {
  for (const name of ['その他', '要確認']) {
    const state = runtime({ name, selectedRow: 6, reference: 3 })
    state.open()
    assert.deepEqual(state.reads[1], [3, 1, 1, 20])
    assert.equal(state.dialogs.length, 1)
  }
})

test('並べ替え後は記録キーで元ログを探し直し別の質問を開かない', () => {
  const movedRow = sample()
  movedRow[1] = '並べ替え後の本来の質問'
  movedRow[13] = 'expected-key'
  const state = runtime({ name: '要確認', selectedRow: 6, referenceKey: 'expected-key', movedRow, matches: [2] })
  state.open()
  assert.equal(state.dialogs.length, 1)
  assert.ok(state.dialogs[0].content.includes('並べ替え後の本来の質問'))
  assert.ok(!state.dialogs[0].content.includes('料金は？'))
  for (const options of [{ matches: [] }, { matches: [2, 3] }, { matches: [2], movedRow: sample() }]) {
    const rejected = runtime({ name: '要確認', selectedRow: 6, referenceKey: 'expected-key', ...options })
    rejected.open()
    assert.equal(rejected.dialogs.length, 0)
    assert.equal(rejected.alerts.length, 1)
  }
})

test('ヘッダー・集計タブ・複数行・空欄・範囲外や不正な行番号では詳細を開かない', () => {
  for (const options of [
    { selectedRow: 1 },
    { name: 'その他', selectedRow: 5 },
    { name: '集計', selectedRow: 20 },
    { numRows: 2 },
    { sameSpreadsheet: false },
    { noSelection: true },
    { headers: ['変更された列'] },
    { row: Array(20).fill('') },
    ...['', '3', '=3', 1, 4, -1, NaN, Infinity, 2.5, Number.MAX_SAFE_INTEGER + 1].map(reference => ({ name: '要確認', selectedRow: 6, reference })),
  ]) {
    const state = runtime(options)
    state.open()
    assert.equal(state.dialogs.length, 0, JSON.stringify(options))
    assert.equal(state.alerts.length, 1)
    assert.ok(!state.alerts[0].join(' ').includes('private-'))
  }
})

test('質問・回答・カテゴリ・メモのHTMLやURLはすべて文字列として表示する', () => {
  const row = sample()
  const payload = '</div><script>alert("秘密")</script><img src="https://example.invalid/" onerror=alert(1)>&\''
  for (const column of [0, 1, 2, 3, 4, 6, 7, 8, 17, 18]) { row[column] = payload }
  const result = Details.render(row)
  assert.ok(!result.includes('<script'))
  assert.ok(!result.includes('<img'))
  assert.ok(!result.includes('<a '))
  assert.ok(result.includes('&lt;script&gt;alert(&quot;秘密&quot;)&lt;/script&gt;'))
  assert.ok(result.includes('&amp;&#39;'))
  assert.equal((result.match(/&lt;img/g) || []).length, 9)
})

test('回答の3分割を上限120000文字まで欠落なく再結合し保存状態を説明する', () => {
  const row = sample()
  row[2] = '前'.repeat(40000)
  row[17] = '中'.repeat(40000)
  row[18] = '後'.repeat(40000)
  row[19] = 'size_limit'
  const result = Details.render(row)
  assert.ok(result.includes(row[2] + row[17] + row[18]))
  assert.ok(result.includes('完全に記録できていない可能性'))
  row[4] = ''
  assert.ok(Details.render(row).includes('カテゴリ：料金'))
})

test('追記書式は新規行だけを対象にし値・数式・入力規則を変更しない', () => {
  const requests = Details.logRowFormatRequests(42, 17)
  const sheet = new Map([[16, { value: '=既存', validation: '評価', format: '既存' }], [17, { value: '=IF(E18<>"",E18,D18)', validation: '評価' }]])
  for (const request of requests) {
    const operation = request.repeatCell || request.updateDimensionProperties
    assert.equal(operation.range.sheetId, 42)
    assert.ok(!operation.fields.includes('userEnteredValue'))
    assert.ok(!operation.fields.includes('dataValidation'))
    const start = operation.range.startRowIndex ?? operation.range.startIndex
    const end = operation.range.endRowIndex ?? operation.range.endIndex
    assert.equal(start, 17)
    assert.equal(end, 18)
    for (let index = start; index < end; index++) { sheet.get(index).format = '新規書式' }
  }
  assert.deepEqual(sheet.get(16), { value: '=既存', validation: '評価', format: '既存' })
  assert.equal(sheet.get(17).value, '=IF(E18<>"",E18,D18)')
})

test('原票の再書式化は保存データを変更せず利用者の条件付き書式も保持する', () => {
  const original = sample()
  const snapshot = structuredClone(original)
  const userRule = { getBooleanCondition: () => ({ getCriteriaValues: () => ['=A1="利用者独自"'] }) }
  let rules = [userRule]
  const heights = []
  const range = {}
  for (const method of ['setBackground', 'setFontColor', 'setFontWeight', 'setVerticalAlignment', 'setNote', 'setFontFamily', 'setFontSize', 'setWrapStrategy']) {
    range[method] = () => range
  }
  const sheet = {
    getRange: () => range,
    getLastRow: () => 3,
    getConditionalFormatRules: () => rules,
    setConditionalFormatRules: (values) => { rules = values },
    setRowHeightsForced: (...args) => heights.push(args),
  }
  for (const method of ['setHiddenGridlines', 'setFrozenRows', 'setFrozenColumns', 'showColumns', 'hideColumns', 'setColumnWidth', 'setRowHeight']) { sheet[method] = () => sheet }
  const context = vm.createContext({ SpreadsheetApp: {
    WrapStrategy: { CLIP: 'CLIP' },
    newConditionalFormatRule: () => {
      let formula
      const builder = { whenFormulaSatisfied: (value) => { formula = value; return builder }, build: () => ({ getBooleanCondition: () => ({ getCriteriaValues: () => [formula] }) }) }
      for (const method of ['setRanges', 'setBackground', 'setFontColor']) { builder[method] = () => builder }
      return builder
    },
  } })
  vm.runInContext(source, context)
  context.formatLogSheet(sheet)
  context.formatLogSheet(sheet)
  assert.equal(rules.length, 4)
  assert.equal(rules[0], userRule)
  assert.deepEqual(heights, [[2, 2, 88], [2, 2, 88]])
  assert.deepEqual(original, snapshot)
})
