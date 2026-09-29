import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { isAxiosError } from 'axios'
import { getDifyClient, getInfo } from '@/app/api/utils/common'
import { rejectCrossOriginRequest } from '@/app/api/utils/request-guard'
import { badRequestResponse, parseChatMessageBody } from '@/app/api/utils/request-validation'

export async function POST(request: NextRequest) {
  const rejected = rejectCrossOriginRequest(request)
  if (rejected) { return rejected }

  const body = parseChatMessageBody(await request.json().catch(() => undefined))
  if (!body) { return badRequestResponse() }
  const { user } = getInfo(request)
  const client = getDifyClient()
  try {
    // The UI always streams; do not let callers switch to blocking mode.
    // dify-client types `files` as DOM File objects; its implementation sends them as JSON.
    const res = await client.createChatMessage(body.inputs, body.query, user, true, body.conversationId, body.files as unknown as File[] | undefined)
    return new Response(res.data, {
      headers: { 'Content-Type': 'text/event-stream' },
    })
  }
  catch (error) {
    // The SDK returns a stream even for error responses. Do not forward an
    // Axios error (which includes credentials) or a non-JSON Next.js error page.
    if (isAxiosError(error)) {
      const status = error.response?.status || 502
      error.response?.data?.destroy?.()
      return NextResponse.json({ message: '回答の取得に失敗しました。もう一度お試しください。' }, { status })
    }
    throw error
  }
}
