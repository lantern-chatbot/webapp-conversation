import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import robots from '../../app/robots.ts'

describe('robots.txt', () => {
  it('disallows the whole site for every user agent', () => {
    assert.deepEqual(robots(), {
      rules: {
        userAgent: '*',
        disallow: '/',
      },
    })
  })

  it('does not allow any path or advertise a sitemap', () => {
    const result = robots()
    const rules = Array.isArray(result.rules) ? result.rules : [result.rules]
    for (const rule of rules) {
      assert.equal(rule.allow, undefined)
    }
    assert.equal(result.sitemap, undefined)
  })
})
