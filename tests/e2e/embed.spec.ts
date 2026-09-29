import { expect, test } from '@playwright/test'

// localhost is a different site from 127.0.0.1, so this reproduces a cross-site embed.
const HOST_PAGE = 'http://localhost:4318/__embed-host__'

// Chromium blocks a page served by page.route from framing a loopback address.
// Production embeds are public-to-public, so the check is irrelevant here.
test.use({ launchOptions: { args: ['--disable-features=LocalNetworkAccessChecks'] } })

test('answers inside an iframe embedded on another site', async ({ page, request }) => {
  await request.post('http://127.0.0.1:4319/reset')
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url())
    if (url.href === HOST_PAGE) {
      return route.fulfill({
        contentType: 'text/html',
        body: '<iframe src="http://127.0.0.1:4318/" title="chat" style="width:400px;height:680px;border:0"></iframe>',
      })
    }
    return url.hostname === '127.0.0.1' ? route.continue() : route.abort()
  })
  await page.goto(HOST_PAGE)

  const chat = page.frameLocator('iframe[title="chat"]')
  const input = chat.getByRole('textbox')
  await input.fill('埋め込みから相談します')
  const answered = page.waitForResponse(response => new URL(response.url()).pathname === '/api/chat-messages')
  await input.press('Enter')
  expect((await answered).status()).toBe(200)
  await expect(chat.getByText('ご相談を受け付けました。', { exact: true })).toBeVisible()
})
