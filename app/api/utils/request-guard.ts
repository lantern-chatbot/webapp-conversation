// The chat UI calls these routes from its own origin, even inside the embed iframe.
// Browsers label that as same-origin; 'none' is a user-initiated navigation.
const ALLOWED_FETCH_SITES = new Set(['same-origin', 'none'])

export const isCrossOriginRequest = (request: Request) => {
  const fetchSite = request.headers.get('sec-fetch-site')
  if (fetchSite) { return !ALLOWED_FETCH_SITES.has(fetchSite) }

  // Older browsers without Fetch Metadata still send Origin on cross-origin requests.
  const origin = request.headers.get('origin')
  if (!origin) { return false }
  return origin !== new URL(request.url).origin
}

export const rejectCrossOriginRequest = (request: Request) => {
  if (!isCrossOriginRequest(request)) { return undefined }
  return Response.json({ message: 'このリクエストは受け付けられません。' }, { status: 403 })
}
