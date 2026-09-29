import type { NextRequest } from 'next/server'
import { getDifyClient, getInfo } from '@/app/api/utils/common'
import { difyErrorResponse, invalidRequestResponse } from '@/app/api/utils/dify-error'
import { rejectCrossOriginRequest } from '@/app/api/utils/request-guard'

export async function POST(request: NextRequest) {
  const rejected = rejectCrossOriginRequest(request)
  if (rejected) { return rejected }

  let formData: FormData
  try {
    formData = await request.formData()
  }
  catch {
    return invalidRequestResponse()
  }

  try {
    const { user } = getInfo(request)
    formData.append('user', user)
    const client = getDifyClient()
    const res = await client.fileUpload(formData)
    return new Response(res.data.id as any)
  }
  catch (error) {
    return difyErrorResponse(error, 'ファイルのアップロードに失敗しました。もう一度お試しください。')
  }
}
