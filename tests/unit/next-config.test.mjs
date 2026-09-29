import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { afterEach, describe, it } from 'node:test'

const require = createRequire(import.meta.url)
const configPath = require.resolve('../../next.config.js')
const originalVercel = process.env.VERCEL

function loadConfig(vercel) {
  if (vercel === undefined) {
    delete process.env.VERCEL
  }
  else {
    process.env.VERCEL = vercel
  }
  delete require.cache[configPath]
  return require(configPath)
}

afterEach(() => {
  if (originalVercel === undefined) {
    delete process.env.VERCEL
  }
  else {
    process.env.VERCEL = originalVercel
  }
  delete require.cache[configPath]
})

describe('next.config.js response headers', () => {
  it('adds nosniff and referrer policy to every path', async () => {
    const rules = await loadConfig().headers()
    assert.deepEqual(rules, [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ])
  })

  it('does not restrict framing so the chat can be embedded', async () => {
    const rules = await loadConfig().headers()
    for (const { headers } of rules) {
      for (const { key, value } of headers) {
        assert.notEqual(key.toLowerCase(), 'x-frame-options')
        assert.doesNotMatch(value, /frame-ancestors/i)
      }
    }
  })

  it('disables the X-Powered-By header', () => {
    assert.equal(loadConfig().poweredByHeader, false)
  })

  it('keeps standalone output outside Vercel only', () => {
    assert.equal(loadConfig().output, 'standalone')
    assert.equal(loadConfig('1').output, undefined)
  })
})
