import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { resolveParentOrigin } from '../../app/components/chat/rich-content/parent-origin.ts'

describe('Parent frame origin for postMessage', () => {
  it('does not send when the chat is not framed', () => {
    assert.equal(resolveParentOrigin({
      isFramed: false,
      ancestorOrigins: ['https://lantern-inc.jp'],
      referrer: 'https://lantern-inc.jp/',
    }), null)
  })

  it('uses the immediate parent from ancestorOrigins first', () => {
    assert.equal(resolveParentOrigin({
      isFramed: true,
      ancestorOrigins: ['https://lantern-inc.jp', 'https://outer.example'],
      referrer: 'https://other.example/page',
    }), 'https://lantern-inc.jp')
  })

  it('falls back to the referrer origin without ancestorOrigins', () => {
    assert.equal(resolveParentOrigin({
      isFramed: true,
      referrer: 'https://lantern-inc.jp/company/about?x=1#top',
    }), 'https://lantern-inc.jp')
    assert.equal(resolveParentOrigin({
      isFramed: true,
      ancestorOrigins: [],
      referrer: 'http://localhost:3000/',
    }), 'http://localhost:3000')
  })

  it('does not send when the parent origin cannot be determined', () => {
    for (const source of [
      { isFramed: true },
      { isFramed: true, ancestorOrigins: null, referrer: '' },
      { isFramed: true, ancestorOrigins: ['null'], referrer: 'https://lantern-inc.jp/' },
      { isFramed: true, referrer: 'null' },
      { isFramed: true, referrer: 'not a url' },
      { isFramed: true, referrer: 'file:///C:/page.html' },
      { isFramed: true, ancestorOrigins: ['about:blank'] },
    ]) {
      assert.equal(resolveParentOrigin(source), null, JSON.stringify(source))
    }
  })
})
