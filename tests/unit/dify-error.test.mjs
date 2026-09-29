import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { describe, it } from 'node:test'
import axios, { AxiosError } from 'axios'
import { difyErrorResponse, difyErrorStatus, discardDifyErrorBody, invalidRequestResponse } from '../../app/api/utils/dify-error.ts'

const SECRET_KEY = 'app-secret-dify-key'
const MESSAGE = '会話履歴の取得に失敗しました。ページを再読み込みしてください。'

const listen = async (handler) => {
  const server = createServer(handler)
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  return { server, url: `http://127.0.0.1:${server.address().port}/v1/conversations` }
}

const requestError = async (url, options = {}) => {
  try {
    await axios.get(url, { headers: { Authorization: `Bearer ${SECRET_KEY}` }, ...options })
  }
  catch (error) {
    return error
  }
  throw new Error('request unexpectedly succeeded')
}

const assertNoInternals = (text, error, url) => {
  const { host } = new URL(url)
  for (const leaked of [SECRET_KEY, 'Bearer', 'Authorization', host, '127.0.0.1', '/v1/', error.message, error.stack, 'ECONNREFUSED']) {
    assert.equal(text.includes(leaked), false, `response body contains ${leaked}`)
  }
}

describe('Dify error responses', () => {
  it('hides the address and API key of a refused connection and responds with 502', async () => {
    const { server, url } = await listen(() => {})
    server.close()
    await once(server, 'close')
    const error = await requestError(url)
    assert.match(error.message, /ECONNREFUSED/)

    const response = difyErrorResponse(error, MESSAGE)
    assert.equal(response.status, 502)
    const text = await response.text()
    assert.deepEqual(JSON.parse(text), { message: MESSAGE })
    assertNoInternals(text, error, url)
  })

  it('keeps the Dify HTTP status, hides the upstream body and destroys a stream response', async () => {
    const { server, url } = await listen((_req, res) => {
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ code: 'not_found', message: 'upstream detail at /v1/conversations' }))
    })
    try {
      const error = await requestError(url, { responseType: 'stream' })
      assert.equal(error.response.data.destroyed, false)

      const response = difyErrorResponse(error, MESSAGE)
      assert.equal(response.status, 404)
      assert.equal(error.response.data.destroyed, true)
      const text = await response.text()
      assert.deepEqual(JSON.parse(text), { message: MESSAGE })
      assert.equal(text.includes('upstream detail'), false)
      assertNoInternals(text, error, url)
    }
    finally {
      server.close()
    }
  })

  it('maps statuses', () => {
    const httpError = status => new AxiosError('failed', 'ERR_BAD_RESPONSE', undefined, undefined, { status, data: {} })
    assert.equal(difyErrorStatus(httpError(400)), 400)
    assert.equal(difyErrorStatus(httpError(413)), 413)
    assert.equal(difyErrorStatus(httpError(503)), 503)
    // Out-of-range statuses are not trusted.
    assert.equal(difyErrorStatus(httpError(200)), 502)
    assert.equal(difyErrorStatus(httpError(302)), 502)
    assert.equal(difyErrorStatus(httpError(600)), 502)
    assert.equal(difyErrorStatus(new AxiosError('timeout of 1ms exceeded', 'ECONNABORTED')), 502)
    // Anything else is a failure on this server.
    assert.equal(difyErrorStatus(new Error('DIFY_API_KEY is not configured')), 500)
    assert.equal(difyErrorStatus(undefined), 500)
    assert.equal(difyErrorStatus('failed'), 500)
  })

  it('does not include a plain error message', async () => {
    const response = difyErrorResponse(new Error('DIFY_API_KEY is not configured'), MESSAGE)
    assert.equal(response.status, 500)
    assert.deepEqual(await response.json(), { message: MESSAGE })
  })

  it('ignores error bodies that are not streams', () => {
    assert.doesNotThrow(() => discardDifyErrorBody({ response: { data: null } }))
    assert.doesNotThrow(() => discardDifyErrorBody({ response: { data: { destroy: 'no' } } }))
    assert.doesNotThrow(() => discardDifyErrorBody(null))
  })

  it('responds to a malformed request with 400', async () => {
    const response = invalidRequestResponse()
    assert.equal(response.status, 400)
    assert.deepEqual(await response.json(), { message: 'リクエストの形式が正しくありません。' })
  })
})
