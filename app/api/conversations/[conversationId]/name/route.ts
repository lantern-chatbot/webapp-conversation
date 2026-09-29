import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getDifyClient, getInfo } from '@/app/api/utils/common'
import { difyErrorResponse } from '@/app/api/utils/dify-error'
import { rejectCrossOriginRequest } from '@/app/api/utils/request-guard'
import { badRequestResponse, isValidId, parseRenameBody } from '@/app/api/utils/request-validation'

export async function POST(request: NextRequest, { params }: {
  params: Promise<{ conversationId: string }>
}) {
  const rejected = rejectCrossOriginRequest(request)
  if (rejected) { return rejected }

  const { conversationId } = await params
  const body = parseRenameBody(await request.json().catch(() => undefined))
  if (!isValidId(conversationId) || !body) { return badRequestResponse() }
  const { user } = getInfo(request)

  try {
    const client = getDifyClient()
    // dify-client types require name, but index.js sends it as given and Dify ignores it when auto_generate is true.
    const { data } = await client.renameConversation(conversationId, body.name as string, user, body.autoGenerate)
    return NextResponse.json(data)
  }
  catch (error) {
    return difyErrorResponse(error, '会話名の更新に失敗しました。')
  }
}
