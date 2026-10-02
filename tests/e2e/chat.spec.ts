import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page, request }) => {
  await request.post('http://127.0.0.1:4319/reset')
  // Keep fonts/analytics and accidental external API calls out of CI.
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url())
    return url.hostname === '127.0.0.1' ? route.continue() : route.abort()
  })
  await page.goto('/')
  await expect(page.getByRole('textbox')).toBeVisible()
  // An ordinary state update must not repeat app initialization.
  await page.route('**/api/parameters', () => {
    throw new Error('App parameters were requested again after initialization')
  })
})

test('streams an answer through the API, hides tokens and preserves the conversation', async ({ page, request }) => {
  const input = page.getByRole('textbox')
  await input.fill('AI導入について相談したい')
  const sent = page.waitForRequest('**/api/chat-messages')
  await input.press('Enter')
  expect((await sent).postDataJSON()).toMatchObject({ query: 'AI導入について相談したい', response_mode: 'streaming' })
  await expect(page.getByText('ご相談を受け付けました。', { exact: true })).toBeVisible()
  await expect(page.getByText('[[LANTERN_CARD:', { exact: false })).toHaveCount(0)
  await expect(page.getByRole('link', { name: /AI導入支援を見る/ })).toHaveCount(0)
  const named = page.waitForResponse('**/api/conversations/ci-conversation/name')
  await request.post('http://127.0.0.1:4319/complete')
  await named
  await expect(page.getByRole('link', { name: /AI導入支援を見る/ })).toHaveAttribute('href', 'https://lantern-inc.jp/service/ai-consulting')
  await expect(input).toHaveValue('')

  await input.fill('続けて相談します')
  const continued = page.waitForRequest('**/api/chat-messages')
  await input.press('Enter')
  expect((await continued).postDataJSON()).toMatchObject({ conversation_id: 'ci-conversation' })
  await expect(page.getByText('ご相談を受け付けました。', { exact: true })).toHaveCount(2)
  await expect.poll(async () => (await (await request.get('http://127.0.0.1:4319/chat-logs')).json()).records.length).toBe(2)
  const { records } = await (await request.get('http://127.0.0.1:4319/chat-logs')).json()
  expect(records.map((record: { query: string }) => record.query)).toEqual(['AI導入について相談したい', '続けて相談します'])
  for (const record of records) {
    expect(record).toMatchObject({ answer: 'ご相談を受け付けました。\n[[LANTERN_CARD:ai-consulting]]', conversationId: 'ci-conversation', status: 'completed' })
  }
})

test('keeps answering when log storage is unavailable and bounds retries', async ({ page, request }) => {
  await request.post('http://127.0.0.1:4319/fail-chat-logs')
  const input = page.getByRole('textbox')
  await input.fill('保存先障害の確認')
  await input.press('Enter')
  await expect(page.getByText('ご相談を受け付けました。', { exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: /AI導入支援を見る/ })).toBeVisible()
  await expect.poll(async () => (await (await request.get('http://127.0.0.1:4319/chat-logs')).json()).attempts).toBe(3)
})

test('recovers after an API error and accepts another question', async ({ page }) => {
  const input = page.getByRole('textbox')
  await input.fill('通信エラーを確認')
  const failed = page.waitForResponse('**/api/chat-messages')
  await input.press('Enter')
  expect((await failed).status()).toBeGreaterThanOrEqual(500)
  await expect(page.getByText('回答の取得に失敗しました。もう一度お試しください。', { exact: true })).toBeVisible()
  await input.fill('再度相談します')
  await input.press('Enter')
  await expect(page.getByText('ご相談を受け付けました。', { exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: /AI導入支援を見る/ })).toBeVisible()
})

test('does not send blank questions', async ({ page }) => {
  let chatRequests = 0
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/chat-messages') { chatRequests++ }
  })
  const input = page.getByRole('textbox')
  await input.fill('   ')
  await input.press('Enter')
  await expect(page.getByText('お気軽にご相談ください。', { exact: true })).toBeVisible()
  expect(chatRequests).toBe(0)
})

test('keeps an overlong question and explains the limit instead of sending it', async ({ page }) => {
  let chatRequests = 0
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/chat-messages') { chatRequests++ }
  })
  const input = page.getByRole('textbox')
  const question = 'あ'.repeat(4001)
  await input.fill(question)
  await input.press('Enter')
  await expect(page.getByText('質問は4,000文字以内で入力してください。', { exact: true })).toBeVisible()
  await expect(input).toHaveValue(question)
  expect(chatRequests).toBe(0)
})
