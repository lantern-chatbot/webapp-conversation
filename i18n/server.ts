import 'server-only'

import { cookies, headers } from 'next/headers'
import Negotiator from 'negotiator'
import { match } from '@formatjs/intl-localematcher'
import type { Locale } from '.'
import { i18n } from '.'

export const getLocaleOnServer = async (): Promise<Locale> => {
  const locales: string[] = [...i18n.locales]
  let languages: string[] = []

  const localeCookie = (await cookies()).get('locale')
  if (localeCookie?.value) {
    languages = [localeCookie.value]
  }

  if (!languages.length) {
    const negotiatorHeaders: Record<string, string> = {}
    const headersList = await headers()

    headersList.forEach((value, key) => {
      negotiatorHeaders[key] = value
    })

    languages = new Negotiator({ headers: negotiatorHeaders }).languages()
  }

  // Studio.Designやbot/HeadlessChromeで Accept-Language が無い・'*' になる場合の対策
  languages = languages.filter(lang => lang && lang !== '*')

  if (!languages.length) {
    languages = [i18n.defaultLocale]
  }

  try {
    return match(languages, locales, i18n.defaultLocale) as Locale
  } catch {
    return i18n.defaultLocale as Locale
  }
}
