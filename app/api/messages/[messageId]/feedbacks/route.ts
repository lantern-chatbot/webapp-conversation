import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getDifyClient, getInfo } from '@/app/api/utils/common'
import { rejectCrossOriginRequest } from '@/app/api/utils/request-guard'

export async function POST(request: NextRequest, { params }: {
  params: Promise<{ messageId: string }>
}) {
  const rejected = rejectCrossOriginRequest(request)
  if (rejected) { return rejected }

  const body = await request.json()
  const {
    rating,
  } = body
  const { messageId } = await params
  const { user } = getInfo(request)
  const client = getDifyClient()
  const { data } = await client.messageFeedback(messageId, rating, user)
  return NextResponse.json(data)
}
