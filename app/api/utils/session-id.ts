import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

// The session id becomes the Dify user that owns the conversation history, so
// only ids this server issued are accepted (strict session management). An id
// planted in a browser without the signature is replaced by a new one.
const UUID_V4 = /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/

// SESSION_SECRET is preferred. Without it the key is derived from the Dify API
// key, so rotating that key starts new sessions. Without either, a key held in
// memory is used and sessions start over when the server restarts.
export const sessionKey = (sessionSecret: string, difyApiKey: string) => {
  if (sessionSecret) { return Buffer.from(sessionSecret) }
  if (difyApiKey) { return createHmac('sha256', difyApiKey).update('session_id cookie signature').digest() }
  return randomBytes(32)
}

const signatureOf = (sessionId: string, key: Buffer) =>
  createHmac('sha256', key).update(sessionId).digest('base64url')

export const signSessionId = (sessionId: string, key: Buffer) => `${sessionId}.${signatureOf(sessionId, key)}`

// Returns the session id when the cookie value was issued by this server.
export const verifySessionId = (value: string | undefined, key: Buffer): string | undefined => {
  if (!value) { return undefined }
  const separator = value.indexOf('.')
  if (separator < 0) { return undefined }
  const sessionId = value.slice(0, separator)
  if (!UUID_V4.test(sessionId)) { return undefined }
  const expected = Buffer.from(signatureOf(sessionId, key))
  const actual = Buffer.from(value.slice(separator + 1))
  return actual.length === expected.length && timingSafeEqual(actual, expected) ? sessionId : undefined
}
