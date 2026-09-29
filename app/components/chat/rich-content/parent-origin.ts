// Resolves the origin of the page embedding the chat so that postMessage is
// only delivered to that page. Returns null when the chat is not framed or the
// embedding origin cannot be determined; callers must not send in that case.
// Keep this file free of `@/` imports so it can be unit tested with node --test.

export interface ParentOriginSource {
  isFramed: boolean
  // `location.ancestorOrigins`; index 0 is the immediate parent. Not available in every browser.
  ancestorOrigins?: ArrayLike<string> | null
  // `document.referrer`; the embedding page's URL (or origin) on the iframe's first load.
  referrer?: string | null
}

const toHttpOrigin = (value: string | null | undefined): string | null => {
  if (!value || value === 'null') { return null }
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') { return null }
    return url.origin
  }
  catch {
    return null
  }
}

export const resolveParentOrigin = ({ isFramed, ancestorOrigins, referrer }: ParentOriginSource): string | null => {
  if (!isFramed) { return null }
  if (ancestorOrigins && ancestorOrigins.length > 0) {
    return toHttpOrigin(ancestorOrigins[0])
  }
  return toHttpOrigin(referrer)
}
