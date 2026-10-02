import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { runInNewContext } from 'node:vm'
import { createChatLogCollector, observeChatStream } from '../../app/api/utils/chat-log.ts'
import { chatLogConfig, chatLogKey, sendChatLog } from '../../app/api/utils/chat-log-send.ts'
import Core from '../../integrations/google-sheets/Core.js'

const initial = { environment: 'test', appId: 'test-app', requestId: 'request-1', conversationId: '', createdAt: '2026-10-01T15:00:00.000Z', query: '料金を教えて' }
const event = data => `data: ${JSON.stringify({ conversation_id: 'conversation-1', message_id: 'message-1', ...data })}\r\n\r\n`
const encoder = new TextEncoder()
const record = { ...initial, schemaVersion: 1, conversationId: 'conversation-1', messageId: 'message-1', answer: '=架空の回答', status: 'completed', capture: 'full' }
const secret = 'fake-secret-for-local-tests-only-1234'
const config = { environment: 'test', url: 'https://script.google.com/macros/s/test/exec', secret }

describe('会話ログの原文と生成状態', () => {
  it('UTF-8とJSONを1バイトずつ受け取っても最終回答を保存する', () => {
    const collector = createChatLogCollector(initial)
    const wire = event({ event: 'message', answer: '料金は' }) + event({ event: 'message', answer: '個別のお見積もりです。' }) + event({ event: 'message_end' })
    for (const byte of encoder.encode(wire)) { collector.push(new Uint8Array([byte])) }
    assert.deepEqual(collector.finish(), { ...record, answer: '料金は個別のお見積もりです。' })
  })
  it('回答置換では置換前の文章を残さない', () => {
    const collector = createChatLogCollector(initial)
    collector.push(encoder.encode(event({ event: 'message', answer: '仮の文章' }) + event({ event: 'message_replace', answer: '最終的な文章' }) + event({ event: 'message_end' })))
    assert.equal(collector.finish().answer, '最終的な文章')
  })
  it('完了イベントの後にworkflow失敗が届いても完了と誤記録しない', () => {
    const collector = createChatLogCollector(initial)
    collector.push(encoder.encode(event({ event: 'message', answer: '途中' }) + event({ event: 'message_end' }) + event({ event: 'workflow_finished', data: { status: 'failed' } })))
    assert.equal(collector.finish().status, 'error')
  })
  it('HTTP成功後のerrorイベントを保存する', () => {
    const collector = createChatLogCollector(initial)
    collector.push(encoder.encode(event({ event: 'message', answer: '途中' }) + event({ event: 'error' })))
    assert.equal(collector.finish().status, 'error')
  })
  it('完了イベント欠落・不正JSON・サイズ超過を明示する', () => {
    const missing = createChatLogCollector(initial)
    missing.push(encoder.encode(event({ event: 'message', answer: '途中' })))
    assert.equal(missing.finish().status, 'incomplete')
    const invalid = createChatLogCollector(initial)
    invalid.push(encoder.encode('data: {broken}\n\n'))
    assert.equal(invalid.finish().capture, 'invalid_stream')
    const limit = createChatLogCollector(initial)
    limit.push(encoder.encode(event({ event: 'message', answer: 'a'.repeat(120001) }) + event({ event: 'message_end' })))
    assert.equal(limit.finish().answer.length, 120000)
    assert.equal(limit.finish().capture, 'size_limit')
    assert.equal(limit.finish().status, 'incomplete')
  })
  it('観測したバイト列を変更せずに転送する', async () => {
    const wire = event({ event: 'message', answer: '回答' }) + event({ event: 'message_end' })
    const observed = observeChatStream(new Response(wire).body, createChatLogCollector(initial))
    assert.equal(await new Response(observed.stream).text(), wire)
    assert.equal((await observed.result).status, 'completed')
  })
  it('ブラウザ切断時に未完了として確定する', async () => {
    const observed = observeChatStream(new ReadableStream({ pull(c) { c.enqueue(encoder.encode(event({ event: 'message', answer: '途中' }))) } }), createChatLogCollector(initial))
    const reader = observed.stream.getReader()
    await reader.read()
    await reader.cancel()
    assert.equal((await observed.result).status, 'incomplete')
  })
  it('IDのない完了イベントやUTF-8末尾欠落を完了扱いしない', () => {
    const missing = createChatLogCollector(initial)
    missing.push(encoder.encode('data: {"event":"message_end"}\n\n'))
    assert.equal(missing.finish().status, 'incomplete')
    const broken = createChatLogCollector(initial)
    broken.push(encoder.encode(event({ event: 'message_end' })))
    broken.push(new Uint8Array([0xE3]))
    assert.equal(broken.finish().capture, 'invalid_stream')
  })
})

