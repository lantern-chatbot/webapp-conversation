import 'server-only'
import { chatLogConfig } from '@/app/api/utils/chat-log-send'

// Keep the legacy variable as a server-only migration fallback. Because this
// module cannot be imported by Client Components, the value is not bundled
// into browser JavaScript even when the old variable name has NEXT_PUBLIC_.
export const DIFY_API_KEY = process.env.DIFY_API_KEY || process.env.NEXT_PUBLIC_APP_KEY || ''

// Signs the session_id cookie (app/api/utils/session-id.ts).
export const SESSION_SECRET = process.env.SESSION_SECRET || ''

// Invalid logging settings must not take the public chat offline.
export const getChatLogConfig = () => {
  try { return chatLogConfig(process.env) }
  catch { console.warn('chat_log_configuration_invalid'); return undefined }
}
