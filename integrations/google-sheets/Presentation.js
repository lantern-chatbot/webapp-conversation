/* Pure presentation model and bounded Google Sheets formatting requests. */
const ChatPresentation = (() => {
  const colors = { ink: '#212529', accent: '#4c6ef5', attention: '#e8590c', danger: '#e03131', accentLight: '#edf2ff', background: '#ffffff', card: '#f8f9fa', muted: '#868e96', subtle: '#adb5bd', white: '#ffffff', line: '#dee2e6' }
  const layout = {
    columns: 12,
    columnWidth: 122,
    lastRow: 62,
    titleRow: 5,
    subtitleRow: 6,
    tileLabelRow: 8,
    tileValueRow: 9,
    tileContextRow: 11,
    charts: [{ row: 14, column: 1, width: 720, height: 300 }, { row: 14, column: 7, width: 720, height: 300 }],
    insightRow: 27,
    categoryRow: 29,
    frequencyRow: 41,
    statusRow: 29,
    tableHeaderRow: 42,
    tableDataRow: 43,
    reviewRow: 54,
    reviewDataRow: 56,
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
    const share = value => count ? `${(value / count * 100).toFixed(1)}%` : '—'
    const generationIssues = summary.statuses.filter(item => item.status !== '完了').reduce((sum, item) => sum + item.count, 0)
    const reviewBreakdown = [
      { reason: '生成異常・完了未確認', count: generationIssues },
      { reason: '担当者評価：要改善', count: summary.needsReview.filter(item => item.review === '要改善').length },
      { reason: '担当者評価：判断不可', count: summary.needsReview.filter(item => item.review === '判断不可').length },
    ]
    const reviewExamples = [...summary.needsReview].sort((a, b) => b.date.localeCompare(a.date) || b.index - a.index).slice(0, 5).map(item => ({
      date: item.date,
      category: item.category,
      question: compactExcerpt(item.query, 70),
      reason: [item.status !== '完了' ? item.status : '', ['要改善', '判断不可'].includes(item.review) ? item.review : ''].filter(Boolean).join(' / '),
    }))
    const topCategory = summary.categories[0]
    const insight = count && topCategory
      ? `最多カテゴリ：${compactExcerpt(topCategory.category, 22)} ${topCategory.count} 件（全質問の${share(topCategory.count)}） / 生成異常・完了未確認 ${generationIssues} 件`
      : 'この期間の会話はまだありません。期間を変更するか、ログの記録後に集計を更新してください。'
    return {
      title: '会話ダッシュボード',
      subtitle: `対象期間：${start || '記録開始'} 〜 ${end || '最新'}${updatedAt ? ` | 更新：${updatedAt}` : ''}`,
      tiles: [
        { label: '質問数', value: String(count), context: '期間内の質問・回答の件数', tone: 'accent' },
        { label: '会話数', value: String(summary.conversationCount), context: summary.missingConversationCount ? `会話IDなし ${summary.missingConversationCount} 件を除く` : '会話IDごとの件数', tone: 'accent' },
        { label: '要確認', value: String(summary.needsReview.length), context: '生成異常・要改善・判断不可', tone: 'danger' },
        { label: 'その他の割合', value: share(otherCount), context: `カテゴリ「その他」 ${otherCount} 件`, tone: 'attention' },
      ],
      categories,
      categoryBreakdown: categories.map(item => ({ ...item, share: share(item.count) })),
      reviewBreakdown,
      reviewExamples,
      insight,
      daily: summary.daily.map(item => ({ ...item })),
      frequency: summary.questions.slice(0, 10).map((item, index) => ({ rank: index + 1, question: compactExcerpt(item.example, 100), count: item.count, share: share(item.count) })),
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
    rows[26][0] = model.insight
    rows[28][0] = 'カテゴリ内訳'
    rows[28][6] = '生成状態・要確認の内訳'
    rows[29][0] = 'カテゴリ'
    rows[29][4] = '件数'
    rows[29][5] = '全質問比'
    rows[29][6] = '生成状態'
    rows[29][11] = '件数'
    model.categoryBreakdown.forEach((item, index) => {
      rows[index + 30][0] = item.category
      rows[index + 30][4] = item.count
      rows[index + 30][5] = item.share
    })
    if (!model.categoryBreakdown.length) { rows[30][0] = 'この期間のデータはありません' }
    rows[40][0] = 'よくある質問 / TOP 10'
    rows[41][0] = '順位'
    rows[41][1] = '質問'
    rows[41][10] = '件数'
    rows[41][11] = '全質問比'
    model.frequency.slice(0, 10).forEach((item, index) => {
      rows[index + 42][0] = item.rank
      rows[index + 42][1] = item.question
      rows[index + 42][10] = item.count
      rows[index + 42][11] = item.share
    })
    if (!model.frequency.length) { rows[42][1] = 'この期間のデータはありません' }
    const statuses = model.statuses.slice(0, 4)
    if (model.statuses.length > 4) {
      statuses[3] = { status: 'その他の生成状態', count: model.statuses.slice(3).reduce((sum, item) => sum + item.count, 0) }
    }
    statuses.forEach((item, index) => {
      rows[index + 30][6] = item.status
      rows[index + 30][11] = item.count
    })
    if (!statuses.length) { rows[30][6] = 'この期間のデータはありません' }
    rows[34][6] = '要確認の理由（重複あり）'
    model.reviewBreakdown.forEach((item, index) => {
      rows[index + 35][6] = item.reason
      rows[index + 35][11] = item.count
    })
    rows[38][6] = '理由は重複します。生成完了 ≠ 回答の正しさ。'
    rows[53][0] = '要確認の質問例 / 新しい順に5件'
    rows[54][0] = '日時'
    rows[54][2] = 'カテゴリ'
    rows[54][4] = '質問'
    rows[54][9] = '確認が必要な理由'
    model.reviewExamples.forEach((item, index) => {
      rows[index + 55][0] = item.date
      rows[index + 55][2] = item.category
      rows[index + 55][4] = item.question
      rows[index + 55][9] = item.reason
    })
    if (!model.reviewExamples.length) { rows[55][4] = model.emptyText ? 'この期間のデータはありません' : 'この期間に要確認の質問はありません' }
    rows[61][0] = '割合は期間内の全質問が分母。全文は一覧の詳細メニュー、頻出質問の全件は非表示の「集計データ」へ。'
    return rows
  }
  const rgb = hex => ({ red: Number.parseInt(hex.slice(1, 3), 16) / 255, green: Number.parseInt(hex.slice(3, 5), 16) / 255, blue: Number.parseInt(hex.slice(5, 7), 16) / 255 })
  const grid = (sheetId, r1, r2, c1 = 0, c2 = 12) => ({ sheetId, startRowIndex: r1, endRowIndex: r2, startColumnIndex: c1, endColumnIndex: c2 })
  function format(range, value) {
    return { repeatCell: { range, cell: { userEnteredFormat: value }, fields: Object.keys(value).map(key => `userEnteredFormat.${key}`).join(',') } }
  }
  const side = (style, hex) => ({ style, color: rgb(hex) })
  const merge = range => ({ mergeCells: { range, mergeType: 'MERGE_ALL' } })
  const dimension = (sheetId, axis, start, end, properties) => ({ updateDimensionProperties: { range: { sheetId, dimension: axis, startIndex: start, endIndex: end }, properties, fields: Object.keys(properties).join(',') } })
  function sheetStyle(sheetId, frozenRows, color) {
    return { updateSheetProperties: { properties: { sheetId, gridProperties: { hideGridlines: true, frozenRowCount: frozenRows, frozenColumnCount: 0 }, tabColorStyle: { rgbColor: rgb(color) } }, fields: 'gridProperties.hideGridlines,gridProperties.frozenRowCount,gridProperties.frozenColumnCount,tabColorStyle' } }
  }
  function dashboardRequests(sheetId) {
    const requests = [
      sheetStyle(sheetId, 0, colors.accent),
      dimension(sheetId, 'COLUMNS', 0, 12, { pixelSize: layout.columnWidth }),
      dimension(sheetId, 'ROWS', 0, layout.lastRow, { pixelSize: 26 }),
      dimension(sheetId, 'ROWS', 0, 1, { hiddenByUser: true }),
      format(grid(sheetId, 1, layout.lastRow), { backgroundColor: rgb(colors.background), textFormat: { fontFamily: 'Noto Sans JP', fontSize: 12, foregroundColor: rgb(colors.ink) }, verticalAlignment: 'MIDDLE', wrapStrategy: 'CLIP', horizontalAlignment: 'LEFT' }),
      // B2/B3 remain date anchors; the adapter preserves their values and validation.
      merge(grid(sheetId, 1, 2, 1, 3)),
      merge(grid(sheetId, 2, 3, 1, 3)),
      merge(grid(sheetId, 1, 2, 3, 12)),
      merge(grid(sheetId, 2, 3, 3, 12)),
      format(grid(sheetId, 1, 3, 0, 1), { textFormat: { foregroundColor: rgb(colors.muted), bold: true, fontSize: 11 }, horizontalAlignment: 'RIGHT' }),
      format(grid(sheetId, 1, 3, 1, 3), { backgroundColor: rgb(colors.accentLight), numberFormat: { type: 'DATE', pattern: 'yyyy-mm-dd' }, textFormat: { foregroundColor: rgb(colors.accent), bold: true, fontSize: 12 }, horizontalAlignment: 'CENTER', borders: { top: side('SOLID', colors.accent), bottom: side('SOLID', colors.accent), left: side('SOLID', colors.accent), right: side('SOLID', colors.accent) } }),
      format(grid(sheetId, 1, 3, 3, 12), { textFormat: { foregroundColor: rgb(colors.muted), fontSize: 11 } }),
      dimension(sheetId, 'ROWS', 1, 3, { pixelSize: 34 }),
      merge(grid(sheetId, 4, 5)),
      merge(grid(sheetId, 5, 6)),
      dimension(sheetId, 'ROWS', 4, 5, { pixelSize: 54 }),
      dimension(sheetId, 'ROWS', 5, 6, { pixelSize: 32 }),
      format(grid(sheetId, 4, 5), { textFormat: { bold: true, fontSize: 26, foregroundColor: rgb(colors.ink) }, verticalAlignment: 'BOTTOM' }),
      format(grid(sheetId, 5, 6), { textFormat: { fontSize: 11, foregroundColor: rgb(colors.muted) } }),
      dimension(sheetId, 'ROWS', 7, 8, { pixelSize: 36 }),
      dimension(sheetId, 'ROWS', 8, 10, { pixelSize: 32 }),
      dimension(sheetId, 'ROWS', 10, 11, { pixelSize: 38 }),
    ]
    // Light cards with a colored top rule; thick white side borders keep a gap between neighbors.
    ;['accent', 'accent', 'danger', 'attention'].forEach((tone, index) => {
      const column = index * 3
      requests.push(
        format(grid(sheetId, 7, 11, column, column + 3), { backgroundColor: rgb(colors.card), horizontalAlignment: 'CENTER', borders: { left: side('SOLID_THICK', colors.white), right: side('SOLID_THICK', colors.white) } }),
        format(grid(sheetId, 7, 8, column, column + 3), { borders: { top: side('SOLID_THICK', colors[tone]), left: side('SOLID_THICK', colors.white), right: side('SOLID_THICK', colors.white) } }),
        merge(grid(sheetId, 7, 8, column, column + 3)),
        merge(grid(sheetId, 8, 10, column, column + 3)),
        merge(grid(sheetId, 10, 11, column, column + 3)),
        format(grid(sheetId, 7, 8, column, column + 3), { textFormat: { fontSize: 12, bold: true, foregroundColor: rgb(colors.muted) } }),
        format(grid(sheetId, 8, 10, column, column + 3), { textFormat: { fontSize: 34, bold: true, foregroundColor: rgb(tone === 'danger' ? colors.danger : colors.ink) } }),
        format(grid(sheetId, 10, 11, column, column + 3), { textFormat: { fontSize: 11, foregroundColor: rgb(colors.muted) }, wrapStrategy: 'WRAP' }),
      )
    })
    requests.push(
      merge(grid(sheetId, 26, 27)),
      dimension(sheetId, 'ROWS', 26, 27, { pixelSize: 44 }),
      format(grid(sheetId, 26, 27), { backgroundColor: rgb(colors.accentLight), textFormat: { fontSize: 12, bold: true, foregroundColor: rgb(colors.accent) }, wrapStrategy: 'WRAP' }),
      merge(grid(sheetId, 28, 29, 0, 6)),
      merge(grid(sheetId, 28, 29, 6, 12)),
      merge(grid(sheetId, 40, 41)),
      merge(grid(sheetId, 53, 54)),
      merge(grid(sheetId, 34, 35, 6, 12)),
      merge(grid(sheetId, 38, 39, 6, 12)),
      format(grid(sheetId, 34, 35, 6, 12), { backgroundColor: rgb(colors.accentLight), textFormat: { fontSize: 12, bold: true, foregroundColor: rgb(colors.accent) } }),
      format(grid(sheetId, 38, 39, 6, 12), { textFormat: { fontSize: 11, foregroundColor: rgb(colors.muted) }, wrapStrategy: 'WRAP' }),
      merge(grid(sheetId, 61, 62)),
      dimension(sheetId, 'ROWS', 61, 62, { pixelSize: 42 }),
      format(grid(sheetId, 61, 62), { textFormat: { fontSize: 11, foregroundColor: rgb(colors.muted) }, wrapStrategy: 'WRAP' }),
    )
    for (const row of [28, 40, 53]) {
      requests.push(dimension(sheetId, 'ROWS', row, row + 1, { pixelSize: 44 }), format(grid(sheetId, row, row + 1), { textFormat: { fontSize: 15, bold: true, foregroundColor: rgb(colors.ink) }, verticalAlignment: 'BOTTOM', borders: { bottom: side('SOLID_MEDIUM', colors.ink) } }))
    }
    for (const row of [29, 41, 54]) {
      requests.push(dimension(sheetId, 'ROWS', row, row + 1, { pixelSize: 36 }), format(grid(sheetId, row, row + 1), { textFormat: { fontSize: 11, bold: true, foregroundColor: rgb(colors.muted) }, borders: { bottom: side('SOLID', colors.line) } }))
    }
    for (const [start, end, height] of [[30, 39, 42], [42, 52, 44], [55, 60, 44]]) {
      requests.push(dimension(sheetId, 'ROWS', start, end, { pixelSize: height }), format(grid(sheetId, start, end), { wrapStrategy: 'WRAP' }))
      for (let row = start; row < end; row++) {
        if ((row - start) % 2 === 1) {
          requests.push(format(grid(sheetId, row, row + 1, 0, start === 30 ? 6 : 12), { backgroundColor: rgb(colors.card) }))
        }
      }
    }
    for (let row = 29; row < 39; row++) {
      requests.push(merge(grid(sheetId, row, row + 1, 0, 4)), format(grid(sheetId, row, row + 1, 4, 6), { horizontalAlignment: 'RIGHT' }))
      if (row !== 34 && row !== 38) { requests.push(merge(grid(sheetId, row, row + 1, 6, 11)), format(grid(sheetId, row, row + 1, 11, 12), { horizontalAlignment: 'RIGHT' })) }
    }
    for (let row = 41; row < 52; row++) {
      requests.push(merge(grid(sheetId, row, row + 1, 1, 10)), format(grid(sheetId, row, row + 1, 10, 12), { horizontalAlignment: 'RIGHT' }))
    }
    for (let row = 54; row < 60; row++) {
      for (const [start, end] of [[0, 2], [2, 4], [4, 9], [9, 12]]) { requests.push(merge(grid(sheetId, row, row + 1, start, end))) }
    }
    return requests
  }
  function listRequests(sheetId, lastRow) {
    if (!Number.isSafeInteger(lastRow) || lastRow < 5) { throw new Error('一覧の最終行が不正です') }
    const requests = [
      sheetStyle(sheetId, 5, colors.attention),
      dimension(sheetId, 'COLUMNS', 6, 21, { hiddenByUser: true }),
      dimension(sheetId, 'ROWS', 0, 1, { hiddenByUser: true }),
      format(grid(sheetId, 1, lastRow, 0, 6), { backgroundColor: rgb(colors.white), textFormat: { fontFamily: 'Noto Sans JP', fontSize: 12, foregroundColor: rgb(colors.ink) }, verticalAlignment: 'MIDDLE', wrapStrategy: 'WRAP' }),
      merge(grid(sheetId, 1, 2, 0, 6)),
      merge(grid(sheetId, 2, 3, 0, 6)),
      dimension(sheetId, 'ROWS', 1, 2, { pixelSize: 54 }),
      dimension(sheetId, 'ROWS', 2, 3, { pixelSize: 38 }),
      dimension(sheetId, 'ROWS', 3, 4, { pixelSize: 16 }),
      dimension(sheetId, 'ROWS', 4, 5, { pixelSize: 40 }),
      format(grid(sheetId, 1, 2, 0, 6), { textFormat: { bold: true, fontSize: 24, foregroundColor: rgb(colors.ink) }, verticalAlignment: 'BOTTOM' }),
      format(grid(sheetId, 2, 3, 0, 6), { textFormat: { fontSize: 11, foregroundColor: rgb(colors.muted) } }),
      format(grid(sheetId, 4, 5, 0, 6), { textFormat: { fontSize: 11, bold: true, foregroundColor: rgb(colors.muted) }, borders: { bottom: side('SOLID_MEDIUM', colors.ink) } }),
    ]
    ;[150, 140, 280, 400, 180, 72].forEach((width, column) => requests.push(dimension(sheetId, 'COLUMNS', column, column + 1, { pixelSize: width })))
    if (lastRow > 5) {
      requests.push(
        dimension(sheetId, 'ROWS', 5, lastRow, { pixelSize: 80 }),
        format(grid(sheetId, 5, lastRow, 0, 6), { borders: { bottom: side('SOLID', colors.line) } }),
        format(grid(sheetId, 5, lastRow, 4, 5), { textFormat: { fontSize: 12, bold: true, foregroundColor: rgb(colors.attention) } }),
        format(grid(sheetId, 5, lastRow, 5, 6), { textFormat: { fontSize: 12, foregroundColor: rgb(colors.accent), underline: true }, horizontalAlignment: 'CENTER' }),
      )
    }
    return requests
  }
  return { colors, layout, listHeaders, compactExcerpt, dashboardModel, dashboardValues, compactRows, dashboardRequests, listRequests }
})()

if (typeof module !== 'undefined') { module.exports = ChatPresentation }