describe('ログ送信先と環境分離', () => {
  it('未設定・offは無効、testとproductionを混同しない', () => {
    assert.equal(chatLogConfig({}), undefined)
    assert.equal(chatLogConfig({ CHAT_LOG_MODE: 'off' }), undefined)
    const settings = { CHAT_LOG_MODE: 'test', CHAT_LOG_URL: config.url, CHAT_LOG_SECRET: secret }
    assert.deepEqual(chatLogConfig(settings), config)
    assert.throws(() => chatLogConfig({ ...settings, VERCEL_ENV: 'production' }))
    assert.throws(() => chatLogConfig({ ...settings, CHAT_LOG_MODE: 'production' }))
    assert.equal(chatLogConfig({ ...settings, CHAT_LOG_MODE: 'production', VERCEL_ENV: 'production' }).environment, 'production')
    assert.throws(() => chatLogConfig({ ...settings, CHAT_LOG_URL: 'https://example.com/exec' }))
    assert.throws(() => chatLogConfig({ ...settings, CHAT_LOG_URL: `${config.url}?secret=x` }))
  })
  it('ContentServiceのリダイレクト先には秘密本文を再送しない', async () => {
    const calls = []
    const result = await sendChatLog(record, config, { fetch: async (url, options) => {
      calls.push({ url: String(url), ...options })
      return calls.length === 1
        ? new Response(null, { status: 302, headers: { location: 'https://script.googleusercontent.com/macros/echo?key=one-time' } })
        : Response.json({ ok: true, code: 'stored', key: chatLogKey(record) })
    } })
    assert.equal(result.ok, true)
    assert.equal(calls[1].method, 'GET')
    assert.equal(calls[1].body, undefined)
    assert.equal(calls[1].headers, undefined)
  })
  it('一時失敗後の再送は同じ識別子を使い、最大3回に制限する', async () => {
    const bodies = []
    const result = await sendChatLog(record, config, { sleep: async () => {}, fetch: async (_url, options) => {
      bodies.push(options.body)
      return new Response('', { status: 503 })
    } })
    assert.equal(result.ok, false)
    assert.equal(bodies.length, 3)
    assert.equal(new Set(bodies).size, 1)
  })
  it('認証失敗と不正リダイレクトは再送しない', async () => {
    for (const response of [Response.json({ ok: false, code: 'unauthorized' }), new Response(null, { status: 302, headers: { location: 'https://example.com' } })]) {
      let calls = 0
      const result = await sendChatLog(record, config, { fetch: async () => { calls++; return response } })
      assert.equal(result.ok, false)
      assert.equal(calls, 1)
    }
  })
  it('HTTP200のログイン画面を成功扱いせず、duplicateは成功扱いする', async () => {
    assert.equal((await sendChatLog(record, config, { sleep: async () => {}, fetch: async () => new Response('<html>Login</html>') })).ok, false)
    assert.equal((await sendChatLog(record, config, { fetch: async () => Response.json({ ok: true, code: 'duplicate', key: chatLogKey(record) }) })).ok, true)
  })
  it('タイムアウトを打ち切って3回で終了する', async () => {
    let calls = 0
    // Keep the event loop alive because AbortSignal.timeout uses an unref timer.
    const hold = setInterval(() => {}, 1000)
    try {
      const result = await sendChatLog(record, config, { timeoutMs: 10, sleep: async () => {}, fetch: async (_url, { signal }) => {
        calls++
        return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }))
      } })
      assert.deepEqual(result, { ok: false, code: 'timeout' })
      assert.equal(calls, 3)
    }
    finally { clearInterval(hold) }
  })
})

