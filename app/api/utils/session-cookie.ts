export const SESSION_COOKIE_NAME = 'session_id'

const sameSiteAttributes = (crossSite: boolean) => (crossSite ? ['SameSite=None', 'Secure'] : [])

/**
 * Builds the Set-Cookie value for the session cookie.
 * The session id is the Dify user that separates conversation histories. Only the
 * server reads it, so it is HttpOnly and shared by every route (Path=/).
 * An embedded (cross-site) chatbot also needs SameSite=None; Secure.
 */
export const buildSessionCookie = (sessionId: string, crossSite: boolean) =>
  [`${SESSION_COOKIE_NAME}=${sessionId}`, 'Path=/', 'HttpOnly', ...sameSiteAttributes(crossSite)].join('; ')

/**
 * Earlier versions set session_id without Path, so browsers stored it at the
 * default path /api and without HttpOnly. A cookie with Path=/ does not replace
 * it, so it is expired explicitly. The session id itself is kept: the API reads
 * it and sends it back in the Path=/ cookie. The same SameSite attributes are
 * needed for the browser to accept the deletion inside an embedded iframe.
 */
export const buildLegacySessionCookieDeletion = (crossSite: boolean) =>
  [`${SESSION_COOKIE_NAME}=`, 'Path=/api', 'Max-Age=0', 'HttpOnly', ...sameSiteAttributes(crossSite)].join('; ')
