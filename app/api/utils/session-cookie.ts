export const SESSION_COOKIE_NAME = 'session_id'

/**
 * Builds the Set-Cookie value for the session cookie.
 * The value is only read on the server, so it is HttpOnly and shared by every route.
 */
export const buildSessionCookie = (sessionId: string, crossSite: boolean) => {
  const attributes = [`${SESSION_COOKIE_NAME}=${sessionId}`, 'Path=/', 'HttpOnly']
  if (crossSite) { attributes.push('SameSite=None', 'Secure') }
  return attributes.join('; ')
}
