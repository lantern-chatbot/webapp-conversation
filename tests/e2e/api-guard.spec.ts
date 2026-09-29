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
