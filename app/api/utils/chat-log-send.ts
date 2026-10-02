import type { ChatLogRecord } from './chat-log'

export interface ChatLogConfig {
  environment: 'test' | 'production'
  url: string
  secret: string
}

export function chatLogConfig(env: Record<string, string | undefined>): ChatLogConfig | undefined {
  const mode = env.CHAT_LOG_MODE
  if (!mode || mode === 'off') { return }
  if (mode !== 'test' && mode !== 'production') { throw new Error('invalid_mode') }
  if ((mode === 'production') !== (env.VERCEL_ENV === 'production')) { throw new Error('environment_mismatch') }
  const url = new URL(env.CHAT_LOG_URL || '')
  const google = url.protocol === 'https:' && url.hostname === 'script.google.com' && /^\/macros\/s\/[\w-]+\/exec$/.test(url.pathname)
  const localTest = mode === 'test' && !env.VERCEL_ENV && url.protocol === 'http:' && url.hostname === '127.0.0.1'
  if ((!google && !localTest) || url.username || url.password || url.search || url.hash) { throw new Error('invalid_endpoint') }
  const secret = env.CHAT_LOG_SECRET || ''
  if (secret.length < 32) { throw new Error('invalid_secret') }
  return { environment: mode, url: url.toString(), secret }
}

export const chatLogKey = (record: ChatLogRecord) =>
  `${record.appId}:${record.messageId ? `m:${record.messageId}` : `r:${record.requestId}`}`

async function readSmallJson(response: Response) {
  const reader = response.body?.getReader()
  if (!reader) { throw new Error('invalid_response') }
  let text = ''
  const decoder = new TextDecoder()
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) { break }
      text += decoder.decode(value, { stream: true })
      if (text.length > 8192) { throw new Error('invalid_response') }
    }
    return JSON.parse(text) as { ok?: boolean, key?: string, code?: string }
  }
  finally { await reader.cancel().catch(() => {}) }
}

export async function sendChatLog(record: ChatLogRecord, config: ChatLogConfig, options: {
  fetch?: typeof fetch
  sleep?: (ms: number) => Promise<void>
  timeoutMs?: number
} = {}): Promise<{ ok: boolean, code: string }> {
  const request = options.fetch || fetch
  const sleep = options.sleep || (ms => new Promise(resolve => setTimeout(resolve, ms)))
  let code = 'unavailable'
  for (let attempt = 0; attempt < 3; attempt++) {
    const signal = AbortSignal.timeout(options.timeoutMs || 5000)
    try {
      let response = await request(config.url, {
        method: 'POST',
        redirect: 'manual',
        signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret: config.secret, record }),
      })
      if (response.status === 302 || response.status === 303) {
        const location = new URL(response.headers.get('location') || '', config.url)
        await response.body?.cancel()
        if (location.protocol !== 'https:' || location.hostname !== 'script.googleusercontent.com' || location.username || location.password || location.pathname !== '/macros/echo') {
          return { ok: false, code: 'invalid_redirect' }
        }
        // Google ContentService redirects to a GET. Never resend the secret body.
        response = await request(location, { method: 'GET', redirect: 'manual', signal })
      }
      if (!response.ok) {
        await response.body?.cancel()
        code = `http_${response.status}`
        if (response.status !== 429 && response.status < 500) { return { ok: false, code } }
      }
      else {
        const result = await readSmallJson(response)
        if (result.ok === true && result.key === chatLogKey(record) && ['stored', 'duplicate'].includes(result.code || '')) {
          return { ok: true, code: result.code! }
        }
        if (result.ok === false && ['unauthorized', 'invalid_record', 'environment_mismatch', 'configuration_error'].includes(result.code || '')) {
          return { ok: false, code: result.code! }
        }
        code = result.code === 'busy' ? 'busy' : 'invalid_response'
      }
    }
    catch { code = signal.aborted ? 'timeout' : 'unavailable' }
    if (attempt < 2) { await sleep(250 * (attempt + 1)) }
  }
  return { ok: false, code }
}
