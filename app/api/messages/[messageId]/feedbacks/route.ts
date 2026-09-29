import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getDifyClient, getInfo } from '@/app/api/utils/common'
import { rejectCrossOriginRequest } from '@/app/api/utils/request-guard'
import { badRequestResponse, isValidId, parseFeedbackBody } from '@/app/api/utils/request-validation'

export async function POST(request: NextRequest, { params }: {
  params: Promise<{ messageId: string }>
}) {
  const rejected = rejectCrossOriginRequest(request)
  if (rejected) { return rejected }

  const { messageId } = await params
  const body = parseFeedbackBody(await request.json().catch(() => undefined))
  if (!isValidId(messageId) || !body) { return badRequestResponse() }
  const { user } = getInfo(request)
  const client = getDifyClient()
  // dify-client types rating as a number; the API takes 'like' | 'dislike' | null.
  const { data } = await client.messageFeedback(messageId, body.rating as unknown as number, user)
  return NextResponse.json(data)
}
