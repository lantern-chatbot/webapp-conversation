import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { sessionKey, signSessionId, verifySessionId } from '../../app/api/utils/session-id.ts'

const ID = '3f2b8c1e-9d4a-4b7e-8c2f-1a2b3c4d5e6f'
const KEY = sessionKey('fixture-session-secret', 'fixture-key')

describe('session_id signature', () => {
  it('returns the session id of a value this server signed', () => {
    assert.equal(verifySessionId(signSessionId(ID, KEY), KEY), ID)
  })

  for (const [name, value] of [
    ['a missing cookie', undefined],
    ['an unsigned UUID (an earlier cookie or a planted value)', ID],
    ['a rewritten signature', `${ID}.${'A'.repeat(43)}`],
    ['a value signed with another key', signSessionId(ID, sessionKey('other-secret', ''))],
    ['a signature moved to another id', `00000000-0000-4000-8000-000000000000.${signSessionId(ID, KEY).split('.')[1]}`],
    ['a signed id that is not a UUID', signSessionId('attacker', KEY)],
    ['a signature of another length', `${ID}.abc`],
  ]) {
    it(`rejects ${name}`, () => {
      assert.equal(verifySessionId(value, KEY), undefined)
    })
  }

  it('derives the key from the Dify API key without SESSION_SECRET, and uses a per-process key without either', () => {
    const derived = sessionKey('', 'fixture-key')
    assert.ok(derived.equals(sessionKey('', 'fixture-key')))
    assert.ok(!derived.equals(Buffer.from('fixture-key')))
    assert.ok(!sessionKey('', '').equals(sessionKey('', '')))
  })
})
