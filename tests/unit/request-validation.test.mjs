import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  MAX_QUERY_LENGTH,
  badRequestResponse,
  isValidId,
  parseChatMessageBody,
  parseFeedbackBody,
  parseRenameBody,
} from '../../app/api/utils/request-validation.ts'

const UUID = '3f2b8c1e-9d4a-4b7e-8c2f-1a2b3c4d5e6f'

describe('Dify ID validation', () => {
  it('accepts Dify UUIDs and simple identifiers', () => {
    assert.equal(isValidId(UUID), true)
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
    const response = badRequestResponse()
    assert.equal(response.status, 400)
    assert.deepEqual(await response.json(), { message: 'リクエストの形式が正しくありません。' })
  })
})

describe('chat message body', () => {
  it('accepts what the chat UI sends and drops everything else', () => {
    const parsed = parseChatMessageBody({
      query: 'AI導入について相談したい',
      inputs: { company: 'LANTERN', employees: 10, urgent: false },
      conversation_id: UUID,
      response_mode: 'blocking',
      user: 'someone-else',
      files: [{ type: 'image', transfer_method: 'local_file', upload_file_id: UUID, url: '', extra: 'x' }],
    })
    assert.deepEqual(parsed, {
      query: 'AI導入について相談したい',
      inputs: { company: 'LANTERN', employees: 10, urgent: false },
      conversationId: UUID,
      files: [{ type: 'image', transfer_method: 'local_file', upload_file_id: UUID }],
    })
  })

  it('treats a missing or empty conversation ID as a new conversation', () => {
    for (const conversationId of [undefined, null, '']) {
      assert.deepEqual(parseChatMessageBody({ query: 'q', conversation_id: conversationId }), { query: 'q', inputs: {}, conversationId: undefined, files: undefined })
    }
  })

  it('enforces the query boundaries', () => {
    assert.ok(parseChatMessageBody({ query: 'a'.repeat(MAX_QUERY_LENGTH) }))
    for (const query of ['a'.repeat(MAX_QUERY_LENGTH + 1), '', '   ', 123, undefined]) {
      assert.equal(parseChatMessageBody({ query }), undefined)
    }
  })

  it('rejects nested inputs, invalid keys and oversized inputs', () => {
    for (const inputs of [{ nested: { a: 1 } }, { list: [1] }, { 'bad-key': 'x' }, { '1st': 'x' }, { big: 'a'.repeat(2001) }, { n: Number.NaN }, 'text', [1]]) {
      assert.equal(parseChatMessageBody({ query: 'q', inputs }), undefined, JSON.stringify(inputs))
    }
  })

  it('rejects files that are not uploaded images', () => {
    for (const files of [
      [{ type: 'image', transfer_method: 'remote_url', upload_file_id: UUID, url: 'https://example.com/a.png' }],
      [{ type: 'document', transfer_method: 'local_file', upload_file_id: UUID }],
      [{ type: 'image', transfer_method: 'local_file', upload_file_id: '../x' }],
      'file',
      Array.from({ length: 11 }, () => ({ type: 'image', transfer_method: 'local_file', upload_file_id: UUID })),
    ]) {
      assert.equal(parseChatMessageBody({ query: 'q', files }), undefined)
    }
  })

  it('rejects invalid conversation IDs and non-object bodies', () => {
    assert.equal(parseChatMessageBody({ query: 'q', conversation_id: '../evil' }), undefined)
    for (const body of [undefined, null, 'q', ['q']]) {
      assert.equal(parseChatMessageBody(body), undefined)
    }
  })
})

describe('rename and feedback bodies', () => {
  it('accepts automatic naming or a bounded name', () => {
    assert.deepEqual(parseRenameBody({ auto_generate: true }), { autoGenerate: true, name: undefined })
    assert.deepEqual(parseRenameBody({ name: '相談' }), { autoGenerate: false, name: '相談' })
    assert.ok(parseRenameBody({ name: 'a'.repeat(100) }))
  })

  it('rejects rename bodies without a usable instruction', () => {
    for (const body of [{}, { auto_generate: false }, { auto_generate: 'true' }, { name: '' }, { name: '  ' }, { name: 'a'.repeat(101) }, { name: 1 }, null]) {
      assert.equal(parseRenameBody(body), undefined, JSON.stringify(body))
    }
  })

  it('accepts only the three ratings', () => {
    for (const rating of ['like', 'dislike', null]) {
      assert.deepEqual(parseFeedbackBody({ rating }), { rating })
    }
    for (const body of [{ rating: 'love' }, { rating: 1 }, {}, null]) {
      assert.equal(parseFeedbackBody(body), undefined, JSON.stringify(body))
    }
  })
})
