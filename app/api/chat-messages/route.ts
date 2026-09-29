import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { isAxiosError } from 'axios'
import { getDifyClient, getInfo } from '@/app/api/utils/common'
import { rejectCrossOriginRequest } from '@/app/api/utils/request-guard'

export async function POST(request: NextRequest) {
  const rejected = rejectCrossOriginRequest(request)
  if (rejected) { return rejected }

  const body = await request.json()
  const {
    inputs,
    query,
    files,
    conversation_id: conversationId,
    response_mode: responseMode,
  } = body
  const { user } = getInfo(request)
  const client = getDifyClient()
  try {
    const res = await client.createChatMessage(inputs, query, user, responseMode === 'streaming', conversationId, files)
    if (responseMode !== 'streaming') { return NextResponse.json(res.data) }
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
