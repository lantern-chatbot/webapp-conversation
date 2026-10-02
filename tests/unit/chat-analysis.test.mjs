import assert from 'node:assert/strict'
import { test } from 'node:test'
import Analysis from '../../integrations/google-sheets/Analysis.js'

const ruleRows = [
  [true, 20, 'services', 'サービス', 'ＡＩ,研修\n開発', '採用'],
  [true, 10, 'pricing', '料金', '料金、費用', ''],
  [false, 1, 'disabled', '無効', 'AI', ''],
]
function log(overrides = {}) {
  const row = ['2026-10-02 12:00:00', 'ＡＩ  研修', '回答', 'サービス', '', '古い集計値', '完了', '未確認', '担当メモ', 'conv-1', 'message-1', 'request-1', 'app-1', 'app-1:m:message-1', '', '', '', '', '', 'full']
  for (const [column, value] of Object.entries(overrides)) { row[Number(column)] = value }
  return row
}

test('分類は正規化した含む語のORで一致し、優先順位・除外語・無効行を反映する', () => {
  const parsed = Analysis.parseRules(ruleRows)
  assert.equal(Analysis.classify('ai について', parsed).category, 'サービス')
  assert.equal(Analysis.classify('開発の費用は？', parsed).category, '料金')
  assert.equal(Analysis.classify('AIの採用', parsed).category, 'その他')
  assert.equal(Analysis.classify('こんにちは', parsed).ruleId, '')
  assert.equal(Analysis.classify('研修', parsed).ruleId, 'services')
})

test('同順位は表の上のルールを優先し、ルール版は内容と優先順を反映する', () => {
  const rows = [[true, 1, 'a', 'A', 'AI', ''], [true, 1, 'b', 'B', 'AI', '']]
  const first = Analysis.parseRules(rows)
  assert.equal(Analysis.classify('AI', first).category, 'A')
  assert.equal(first.version, Analysis.parseRules(structuredClone(rows)).version)
  const reversed = Analysis.parseRules([...rows].reverse())
  assert.equal(Analysis.classify('AI', reversed).category, 'B')
  assert.notEqual(first.version, reversed.version)
  assert.notEqual(first.version, Analysis.parseRules([[true, 1, 'a', '修正', 'AI', '']]).version)
})

test('編集ルールのチェックボックスと文字列TRUE/FALSEを受け入れ、空行は無視する', () => {
  const parsed = Analysis.parseRules([['TRUE', '10', 'rule', 'カテゴリ', '相談', ''], ['', '', '', '', '', ''], ['FALSE', 1, 'empty', '休止', '', '']])
  assert.equal(parsed.rules.length, 2)
  assert.equal(Analysis.classify('相談したい', parsed).category, 'カテゴリ')
  assert.equal(Analysis.classify('相談', Analysis.parseRules([])).category, 'その他')
  assert.ok(Analysis.parseRules(Analysis.defaultRows).rules.length > 0)
})

test('不正な分類ルールを黙って適用せず拒否する', () => {
  const base = [true, 1, 'rule', 'カテゴリ', '質問', '']
  for (const [index, value] of [[0, 'yes'], [1, ''], [1, true], [1, 1.5], [1, -1], [2, 'bad id'], [3, ' '], [4, ''], [4, 42], [5, 42]]) {
    const changed = [...base]
    changed[index] = value
    assert.throws(() => Analysis.parseRules([changed]), undefined, `column ${index}: ${value}`)
  }
  assert.throws(() => Analysis.parseRules([base, base]))
  assert.throws(() => Analysis.parseRules([null]))
})

test('再分類は自動列のパッチだけを返し手修正・評価・メモ・原文を変更しない', () => {
  const rows = [log({ 4: '担当者のカテゴリ', 7: '要改善', 8: '担当者のメモ' }), Array(20).fill('')]
  const before = structuredClone(rows)
  const parsed = Analysis.parseRules(ruleRows)
  assert.deepEqual(Analysis.reclassify(rows, parsed), [{ index: 0, autoCategory: 'サービス', ruleId: 'services', version: parsed.version, normalizedQuery: 'ai 研修' }])
  assert.deepEqual(rows, before)
})

test('JST期間は両端を含み、日別・カテゴリ・生成状態・会話を正しく集計する', () => {
  const rows = [
    log({ 0: '2026-10-01 23:59:59' }),
    log({ 0: '2026-10-02 00:00:00', 4: '料金' }),
    log({ 0: '2026-10-03 23:59:59', 1: 'ai 研修', 6: 'エラー' }),
    log({ 0: '2026-10-04 00:00:00' }),
    log({ 12: 'app-2' }),
    log({ 9: '' }),
    Array(20).fill(''),
  ]
  const before = structuredClone(rows)
  const result = Analysis.aggregate(rows, { start: '2026-10-02', end: '2026-10-03' })
  assert.equal(result.questionCount, 4)
  assert.equal(result.conversationCount, 2)
  assert.equal(result.missingConversationCount, 1)
  assert.deepEqual(result.daily, [{ date: '2026-10-02', count: 3 }, { date: '2026-10-03', count: 1 }])
  assert.deepEqual(result.categories, [{ category: 'サービス', count: 3 }, { category: '料金', count: 1 }])
  assert.deepEqual(result.statuses, [{ status: '完了', count: 3 }, { status: 'エラー', count: 1 }])
  assert.deepEqual(result.questions, [{ normalizedQuery: 'ai 研修', example: 'ＡＩ  研修', count: 4 }])
  assert.deepEqual(rows, before)
})

test('その他・要確認一覧は手修正と担当者評価を反映し長い回答を復元する', () => {
  const rows = [
    log({ 3: 'その他', 17: '続き1', 18: '続き2' }),
    log({ 3: 'その他', 4: 'サービス', 7: '要改善' }),
    log({ 7: '判断不可' }),
    log({ 6: '中断・完了未確認' }),
    log({ 7: '問題なし' }),
  ]
  const result = Analysis.aggregate(rows)
  assert.deepEqual(result.other.map(item => item.index), [0])
  assert.equal(result.other[0].answer, '回答続き1続き2')
  assert.deepEqual(result.needsReview.map(item => item.index), [1, 2, 3])
  assert.equal(result.needsReview[0].category, 'サービス')
})

test('空データ・片側だけの期間・閏日を扱う', () => {
  assert.equal(Analysis.aggregate([]).questionCount, 0)
  assert.equal(Analysis.aggregate([log()], { start: '2026-10-03' }).questionCount, 0)
  assert.equal(Analysis.aggregate([log()], { end: '2026-10-02' }).questionCount, 1)
  assert.equal(Analysis.aggregate([log({ 0: '2024-02-29 00:00:00' })], { start: '2024-02-29', end: '2024-02-29' }).questionCount, 1)
})

test('存在しない日付・逆順・不正なログ日時は集計を拒否する', () => {
  for (const start of ['2026-02-29', '2026-04-31', '2026-13-01', '2026-1-01', 'not-a-date', null]) {
    assert.throws(() => Analysis.aggregate([], { start }))
  }
  assert.throws(() => Analysis.aggregate([], { start: '2026-10-03', end: '2026-10-02' }))
  for (const timestamp of ['2026-02-30 12:00:00', '2026-10-02 24:00:00', '2026-10-02T00:00:00.000Z', '']) {
    assert.throws(() => Analysis.aggregate([log({ 0: timestamp })]))
  }
})
