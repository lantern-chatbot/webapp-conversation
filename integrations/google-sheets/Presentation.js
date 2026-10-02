/* Pure presentation model and bounded Google Sheets formatting requests. */
const ChatPresentation = (() => {
  const colors = { navy: '#14263d', teal: '#087f8c', amber: '#b56a10', lightTeal: '#eaf6f5', background: '#f5f7fb', muted: '#63758a', white: '#ffffff', line: '#dce4ee' }
  const layout = {
    columns: 12,
    columnWidth: 80,
    lastRow: 44,
    titleRow: 5,
    subtitleRow: 6,
    tileLabelRow: 8,
    tileValueRow: 9,
    tileContextRow: 11,
    charts: [{ row: 14, column: 1, width: 470, height: 280 }, { row: 14, column: 7, width: 470, height: 280 }],
    frequencyRow: 32,
    statusRow: 32,
    tableHeaderRow: 33,
    tableDataRow: 34,
    listHeaderRow: 5,
    listDataRow: 6,
  }
  const listHeaders = ['日時', 'カテゴリ', '質問', '回答（抜粋）', '確認状況', '原本']
  function compactExcerpt(value, maxChars = 100) {
    if (!Number.isSafeInteger(maxChars) || maxChars < 1) { throw new Error('抜粋文字数が不正です') }
    const chars = Array.from(String(value ?? '').replace(/\s+/g, ' ').trim())
    return chars.length <= maxChars ? chars.join('') : `${chars.slice(0, maxChars - 1).join('')}…`
  }
  function dashboardModel(summary, { start = '', end = '', updatedAt = '' } = {}) {
    const count = summary.questionCount
    const otherCount = summary.other.length
    const categories = summary.categories.slice(0, 8).map(item => ({ ...item }))
    if (summary.categories.length > 8) {
      let category = '集計上のまとめ（9位以下）'
      while (summary.categories.some(item => item.category === category)) { category += ' ※' }
      categories.push({ category, count: summary.categories.slice(8).reduce((sum, item) => sum + item.count, 0) })
    }
    return {
      title: '会話ダッシュボード',
      subtitle: `対象期間：${start || '記録開始'} 〜 ${end || '最新'}${updatedAt ? ` | 更新：${updatedAt}` : ''}`,
      tiles: [
        { label: '質問数', value: String(count), context: '期間内の質問・回答の件数', tone: 'navy' },
        { label: '会話数', value: String(summary.conversationCount), context: summary.missingConversationCount ? `会話IDなし ${summary.missingConversationCount} 件を除く` : '会話IDごとの件数', tone: 'teal' },
        { label: '要確認', value: String(summary.needsReview.length), context: '生成異常・要改善・判断不可', tone: 'amber' },
        { label: 'その他の割合', value: count ? `${(otherCount / count * 100).toFixed(1)}%` : '—', context: `分類ルール見直しの候補 ${otherCount} 件`, tone: 'teal' },
      ],
      categories,
      daily: summary.daily.map(item => ({ ...item })),
      frequency: summary.questions.slice(0, 10).map((item, index) => ({ rank: index + 1, question: compactExcerpt(item.example, 80), count: item.count })),
      statuses: summary.statuses.map(item => ({ ...item })),
      emptyText: count ? '' : 'この期間の会話はまだありません。期間を変更するか、ログの記録後に集計を更新してください。',
    }
  }
  function compactRows(items, { spreadsheetId, logSheetId }) {
    if (typeof spreadsheetId !== 'string' || !/^[\w-]+$/.test(spreadsheetId) || !Number.isSafeInteger(logSheetId) || logSheetId < 0) { throw new Error('ログ参照先が不正です') }
    return items.map((item) => {
      if (!Number.isSafeInteger(item.index) || item.index < 0 || !Number.isSafeInteger(item.index + 2)) { throw new Error('ログ行番号が不正です') }
      const rawRow = item.index + 2
      const review = item.status !== '完了' ? `${item.review} / ${item.status}` : item.review
      return {
        values: [String(item.date), String(item.category), compactExcerpt(item.query, 80), compactExcerpt(item.answer, 120), String(review), '原本'],
        rawRow,
        detailUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=${logSheetId}&range=A${rawRow}:T${rawRow}`,
      }
    })
  }
  function dashboardValues(model) {
    const rows = Array.from({ length: layout.lastRow }, () => Array(layout.columns).fill(''))
    rows[4][0] = model.title
    rows[5][0] = model.subtitle
    model.tiles.forEach((tile, index) => {
      rows[7][index * 3] = tile.label
      rows[8][index * 3] = tile.value
      rows[10][index * 3] = tile.context
    })
    rows[29][0] = model.emptyText || '質問・回答の全文は一覧で行を選び、メニューの「選択行の詳細を開く」で確認できます。'
    rows[31][0] = 'よくある質問 / TOP 10'
    rows[31][8] = '生成状態'
    rows[32][0] = '順位'
    rows[32][1] = '質問'
    rows[32][7] = '件数'
    rows[32][8] = '状態'
    rows[32][11] = '件数'
    model.frequency.slice(0, 10).forEach((item, index) => {
      rows[index + 33][0] = item.rank
      rows[index + 33][1] = item.question
      rows[index + 33][7] = item.count
    })
    const statuses = model.statuses.slice(0, 6)
    if (model.statuses.length > 6) {
      statuses[5] = { status: 'その他の生成状態', count: model.statuses.slice(5).reduce((sum, item) => sum + item.count, 0) }
    }
    statuses.forEach((item, index) => {
      rows[index + 33][8] = item.status
      rows[index + 33][11] = item.count
    })
    rows[43][0] = '頻出質問は上位10件を表示。全件は非表示の「集計データ」シートで確認できます。'
    return rows
  }
  const rgb = hex => ({ red: Number.parseInt(hex.slice(1, 3), 16) / 255, green: Number.parseInt(hex.slice(3, 5), 16) / 255, blue: Number.parseInt(hex.slice(5, 7), 16) / 255 })
  const grid = (sheetId, r1, r2, c1 = 0, c2 = 12) => ({ sheetId, startRowIndex: r1, endRowIndex: r2, startColumnIndex: c1, endColumnIndex: c2 })
  function format(range, value) {
    return { repeatCell: { range, cell: { userEnteredFormat: value }, fields: Object.keys(value).map(key => `userEnteredFormat.${key}`).join(',') } }
  }
  const merge = range => ({ mergeCells: { range, mergeType: 'MERGE_ALL' } })
  const dimension = (sheetId, axis, start, end, properties) => ({ updateDimensionProperties: { range: { sheetId, dimension: axis, startIndex: start, endIndex: end }, properties, fields: Object.keys(properties).join(',') } })
  function sheetStyle(sheetId, frozenRows, color) {
    return { updateSheetProperties: { properties: { sheetId, gridProperties: { hideGridlines: true, frozenRowCount: frozenRows, frozenColumnCount: 0 }, tabColorStyle: { rgbColor: rgb(color) } }, fields: 'gridProperties.hideGridlines,gridProperties.frozenRowCount,gridProperties.frozenColumnCount,tabColorStyle' } }
  }
  function dashboardRequests(sheetId) {
    const requests = [
      sheetStyle(sheetId, 0, colors.teal),
      dimension(sheetId, 'COLUMNS', 0, 12, { pixelSize: 80 }),
      dimension(sheetId, 'ROWS', 0, 44, { pixelSize: 22 }),
      dimension(sheetId, 'ROWS', 0, 1, { hiddenByUser: true }),
      format(grid(sheetId, 1, 44), { backgroundColor: rgb(colors.background), textFormat: { fontFamily: 'Arial', fontSize: 10, foregroundColor: rgb(colors.navy) }, verticalAlignment: 'MIDDLE', wrapStrategy: 'CLIP' }),
      // B2/B3 remain date anchors; the adapter preserves their values and validation.
      merge(grid(sheetId, 1, 2, 1, 3)),
      merge(grid(sheetId, 2, 3, 1, 3)),
      merge(grid(sheetId, 1, 2, 3, 12)),
      merge(grid(sheetId, 2, 3, 3, 12)),
      format(grid(sheetId, 1, 3, 1, 3), { backgroundColor: rgb(colors.white), numberFormat: { type: 'DATE', pattern: 'yyyy-mm-dd' }, textFormat: { foregroundColor: rgb(colors.teal), bold: true, fontSize: 11 } }),
      dimension(sheetId, 'ROWS', 1, 3, { pixelSize: 28 }),
      merge(grid(sheetId, 4, 5)),
      merge(grid(sheetId, 5, 6)),
      dimension(sheetId, 'ROWS', 4, 5, { pixelSize: 44 }),
      format(grid(sheetId, 4, 5), { backgroundColor: rgb(colors.navy), textFormat: { bold: true, fontSize: 23, foregroundColor: rgb(colors.white) } }),
      format(grid(sheetId, 5, 6), { textFormat: { fontSize: 10, foregroundColor: rgb(colors.muted) } }),
      dimension(sheetId, 'ROWS', 7, 8, { pixelSize: 30 }),
      dimension(sheetId, 'ROWS', 8, 10, { pixelSize: 28 }),
      dimension(sheetId, 'ROWS', 10, 11, { pixelSize: 30 }),
    ]
    ;['navy', 'teal', 'amber', 'teal'].forEach((tone, index) => {
      const column = index * 3
      requests.push(
        format(grid(sheetId, 7, 11, column, column + 3), { backgroundColor: rgb(index === 2 ? '#fff4e5' : colors.white), horizontalAlignment: 'CENTER' }),
        merge(grid(sheetId, 7, 8, column, column + 3)),
        merge(grid(sheetId, 8, 10, column, column + 3)),
        merge(grid(sheetId, 10, 11, column, column + 3)),
        format(grid(sheetId, 7, 8, column, column + 3), { textFormat: { fontSize: 11, bold: true, foregroundColor: rgb(colors[tone]) } }),
        format(grid(sheetId, 8, 10, column, column + 3), { textFormat: { fontSize: 30, bold: true, foregroundColor: rgb(colors[tone]) } }),
        format(grid(sheetId, 10, 11, column, column + 3), { textFormat: { fontSize: 9, foregroundColor: rgb(colors.muted) } }),
      )
    })
    requests.push(
      merge(grid(sheetId, 29, 30)),
      format(grid(sheetId, 29, 30), { textFormat: { fontSize: 10, foregroundColor: rgb(colors.muted) } }),
      merge(grid(sheetId, 31, 32, 0, 8)),
      merge(grid(sheetId, 31, 32, 8, 12)),
      dimension(sheetId, 'ROWS', 31, 33, { pixelSize: 30 }),
      format(grid(sheetId, 31, 32), { backgroundColor: rgb(colors.navy), textFormat: { fontSize: 12, bold: true, foregroundColor: rgb(colors.white) } }),
      format(grid(sheetId, 32, 33), { backgroundColor: rgb(colors.lightTeal), textFormat: { bold: true, foregroundColor: rgb(colors.teal) } }),
      dimension(sheetId, 'ROWS', 33, 43, { pixelSize: 40 }),
      merge(grid(sheetId, 32, 33, 1, 7)),
      merge(grid(sheetId, 32, 33, 8, 11)),
      format(grid(sheetId, 33, 43, 0, 8), { wrapStrategy: 'WRAP' }),
      merge(grid(sheetId, 43, 44)),
      format(grid(sheetId, 43, 44), { textFormat: { fontSize: 9, foregroundColor: rgb(colors.muted) } }),
    )
    for (let row = 33; row < 43; row++) {
      requests.push(merge(grid(sheetId, row, row + 1, 1, 7)))
      if (row < 39) { requests.push(merge(grid(sheetId, row, row + 1, 8, 11))) }
      if (row % 2 === 1) { requests.push(format(grid(sheetId, row, row + 1), { backgroundColor: rgb(colors.white) })) }
    }
    return requests
  }
  function listRequests(sheetId, lastRow) {
    if (!Number.isSafeInteger(lastRow) || lastRow < 5) { throw new Error('一覧の最終行が不正です') }
    const requests = [
      sheetStyle(sheetId, 5, colors.amber),
      dimension(sheetId, 'COLUMNS', 6, 21, { hiddenByUser: true }),
      dimension(sheetId, 'ROWS', 0, 1, { hiddenByUser: true }),
      format(grid(sheetId, 1, lastRow, 0, 6), { backgroundColor: rgb(colors.white), textFormat: { fontFamily: 'Arial', fontSize: 10, foregroundColor: rgb(colors.navy) }, verticalAlignment: 'MIDDLE', wrapStrategy: 'WRAP' }),
      merge(grid(sheetId, 1, 2, 0, 6)),
      merge(grid(sheetId, 2, 3, 0, 6)),
      dimension(sheetId, 'ROWS', 1, 2, { pixelSize: 44 }),
      dimension(sheetId, 'ROWS', 2, 3, { pixelSize: 32 }),
      dimension(sheetId, 'ROWS', 3, 4, { pixelSize: 16 }),
      dimension(sheetId, 'ROWS', 4, 5, { pixelSize: 36 }),
      format(grid(sheetId, 1, 2, 0, 6), { backgroundColor: rgb(colors.navy), textFormat: { bold: true, fontSize: 22, foregroundColor: rgb(colors.white) } }),
      format(grid(sheetId, 2, 3, 0, 6), { textFormat: { fontSize: 10, foregroundColor: rgb(colors.muted) } }),
      format(grid(sheetId, 4, 5, 0, 6), { backgroundColor: rgb(colors.lightTeal), textFormat: { bold: true, foregroundColor: rgb(colors.teal) } }),
    ]
    ;[112, 112, 245, 325, 160, 64].forEach((width, column) => requests.push(dimension(sheetId, 'COLUMNS', column, column + 1, { pixelSize: width })))
    if (lastRow > 5) {
      requests.push(
        dimension(sheetId, 'ROWS', 5, lastRow, { pixelSize: 64 }),
        format(grid(sheetId, 5, lastRow, 4, 5), { backgroundColor: rgb('#fff4e5'), textFormat: { fontSize: 10, foregroundColor: rgb(colors.amber) } }),
        format(grid(sheetId, 5, lastRow, 5, 6), { textFormat: { fontSize: 10, foregroundColor: rgb(colors.teal), underline: true }, horizontalAlignment: 'CENTER' }),
      )
    }
    return requests
  }
  return { colors, layout, listHeaders, compactExcerpt, dashboardModel, dashboardValues, compactRows, dashboardRequests, listRequests }
})()

if (typeof module !== 'undefined') { module.exports = ChatPresentation }
