import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { invalidIdResponse, isValidId } from '../../app/api/utils/validate-id.ts'

describe('Dify ID validation', () => {
  it('accepts Dify UUIDs and simple identifiers', () => {
    assert.equal(isValidId('3f2b8c1e-9d4a-4b7e-8c2f-1a2b3c4d5e6f'), true)
    assert.equal(isValidId('ci-conversation'), true)
    assert.equal(isValidId('a'.repeat(64)), true)
  })

  it('rejects values that could change the upstream path', () => {
    for (const value of ['..', '../evil', 'a/b', 'a%2Fb', 'a?b', 'a#b', 'a b', '']) {
      assert.equal(isValidId(value), false, value)
    }
  })

  it('rejects overlong and non-string values', () => {
    assert.equal(isValidId('a'.repeat(65)), false)
    assert.equal(isValidId(null), false)
    assert.equal(isValidId(undefined), false)
    assert.equal(isValidId(123), false)
  })

  it('responds with 400', async () => {
    const response = invalidIdResponse()
    assert.equal(response.status, 400)
    assert.deepEqual(await response.json(), { message: 'リクエストの形式が正しくありません。' })
  })
})
