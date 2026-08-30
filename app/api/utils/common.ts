import type { NextRequest } from 'next/server'
import { ChatClient } from 'dify-client'
import { v4 } from 'uuid'
import { API_URL, APP_ID, APP_INFO } from '@/config'
import { DIFY_API_KEY } from '@/config/server'

const userPrefix = `user_${APP_ID}:`

export const getInfo = (request: NextRequest) => {
  const sessionId = request.cookies.get('session_id')?.value || v4()
  const user = userPrefix + sessionId
  return {
    sessionId,
    user,
  }
}

export const setSession = (sessionId: string) => {
  if (APP_INFO.disable_session_same_site)
  { return { 'Set-Cookie': `session_id=${sessionId}; SameSite=None; Secure` } }

  return { 'Set-Cookie': `session_id=${sessionId}` }
}

if (!DIFY_API_KEY) { throw new Error('DIFY_API_KEY is not configured') }

export const client = new ChatClient(DIFY_API_KEY, API_URL || undefined)
