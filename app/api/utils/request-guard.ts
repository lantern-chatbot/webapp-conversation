// The chat UI calls these routes from its own origin, even inside the embed iframe.
// Browsers label that as same-origin; 'none' is a user-initiated navigation.
const ALLOWED_FETCH_SITES = new Set(['same-origin', 'none'])

// The host the browser actually addressed. Behind a proxy request.url carries the
// internal listen address, so prefer the forwarded host. A cross-origin page cannot
// set these headers without failing the CORS preflight.
const publicHost = (request: Request) => {
  const forwarded = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim()
  return forwarded || request.headers.get('host') || new URL(request.url).host
}

const hostOf = (origin: string) => {
  try { return new URL(origin).host }
  catch { return undefined }
}

export const isCrossOriginRequest = (request: Request) => {
  const fetchSite = request.headers.get('sec-fetch-site')
  if (fetchSite) { return !ALLOWED_FETCH_SITES.has(fetchSite) }

  // Older browsers without Fetch Metadata still send Origin on cross-origin requests.
  // Compare hosts only: a TLS-terminating proxy makes the internal scheme differ.
  const origin = request.headers.get('origin')
  if (!origin) { return false }
  return hostOf(origin) !== publicHost(request)
}

export const rejectCrossOriginRequest = (request: Request) => {
  if (!isCrossOriginRequest(request)) { return undefined }
  return Response.json({ message: 'このリクエストは受け付けられません。' }, { status: 403 })
}
