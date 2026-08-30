import 'server-only'

// Keep the legacy variable as a server-only migration fallback. Because this
// module cannot be imported by Client Components, the value is not bundled
// into browser JavaScript even when the old variable name has NEXT_PUBLIC_.
export const DIFY_API_KEY = process.env.DIFY_API_KEY || process.env.NEXT_PUBLIC_APP_KEY || ''
