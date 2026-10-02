import type { NextRequest } from 'next/server'
import { randomUUID } from 'node:crypto'
import { after } from 'next/server'
import { APP_ID } from '@/config'
import { getChatLogConfig } from '@/config/server'
import { createChatLogCollector, observeChatStream } from '@/app/api/utils/chat-log'
import { sendChatLog } from '@/app/api/utils/chat-log-send'
import { getDifyClient, getInfo } from '@/app/api/utils/common'
import { difyErrorResponse } from '@/app/api/utils/dify-error'
import { rejectCrossOriginRequest } from '@/app/api/utils/request-guard'
import { badRequestResponse, parseChatMessageBody } from '@/app/api/utils/request-validation'

export async function POST(request: NextRequest) {
  const rejected = rejectCrossOriginRequest(request)
  if (rejected) { return rejected }

  const body = parseChatMessageBody(await request.json().catch(() => undefined))
  if (!body) { return badRequestResponse() }
  const { user } = getInfo(request)
  const client = getDifyClient()
  const logConfig = getChatLogConfig()
  const collector = logConfig && createChatLogCollector({
    environment: logConfig.environment,
    appId: APP_ID,
    requestId: randomUUID(),
    conversationId: body.conversationId || '',
    createdAt: new Date().toISOString(),
    query: body.query,
  })
  const save = async (record: ReturnType<NonNullable<typeof collector>['finish']>) => {
    if (!logConfig) { return }
    const result = await sendChatLog(record, logConfig)
    if (!result.ok) { console.warn('chat_log_delivery_failed', { requestId: record.requestId, code: result.code }) }
  }
  try {
    // The UI always streams; do not let callers switch to blocking mode.
    // dify-client types `files` as DOM File objects; its implementation sends them as JSON.
    const res = await client.createChatMessage(body.inputs, body.query, user, true, body.conversationId, body.files as unknown as File[] | undefined)
    let stream = new Response(res.data).body
    if (collector && stream) {
      const observed = observeChatStream(stream, collector)
      stream = observed.stream
      after(async () => { await save(await observed.result) })
    }
    return new Response(stream, {
      headers: { 'Content-Type': 'text/event-stream' },
    })
  }
  catch (error) {
    if (collector) { after(() => save(collector.finish('error'))) }
    return difyErrorResponse(error, '回答の取得に失敗しました。もう一度お試しください。')
  }
}
