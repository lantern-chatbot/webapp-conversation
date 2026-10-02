// Only launched by Playwright. No test routes are added to the application.
import { createServer } from 'node:http'
import ChatLog from '../../integrations/google-sheets/Core.js'

const pending = new Map()
let messages = []
let conversations = []
let chatLogs = []
let logAttempts = 0
let logMode = 'ok'
const json = (response, body, status = 200) => {
  response.writeHead(status, { 'Content-Type': 'application/json' })
  response.end(JSON.stringify(body))
}
const event = (response, data) => response.write(`data: ${JSON.stringify(data)}\n\n`)

createServer(async (request, response) => {
  const path = new URL(request.url, 'http://127.0.0.1').pathname
  if (path === '/health') { return json(response, { ok: true }) }
  if (path === '/reset' && request.method === 'POST') {
    for (const stream of pending.keys()) { stream.destroy() }
    pending.clear()
    messages = []
    conversations = []
    chatLogs = []
    logAttempts = 0
    logMode = 'ok'
    return json(response, { ok: true })
  }
  if (path === '/complete' && request.method === 'POST') {
    for (const finish of pending.values()) { finish() }
    pending.clear()
    return json(response, { ok: true })
  }
  if (path === '/chat-logs') { return json(response, { records: chatLogs, attempts: logAttempts }) }
  if (path === '/fail-chat-logs' && request.method === 'POST') {
    logMode = 'fail'
    return json(response, { ok: true })
  }
  if (path === '/chat-log' && request.method === 'POST') {
    let raw = ''
    for await (const chunk of request) { raw += chunk }
    logAttempts++
    if (logMode === 'fail') { return json(response, { ok: false }, 503) }
    const body = JSON.parse(raw)
    if (body.secret !== 'local-chat-log-test-secret-12345678' || !ChatLog.validate(body.record) || body.record.environment !== 'test') {
      return json(response, { ok: false, code: 'invalid_record' })
    }
    const key = ChatLog.key(body.record)
    const duplicate = chatLogs.some(record => ChatLog.key(record) === key)
    if (!duplicate) { chatLogs.push(body.record) }
    return json(response, { ok: true, code: duplicate ? 'duplicate' : 'stored', key })
  }
  if (request.headers.authorization !== 'Bearer ci-test-key') {
    return json(response, { message: 'Unexpected test credentials' }, 401)
  }
  if (path === '/v1/parameters') {
    return json(response, {
      user_input_form: [],
      opening_statement: 'お気軽にご相談ください。',
      suggested_questions: [],
      file_upload: { enabled: false },
      system_parameters: {},
    })
  }
  if (path === '/v1/conversations') { return json(response, { data: conversations, has_more: false, limit: 100 }) }
  if (path === '/v1/messages') { return json(response, { data: messages, has_more: false, limit: 20 }) }
  if (path === '/v1/conversations/ci-conversation/name') {
    return json(response, { id: 'ci-conversation', name: 'テスト会話' })
  }
  if (path === '/v1/chat-messages' && request.method === 'POST') {
    let raw = ''
    for await (const chunk of request) { raw += chunk }
    const body = JSON.parse(raw)
    if (body.query === '通信エラーを確認') {
      return json(response, { message: 'テスト用の通信エラー' }, 503)
    }
    if (body.response_mode !== 'streaming' || !body.user?.startsWith('user_ci-test-app:')) {
      return json(response, { message: 'Invalid chat request' }, 400)
    }
    if (body.query === '続けて相談します' && body.conversation_id !== 'ci-conversation') {
      return json(response, { message: 'Conversation ID was not preserved' }, 400)
    }
    response.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' })
    const id = `ci-message-${messages.length + 1}`
    const info = { id, message_id: id, conversation_id: 'ci-conversation', task_id: 'ci-task' }
    conversations = [{ id: 'ci-conversation', name: 'テスト会話', inputs: {} }]
    const finish = () => {
      messages.push({ id, query: body.query, answer: 'ご相談を受け付けました。\n[[LANTERN_CARD:ai-consulting]]', retriever_resources: [] })
      event(response, { ...info, event: 'message', answer: 'consulting]]' })
      event(response, { ...info, event: 'message_end', metadata: {} })
      response.end()
    }
    event(response, { ...info, event: 'message', answer: 'ご相談を受け付けました。\n[[LANTERN_CARD:ai-' })
    // The test releases the final chunk after asserting the partial UI.
    if (body.query === 'AI導入について相談したい') {
      pending.set(response, finish)
      response.on('close', () => pending.delete(response))
    }
    else { finish() }
    return
  }
  return json(response, { message: `Unexpected mock route: ${path}` }, 404)
}).listen(4319, '127.0.0.1')
