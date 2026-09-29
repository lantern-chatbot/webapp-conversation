import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isCrossOriginRequest, rejectCrossOriginRequest } from '../../app/api/utils/request-guard.ts'

const APP_URL = 'https://chat.example.com/api/chat-messages'
const requestWith = headers => new Request(APP_URL, { method: 'POST', headers })

describe('API request origin guard', () => {
  it('accepts requests the browser labels as same-origin or user-initiated', () => {
    assert.equal(isCrossOriginRequest(requestWith({ 'sec-fetch-site': 'same-origin' })), false)
    assert.equal(isCrossOriginRequest(requestWith({ 'sec-fetch-site': 'none' })), false)
  })

  it('rejects requests the browser labels as same-site or cross-site', () => {
    assert.equal(isCrossOriginRequest(requestWith({ 'sec-fetch-site': 'same-site' })), true)
    assert.equal(isCrossOriginRequest(requestWith({ 'sec-fetch-site': 'cross-site' })), true)
  })

  it('prefers Fetch Metadata over Origin when both are present', () => {
    const request = requestWith({ 'sec-fetch-site': 'cross-site', 'origin': 'https://chat.example.com' })
    assert.equal(isCrossOriginRequest(request), true)
  })

  it('falls back to comparing Origin with the app origin', () => {
    assert.equal(isCrossOriginRequest(requestWith({ origin: 'https://chat.example.com' })), false)
    assert.equal(isCrossOriginRequest(requestWith({ origin: 'https://evil.example' })), true)
    assert.equal(isCrossOriginRequest(requestWith({ origin: 'null' })), true)
  })

  it('compares Origin with the public host behind a reverse proxy', () => {
    const internal = headers => new Request('http://localhost:3000/api/chat-messages', { method: 'POST', headers })
    assert.equal(isCrossOriginRequest(internal({ 'origin': 'https://chat.example.com', 'x-forwarded-host': 'chat.example.com' })), false)
    assert.equal(isCrossOriginRequest(internal({ origin: 'https://chat.example.com', host: 'chat.example.com' })), false)
    assert.equal(isCrossOriginRequest(internal({ 'origin': 'https://evil.example', 'x-forwarded-host': 'chat.example.com' })), true)
    assert.equal(isCrossOriginRequest(internal({ origin: 'https://chat.example.com' })), true)
  })

  it('does not reject requests without browser origin headers', () => {
    assert.equal(isCrossOriginRequest(requestWith({})), false)
  })

  it('returns a 403 response only for cross-origin requests', async () => {
    assert.equal(rejectCrossOriginRequest(requestWith({ 'sec-fetch-site': 'same-origin' })), undefined)
    const rejected = rejectCrossOriginRequest(requestWith({ 'sec-fetch-site': 'cross-site' }))
    assert.equal(rejected?.status, 403)
    assert.deepEqual(await rejected?.json(), { message: 'このリクエストは受け付けられません。' })
  })
})
