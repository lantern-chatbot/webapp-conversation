import { expect, test } from '@playwright/test'

// Browser-free checks of the route handlers; one project is enough.
test.skip(({ isMobile }) => isMobile, 'API-only checks')

const crossSite = { 'Origin': 'https://evil.example', 'Sec-Fetch-Site': 'cross-site' }

const routes = [
  { method: 'GET', path: '/api/parameters' },
  { method: 'GET', path: '/api/conversations' },
  { method: 'GET', path: '/api/messages?conversation_id=ci-conversation' },
  { method: 'POST', path: '/api/chat-messages', data: { inputs: {}, query: 'x', response_mode: 'streaming' } },
  { method: 'POST', path: '/api/conversations/ci-conversation/name', data: { auto_generate: true } },
  { method: 'POST', path: '/api/messages/ci-message-1/feedbacks', data: { rating: 'like' } },
  { method: 'POST', path: '/api/file-upload', multipart: { file: { name: 'a.png', mimeType: 'image/png', buffer: Buffer.from('x') } } },
] as const

for (const route of routes) {
  test(`rejects a cross-site ${route.method} ${route.path.split('?')[0]}`, async ({ request }) => {
    const response = await request.fetch(route.path, { method: route.method, headers: crossSite, ...('data' in route ? { data: route.data } : {}), ...('multipart' in route ? { multipart: route.multipart } : {}) })
    expect(response.status()).toBe(403)
  })
}

test('accepts a same-origin API request', async ({ request, baseURL }) => {
  const response = await request.get('/api/parameters', { headers: { 'Origin': new URL(baseURL!).origin, 'Sec-Fetch-Site': 'same-origin' } })
  expect(response.status()).toBe(200)
})

test.describe('rejects IDs that would change the Dify API path', () => {
  const invalid = [
    { method: 'POST', path: '/api/messages/..%2F..%2Fevil/feedbacks', data: { rating: 'like' } },
    { method: 'POST', path: '/api/conversations/..%2Fchat-messages/name', data: { auto_generate: true } },
    { method: 'GET', path: '/api/messages?conversation_id=..%2Fevil' },
    { method: 'GET', path: '/api/messages' },
  ] as const

  for (const route of invalid) {
    test(`${route.method} ${route.path}`, async ({ request, baseURL }) => {
      const headers = { 'Origin': new URL(baseURL!).origin, 'Sec-Fetch-Site': 'same-origin' }
      const response = await request.fetch(route.path, { method: route.method, headers, ...('data' in route ? { data: route.data } : {}) })
      expect(response.status()).toBe(400)
    })
  }
})

test.describe('rejects request bodies outside the allowlist', () => {
  const invalid = [
    { name: 'blank question', path: '/api/chat-messages', data: { inputs: {}, query: '   ' } },
    { name: 'overlong question', path: '/api/chat-messages', data: { inputs: {}, query: 'a'.repeat(4001) } },
    { name: 'oversized inputs', path: '/api/chat-messages', data: { inputs: { a: 'x'.repeat(32000) }, query: 'q' } },
    { name: 'non-http file URL', path: '/api/chat-messages', data: { query: 'q', files: [{ type: 'image', transfer_method: 'remote_url', upload_file_id: 'ci-file-1', url: 'file:///etc/hosts' }] } },
    { name: 'non-JSON body', path: '/api/chat-messages', data: 'not json' },
    { name: 'rename without instruction', path: '/api/conversations/ci-conversation/name', data: {} },
    { name: 'unknown rating', path: '/api/messages/ci-message-1/feedbacks', data: { rating: 'love' } },
  ]

  for (const body of invalid) {
    test(body.name, async ({ request, baseURL }) => {
      const headers = { 'Origin': new URL(baseURL!).origin, 'Sec-Fetch-Site': 'same-origin', 'Content-Type': 'application/json' }
      const response = await request.post(body.path, { headers, data: body.data })
      expect(response.status()).toBe(400)
    })
  }
})
