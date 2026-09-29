import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getDifyClient, getInfo, setSession } from '@/app/api/utils/common'
import { discardDifyErrorBody } from '@/app/api/utils/dify-error'
import { rejectCrossOriginRequest } from '@/app/api/utils/request-guard'

export async function GET(request: NextRequest) {
  const rejected = rejectCrossOriginRequest(request)
  if (rejected) { return rejected }

  const { sessionId, user } = getInfo(request)
  try {
    const client = getDifyClient()
    const { data } = await client.getApplicationParameters(user)
    return NextResponse.json(data as object, {
      headers: setSession(sessionId),
    })
  }
  catch (error) {
    // The chat page treats an empty value as "no app settings" and still opens
    // the chat with defaults, so keep this fallback. It carries no error detail.
    discardDifyErrorBody(error)
    return NextResponse.json([])
  }
}
