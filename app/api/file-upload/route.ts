import type { NextRequest } from 'next/server'
import { getDifyClient, getInfo } from '@/app/api/utils/common'
import { rejectCrossOriginRequest } from '@/app/api/utils/request-guard'

export async function POST(request: NextRequest) {
  const rejected = rejectCrossOriginRequest(request)
  if (rejected) { return rejected }

  try {
    const formData = await request.formData()
    const { user } = getInfo(request)
    formData.append('user', user)
    const client = getDifyClient()
    const res = await client.fileUpload(formData)
    return new Response(res.data.id as any)
  }
  catch (e: any) {
    return new Response(e.message)
  }
}
