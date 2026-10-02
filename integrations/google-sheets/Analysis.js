/* Pure GAS analysis contract; also loaded directly by node:test. */
const ChatAnalysis = (() => {
  const headers = ['有効', '優先順位', 'ルールID', 'カテゴリ', '含む語', '除外語']
  const defaultRows = [
    [true, 10, 'pricing', '料金', '料金,費用,価格,見積,予算', ''],
    [true, 20, 'careers', '採用', '採用,求人,インターン,募集,就職', ''],
    [true, 30, 'consulting', '導入相談', '導入,相談,課題,業務改善', ''],
    [true, 40, 'services', 'サービス', 'サービス,機能,開発,研修,チャットボット,chatbot', ''],
    [true, 50, 'company', '会社情報', '会社,所在地,住所,代表,設立', ''],
    [true, 60, 'contact', '問い合わせ', '問い合わせ,問合せ,連絡,メール,電話', ''],
  ]
  const normalize = value => String(value).normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim()
  const blank = row => row.every(value => value === '' || value === null || value === undefined)
  const words = value => [...new Set(value.split(/[,、\r\n]+/).map(normalize).filter(Boolean))]
  function parseRules(rows) {
    if (!Array.isArray(rows)) { throw new Error('分類ルールは行の配列で指定してください') }
    const ids = new Set()
    const rules = rows.flatMap((row, index) => {
      if (!Array.isArray(row)) { throw new Error(`分類ルール ${index + 2} 行目が不正です`) }
      if (blank(row)) { return [] }
      const [enabledValue, priorityValue, idValue, categoryValue, includesValue, excludesValue = ''] = row
      const enabledText = String(enabledValue).trim().toLowerCase()
      if (!['true', 'false'].includes(enabledText)) { throw new Error(`分類ルール ${index + 2} 行目の有効は TRUE/FALSE で指定してください`) }
      const priority = Number(priorityValue)
      if (!['number', 'string'].includes(typeof priorityValue) || String(priorityValue).trim() === '' || !Number.isSafeInteger(priority) || priority < 0) { throw new Error(`分類ルール ${index + 2} 行目の優先順位が不正です`) }
      if (typeof idValue !== 'string' || !/^[\w-]{1,64}$/.test(idValue) || ids.has(idValue)) { throw new Error(`分類ルール ${index + 2} 行目のルールIDが不正または重複しています`) }
      if (typeof categoryValue !== 'string' || !categoryValue.trim()) { throw new Error(`分類ルール ${index + 2} 行目のカテゴリが空です`) }
      if (typeof includesValue !== 'string' || typeof excludesValue !== 'string') { throw new Error(`分類ルール ${index + 2} 行目の語句は文字列で指定してください`) }
      const includes = words(includesValue)
      const excludes = words(excludesValue)
      const enabled = enabledText === 'true'
      if (enabled && includes.length === 0) { throw new Error(`分類ルール ${index + 2} 行目の含む語が空です`) }
      ids.add(idValue)
      return [{ enabled, priority, id: idValue, category: categoryValue.trim(), includes, excludes, order: index }]
    })
    rules.sort((a, b) => a.priority - b.priority || a.order - b.order)
    // A stable change marker, not a cryptographic/security hash.
    const canonical = JSON.stringify(rules.map(({ order, ...rule }) => rule))
    let hash = 2166136261
    for (let i = 0; i < canonical.length; i++) { hash = Math.imul(hash ^ canonical.charCodeAt(i), 16777619) >>> 0 }
    return { rules, version: `rules-${hash.toString(16).padStart(8, '0')}` }
  }
  function classify(query, parsed) {
    const normalized = normalize(query)
    const rule = parsed.rules.find(rule => rule.enabled
      && rule.includes.some(word => normalized.includes(word))
      && !rule.excludes.some(word => normalized.includes(word)))
    return { category: rule ? rule.category : 'その他', ruleId: rule ? rule.id : '', version: parsed.version }
  }
  function reclassify(logRows, parsed) {
    return logRows.flatMap((row, index) => {
      if (blank(row)) { return [] }
      const result = classify(row[1], parsed)
      return [{ index, autoCategory: result.category, ruleId: result.ruleId, version: result.version, normalizedQuery: normalize(row[1]) }]
    })
  }
  function validDate(value) {
    return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
      && Number.isFinite(Date.parse(`${value}T00:00:00.000Z`))
      && new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value
  }
  function aggregate(logRows, { start = '', end = '' } = {}) {
    if ((start !== '' && !validDate(start)) || (end !== '' && !validDate(end)) || (start && end && start > end)) {
      throw new Error('集計期間は実在する YYYY-MM-DD の日付を開始日順に指定してください')
    }
    const daily = new Map()
    const categories = new Map()
    const statuses = new Map()
    const questions = new Map()
    const conversations = new Set()
    const other = []
    const needsReview = []
    let questionCount = 0
    let missingConversationCount = 0
    const increment = (map, key) => map.set(key, (map.get(key) || 0) + 1)
    logRows.forEach((row, index) => {
      if (blank(row)) { return }
      const timestamp = row[0]
      if (typeof timestamp !== 'string' || !/^\d{4}-\d{2}-\d{2} (?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(timestamp) || !validDate(timestamp.slice(0, 10))) {
        throw new Error(`会話ログ ${index + 2} 行目の日時が不正です`)
      }
      const date = timestamp.slice(0, 10)
      if ((start && date < start) || (end && date > end)) { return }
      questionCount++
      const category = String(row[4] || row[3] || 'その他')
      const status = String(row[6] || '不明')
      const review = String(row[7] || '未確認')
      const query = String(row[1] || '')
      if (row[9] && row[12]) { conversations.add(JSON.stringify([row[12], row[9]])) }
      else { missingConversationCount++ }
      increment(daily, date)
      increment(categories, category)
      increment(statuses, status)
      const normalizedQuery = normalize(query)
      const previous = questions.get(normalizedQuery)
      questions.set(normalizedQuery, { normalizedQuery, example: previous ? previous.example : query, count: (previous ? previous.count : 0) + 1 })
      const item = { index, date, query, answer: [row[2], row[17], row[18]].map(value => value || '').join(''), category, status, review }
      if (category === 'その他') { other.push(item) }
      if (status !== '完了' || ['要改善', '判断不可'].includes(review)) { needsReview.push(item) }
    })
    const counts = (map, field) => [...map].map(([key, count]) => ({ [field]: key, count })).sort((a, b) => b.count - a.count || a[field].localeCompare(b[field], 'ja'))
    return {
      questionCount,
      conversationCount: conversations.size,
      missingConversationCount,
      daily: [...daily].sort(([a], [b]) => a.localeCompare(b)).map(([date, count]) => ({ date, count })),
      categories: counts(categories, 'category'),
      statuses: counts(statuses, 'status'),
      questions: [...questions.values()].sort((a, b) => b.count - a.count || a.normalizedQuery.localeCompare(b.normalizedQuery, 'ja')),
      other,
      needsReview,
    }
  }
  return { headers, defaultRows, normalize, parseRules, classify, reclassify, aggregate, validDate }
})()

if (typeof module !== 'undefined') { module.exports = ChatAnalysis }
