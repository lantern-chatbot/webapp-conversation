import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildSessionCookie } from '../../app/api/utils/session-cookie.ts'

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
})
