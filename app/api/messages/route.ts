import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getDifyClient, getInfo, setSession } from '@/app/api/utils/common'
import { difyErrorResponse } from '@/app/api/utils/dify-error'
import { rejectCrossOriginRequest } from '@/app/api/utils/request-guard'
import { badRequestResponse, isValidId } from '@/app/api/utils/request-validation'

export async function GET(request: NextRequest) {
  const rejected = rejectCrossOriginRequest(request)
  if (rejected) { return rejected }

  const { sessionId, user } = getInfo(request)
  const { searchParams } = new URL(request.url)
  const conversationId = searchParams.get('conversation_id')
  if (!isValidId(conversationId)) { return badRequestResponse() }
  try {
    const client = getDifyClient()
    const { data }: any = await client.getConversationMessages(user, conversationId)
    return NextResponse.json(data, {
      headers: setSession(sessionId),
    })
  }
  catch (error) {
    return difyErrorResponse(error, 'メッセージの取得に失敗しました。ページを再読み込みしてください。')
  }
}
