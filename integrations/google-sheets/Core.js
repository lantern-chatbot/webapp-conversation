/* Shared GAS contract; also loaded directly by node:test. */
const ChatLog = (() => {
  const headers = ['日時', '質問', '回答', '自動カテゴリ', '修正カテゴリ', '集計カテゴリ', '生成状態', '担当者評価', 'メモ', '会話ID', 'メッセージID', 'リクエストID', 'アプリID', '記録キー', 'ルールID', 'ルール版', '質問集計キー', '回答（続き1）', '回答（続き2）', '捕捉状態']
  const normalize = value => value.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim()
  const validId = value => typeof value === 'string' && /^[\w-]{1,64}$/.test(value)
  const optionalId = value => value === '' || validId(value)
  const validate = record => !!record && record.schemaVersion === 1
    && ['test', 'production'].includes(record.environment)
    && validId(record.appId) && validId(record.requestId)
    && optionalId(record.conversationId) && optionalId(record.messageId)
    && typeof record.createdAt === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(record.createdAt) && Number.isFinite(Date.parse(record.createdAt))
    && typeof record.query === 'string' && record.query.trim().length > 0 && record.query.length <= 4000
    && typeof record.answer === 'string' && record.answer.length <= 120000
    && ['completed', 'error', 'incomplete'].includes(record.status)
    && ['full', 'size_limit', 'invalid_stream'].includes(record.capture)
    && (record.status !== 'completed' || (record.capture === 'full' && !!record.messageId && !!record.conversationId))
  const key = record => `${record.appId}:${record.messageId ? `m:${record.messageId}` : `r:${record.requestId}`}`
  const row = record => [
    new Date(Date.parse(record.createdAt) + 9 * 3600000).toISOString().slice(0, 19).replace('T', ' '),
    record.query,
    record.answer.slice(0, 40000),
    'その他',
    '',
    'その他',
    { completed: '完了', error: 'エラー', incomplete: '中断・完了未確認' }[record.status],
    '未確認',
    '',
    record.conversationId,
    record.messageId,
    record.requestId,
    record.appId,
    key(record),
    '',
    '',
    normalize(record.query),
    record.answer.slice(40000, 80000),
    record.answer.slice(80000),
    record.capture,
  ]
  function receive(envelope, config, storage) {
    if (!config.secret || config.secret.length < 32 || !['test', 'production'].includes(config.environment)) {
      return { ok: false, code: 'configuration_error' }
    }
    if (!envelope || envelope.secret !== config.secret) { return { ok: false, code: 'unauthorized' } }
    if (!validate(envelope.record)) { return { ok: false, code: 'invalid_record' } }
    const record = envelope.record
    if (record.environment !== config.environment) { return { ok: false, code: 'environment_mismatch' } }
    const recordKey = key(record)
    if (!storage.lock()) { return { ok: false, code: 'busy' } }
    try {
      if (storage.exists(recordKey)) { return { ok: true, code: 'duplicate', key: recordKey } }
      storage.append(row(record))
      return { ok: true, code: 'stored', key: recordKey }
    }
    finally { storage.unlock() }
  }
  return { headers, normalize, validate, key, row, receive }
})()

if (typeof module !== 'undefined') { module.exports = ChatLog }
