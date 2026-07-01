import type { AppInfo } from '@/types/app'
export const APP_ID = `${process.env.NEXT_PUBLIC_APP_ID}`
export const API_KEY = `${process.env.NEXT_PUBLIC_APP_KEY}`
export const API_URL = `${process.env.NEXT_PUBLIC_API_URL}`
export const APP_INFO: AppInfo = {
  title: 'LANTERN AI コンシェルジュ',
  description: 'ブランディング・マーケティング・AI活用について、お気軽にご相談ください。',
  copyright: 'LANTERN inc.',
  privacy_policy: 'https://lantern-inc.jp/',
  default_language: 'ja',
  disable_session_same_site: true,
}

export const isShowPrompt = false
export const promptTemplate = 'I want you to act as a javascript console.'

export const API_PREFIX = '/api'

export const LOCALE_COOKIE_NAME = 'locale'

export const DEFAULT_VALUE_MAX_LEN = 48