describe('GASの保存契約', () => {
  function storage() {
    const rows = []
    let locked = false
    return { rows, lock() { assert.equal(locked, false); locked = true; return true }, unlock() { locked = false }, exists(key) { assert.equal(locked, true); return rows.some(row => row[13] === key) }, append(row) { assert.equal(locked, true); rows.push(row) } }
  }
  it('重複要求を受けても1行のままで、担当者のメモを保持する', () => {
    const store = storage()
    assert.equal(Core.receive({ secret, record }, config, store).code, 'stored')
    store.rows[0][8] = '担当者のメモ'
    assert.equal(Core.receive({ secret, record }, config, store).code, 'duplicate')
    assert.equal(store.rows.length, 1)
    assert.equal(store.rows[0][8], '担当者のメモ')
  })
  it('不正認証・不正形式・異なる環境では保存しない', () => {
    const store = storage()
    assert.equal(Core.receive({ secret: 'wrong', record }, config, store).code, 'unauthorized')
    assert.equal(Core.receive({ secret, record: { ...record, query: '' } }, config, store).code, 'invalid_record')
    assert.equal(Core.receive({ secret, record: { ...record, environment: 'production' } }, config, store).code, 'environment_mismatch')
    assert.equal(store.rows.length, 0)
  })
  it('長文をセルに分割しても原文を復元できる', () => {
    const answer = 'あ'.repeat(120000)
    const row = Core.row({ ...record, answer })
    assert.equal(row[2] + row[17] + row[18], answer)
    assert.equal(Core.validate({ ...record, answer: `${answer}a` }), false)
    assert.equal(Core.validate({ ...record, answer }), true)
    assert.equal(row[0], '2026-10-02 00:00:00')
  })
  it('保存例外でもロックを解放し、ロック競合時は書き込まない', () => {
    let unlocked = false
    const store = { lock: () => true, unlock: () => { unlocked = true }, exists: () => false, append: () => { throw new Error('offline') } }
    assert.throws(() => Core.receive({ secret, record }, config, store), /offline/)
    assert.equal(unlocked, true)
    store.lock = () => false
    assert.equal(Core.receive({ secret, record }, config, store).code, 'busy')
  })
  it('実際のGAS受信口は原文を文字列セルで書き込み、共有秘密を返さない', () => {
    let locked = false
    let write
    const sheet = { getLastRow: () => 1, getMaxRows: () => 1000, getSheetId: () => 7, getRange: () => ({ getValues: () => [Core.headers] }) }
    const spreadsheet = { getSheetByName: () => sheet, getId: () => 'sheet-id' }
    const source = readFileSync(new URL('../../integrations/google-sheets/Code.js', import.meta.url), 'utf8')
    const response = runInNewContext(`${source}\ndoPost({ postData: { contents: input } })`, {
      input: JSON.stringify({ secret, record: { ...record, query: '=1+1' } }),
      ChatLog: Core,
      classifyLogRow: row => row,
      PropertiesService: { getScriptProperties: () => ({ getProperty: key => ({ CHAT_LOG_SECRET: secret, CHAT_LOG_ENVIRONMENT: 'test', SPREADSHEET_ID: 'sheet-id' })[key] }) },
      SpreadsheetApp: { openById: () => { assert.equal(locked, true); return spreadsheet } },
      LockService: { getScriptLock: () => ({ tryLock: () => { locked = true; return true }, releaseLock: () => { locked = false } }) },
      Sheets: { Spreadsheets: { batchUpdate: (body, id) => { assert.equal(id, 'sheet-id'); assert.equal(locked, true); write = body } } },
      ContentService: { MimeType: { JSON: 'json' }, createTextOutput: text => ({ setMimeType: () => text }) },
    })
    assert.equal(JSON.parse(response).code, 'stored')
    assert.equal(response.includes(secret), false)
    assert.equal(locked, false)
    const values = write.requests[0].updateCells.rows[0].values
    assert.equal(values[1].userEnteredValue.stringValue, '=1+1')
    assert.equal(values[2].userEnteredValue.stringValue, record.answer)
    assert.equal(values[5].userEnteredValue.formulaValue, '=IF(E2<>"",E2,D2)')
    assert.equal(values.filter(value => value.userEnteredValue.formulaValue).length, 1)
  })
  it('既存行を使い切った場合は同じAPIリクエスト内で拡張してから保存する', () => {
    let write
    const source = readFileSync(new URL('../../integrations/google-sheets/Code.js', import.meta.url), 'utf8')
    runInNewContext(`${source}\nappendLogRow(spreadsheet, sheet, row)`, {
      row: Core.row(record),
      classifyLogRow: row => row,
      spreadsheet: { getId: () => 'sheet-id' },
      sheet: { getLastRow: () => 1000, getMaxRows: () => 1000, getSheetId: () => 7 },
      Sheets: { Spreadsheets: { batchUpdate: (body) => { write = body } } },
    })
    assert.deepEqual(JSON.parse(JSON.stringify(write.requests[0])), { appendDimension: { sheetId: 7, dimension: 'ROWS', length: 100 } })
    assert.equal(write.requests[1].updateCells.range.startRowIndex, 1000)
    assert.equal(write.requests[1].updateCells.range.endRowIndex, 1001)
  })
})
