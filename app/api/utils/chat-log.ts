export type ChatLogStatus = 'completed' | 'error' | 'incomplete'

export interface ChatLogRecord {
  schemaVersion: 1
  environment: 'test' | 'production'
  appId: string
  requestId: string
  conversationId: string
  messageId: string
  createdAt: string
  query: string
  answer: string
  status: ChatLogStatus
  capture: 'full' | 'size_limit' | 'invalid_stream'
}

const MAX_ANSWER = 120_000
const MAX_EVENT = 256_000
const identifier = (value: unknown): string =>
  typeof value === 'string' && /^[\w-]{1,64}$/.test(value) ? value : ''

/** Observes only the public answer, never node inputs, prompts or credentials. */
export function createChatLogCollector(initial: Omit<ChatLogRecord, 'schemaVersion' | 'answer' | 'status' | 'capture' | 'messageId'>) {
  const record: ChatLogRecord = { ...initial, schemaVersion: 1, messageId: '', answer: '', status: 'incomplete', capture: 'full' }
  const decoder = new TextDecoder()
  let pending = ''
  let data: string[] = []
  let eventSize = 0
  let ended = false
  let failed = false
  let disabled = false
  const stopCapture = (reason: ChatLogRecord['capture']) => {
    disabled = true
    record.capture = reason
    pending = ''
    data = []
  }
  const dispatch = () => {
    if (!data.length) { return }
    const raw = data.join('\n')
    data = []
    eventSize = 0
    try {
      const event = JSON.parse(raw) as Record<string, unknown>
      if (!event || typeof event !== 'object') { throw new Error('invalid event') }
      record.conversationId = identifier(event.conversation_id) || record.conversationId
      if (['message', 'agent_message', 'message_end', 'message_replace'].includes(String(event.event))) {
        record.messageId = identifier(event.message_id) || identifier(event.id) || record.messageId
      }
      if (event.event === 'message' || event.event === 'agent_message' || event.event === 'message_replace') {
        if (typeof event.answer !== 'string') { throw new Error('missing answer') }
        const answer = event.event === 'message_replace' ? event.answer : record.answer + event.answer
        record.answer = answer.slice(0, MAX_ANSWER)
        if (answer.length > MAX_ANSWER) { stopCapture('size_limit') }
      }
      if (event.event === 'message_end') { ended = true }
      if (event.event === 'error') { failed = true }
      if (event.event === 'workflow_finished') {
        const details = event.data as { status?: string } | undefined
        if (details?.status === 'failed' || details?.status === 'stopped' || details?.status === 'partial-succeeded') { failed = true }
      }
    }
    catch { stopCapture('invalid_stream') }
  }
  return {
    push(chunk: Uint8Array) {
      if (disabled) { return }
      pending += decoder.decode(chunk, { stream: true })
      while (true) {
        const index = pending.indexOf('\n')
        if (disabled || index < 0) { break }
        const line = pending.slice(0, index).replace(/\r$/, '')
        pending = pending.slice(index + 1)
        if (line === '') { dispatch() }
        else if (line.startsWith('data:')) {
          data.push(line.slice(5).replace(/^ /, ''))
          eventSize += line.length
          if (eventSize > MAX_EVENT) { stopCapture('size_limit') }
        }
      }
      if (pending.length + eventSize > MAX_EVENT) { stopCapture('size_limit') }
    },
    finish(transport: 'eof' | 'error' | 'cancel' = 'eof'): ChatLogRecord {
      if (transport === 'error') { failed = true }
      pending += decoder.decode()
      // An unfinished SSE frame is never accepted as a complete answer.
      if (pending.trim() || data.length) { record.capture = disabled ? record.capture : 'invalid_stream' }
      record.status = failed ? 'error' : transport === 'eof' && ended && record.capture === 'full' && record.messageId && record.conversationId ? 'completed' : 'incomplete'
      return { ...record }
    },
  }
}

/** Observe as bytes are forwarded, rather than teeing an unbounded slow branch. */
export function observeChatStream(source: ReadableStream<Uint8Array<ArrayBuffer>>, collector: ReturnType<typeof createChatLogCollector>) {
  const reader = source.getReader()
  let settled = false
  let resolve!: (record: ChatLogRecord) => void
  const result = new Promise<ChatLogRecord>((done) => { resolve = done })
  const finish = (reason: 'eof' | 'error' | 'cancel') => {
    if (!settled) {
      settled = true
      resolve(collector.finish(reason))
    }
  }
  const stream = new ReadableStream<Uint8Array<ArrayBuffer>>({
    async pull(controller) {
      try {
        const chunk = await reader.read()
        if (chunk.done) {
          finish('eof')
          controller.close()
        }
        else {
          collector.push(chunk.value)
          controller.enqueue(chunk.value)
        }
      }
      catch (error) {
        finish('error')
        controller.error(error)
      }
    },
    async cancel() {
      finish('cancel')
      await reader.cancel().catch(() => {})
    },
  })
  return { stream, result }
}
