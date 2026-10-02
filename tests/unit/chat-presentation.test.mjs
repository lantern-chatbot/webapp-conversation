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
      assert.ok(range.endColumnIndex <= 12 && range.endRowIndex <= 44)
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
      assert.ok(range.endColumnIndex <= 12 && range.endRowIndex <= 44)
      assert.ok(range.endRowIndex <= 13 || range.startRowIndex >= 29, 'Reserve chart region')
    }
  }
  for (const chart of Presentation.layout.charts) {
    assert.ok((chart.column - 1) * Presentation.layout.columnWidth + chart.width <= Presentation.layout.columns * Presentation.layout.columnWidth)
    assert.ok(chart.row + chart.height / 22 < 30)
  }
})

test('一覧書式は表示6列と原文行番号の非表示列に収まり、固定行高で巨大セルを防ぐ', () => {
  const requests = Presentation.listRequests(11, 6)
  assert.ok(requests.some(request => request.updateDimensionProperties?.properties.hiddenByUser === true))
  assert.ok(requests.some(request => request.updateDimensionProperties?.range.dimension === 'ROWS' && request.updateDimensionProperties.properties.pixelSize === 64))
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

test('セル値は44行12列の固定配置で、期間入力とグラフ予約領域に書き込まない', () => {
  const model = Presentation.dashboardModel(Analysis.aggregate([log(0)]))
  const rows = Presentation.dashboardValues(model)
  assert.equal(rows.length, 44)
  assert.ok(rows.every(row => row.length === 12))
  assert.ok(rows.slice(0, 4).every(row => row.every(value => value === '')))
  assert.ok(rows.slice(13, 28).every(row => row.every(value => value === '')))
  assert.equal(rows[4][0], model.title)
  assert.equal(rows[8][0], '1')
  assert.equal(rows[33][1], model.frequency[0].question)
  assert.equal(rows[33][7], 1)
  assert.match(rows[29][0], /選択行の詳細/)
  const empty = Presentation.dashboardModel(Analysis.aggregate([]))
  assert.equal(Presentation.dashboardValues(empty)[29][0], empty.emptyText)
})

test('一覧はマーカーを隠しタイトルと説明を確保してヘッダ5行目まで固定する', () => {
  const requests = Presentation.listRequests(11, 6)
  assert.ok(requests.some(request => request.updateSheetProperties?.properties.gridProperties.frozenRowCount === 5))
  assert.ok(requests.some(request => request.updateDimensionProperties?.range.dimension === 'COLUMNS' && request.updateDimensionProperties.range.startIndex === 6 && request.updateDimensionProperties.range.endIndex === 21 && request.updateDimensionProperties.properties.hiddenByUser))
  assert.ok(requests.some(request => request.mergeCells?.range.startRowIndex === 1 && request.mergeCells.range.endColumnIndex === 6))
})
