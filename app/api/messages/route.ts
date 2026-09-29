import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getDifyClient, getInfo, setSession } from '@/app/api/utils/common'
import { rejectCrossOriginRequest } from '@/app/api/utils/request-guard'
import { invalidIdResponse, isValidId } from '@/app/api/utils/validate-id'

export async function GET(request: NextRequest) {
  const rejected = rejectCrossOriginRequest(request)
  if (rejected) { return rejected }

  const { sessionId, user } = getInfo(request)
  const { searchParams } = new URL(request.url)
  const conversationId = searchParams.get('conversation_id')
  if (!isValidId(conversationId)) { return invalidIdResponse() }
  const client = getDifyClient()
  const { data }: any = await client.getConversationMessages(user, conversationId as string)
  return NextResponse.json(data, {
    headers: setSession(sessionId),
  })
}
