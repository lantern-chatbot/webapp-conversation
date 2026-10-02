import type { NextRequest } from 'next/server'
import { ChatClient } from 'dify-client'
import { v4 } from 'uuid'
import { API_URL, APP_ID, APP_INFO } from '@/config'
import { DIFY_API_KEY, SESSION_SECRET } from '@/config/server'
import { buildLegacySessionCookieDeletion, buildSessionCookie, SESSION_COOKIE_NAME } from './session-cookie'
import { sessionKey, signSessionId, verifySessionId } from './session-id'

const userPrefix = `user_${APP_ID}:`
const key = sessionKey(SESSION_SECRET, DIFY_API_KEY)

export const getInfo = (request: NextRequest) => {
  const sessionId = verifySessionId(request.cookies.get(SESSION_COOKIE_NAME)?.value, key) || v4()
  const user = userPrefix + sessionId
  return {
    sessionId,
    user,
  }
}

export const setSession = (sessionId: string) => {
  const crossSite = Boolean(APP_INFO.disable_session_same_site)
  return [
    ['Set-Cookie', buildSessionCookie(signSessionId(sessionId, key), crossSite)],
    ['Set-Cookie', buildLegacySessionCookieDeletion(crossSite)],
  ] satisfies [string, string][]
}

let client: ChatClient | undefined

export const getDifyClient = () => {
  if (!DIFY_API_KEY) { throw new Error('DIFY_API_KEY is not configured') }
  client ||= new ChatClient(DIFY_API_KEY, API_URL || undefined)
  return client
}
