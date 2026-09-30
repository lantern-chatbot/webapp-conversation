import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildLegacySessionCookieDeletion, buildSessionCookie } from '../../app/api/utils/session-cookie.ts'

const SESSION_ID = '123e4567-e89b-12d3-a456-426614174000'

const parse = (cookie) => {
  const [pair, ...attributes] = cookie.split('; ')
  return { pair, attributes }
}

describe('session_id cookie', () => {
  it('is HttpOnly, site-wide and cross-site capable when embedded in an iframe', () => {
    const { pair, attributes } = parse(buildSessionCookie(SESSION_ID, true))
    assert.equal(pair, `session_id=${SESSION_ID}`)
    assert.deepEqual(attributes.sort(), ['HttpOnly', 'Path=/', 'SameSite=None', 'Secure'])
  })

  it('is HttpOnly and site-wide without SameSite=None otherwise', () => {
    const { pair, attributes } = parse(buildSessionCookie(SESSION_ID, false))
    assert.equal(pair, `session_id=${SESSION_ID}`)
    assert.deepEqual(attributes.sort(), ['HttpOnly', 'Path=/'])
  })

  // Earlier versions set session_id without Path, so browsers kept it at /api without HttpOnly.
  it('expires the legacy /api cookie in a form an embedded iframe accepts', () => {
    const { pair, attributes } = parse(buildLegacySessionCookieDeletion(true))
    assert.equal(pair, 'session_id=')
    assert.deepEqual(attributes.sort(), ['HttpOnly', 'Max-Age=0', 'Path=/api', 'SameSite=None', 'Secure'])
  })

  it('expires the legacy /api cookie without SameSite=None otherwise', () => {
    const { attributes } = parse(buildLegacySessionCookieDeletion(false))
    assert.deepEqual(attributes.sort(), ['HttpOnly', 'Max-Age=0', 'Path=/api'])
  })
})
