import { getLocaleOnServer } from '@/i18n/server'

import './styles/globals.css'
import './styles/markdown.scss'

const LocaleLayout = async ({
  children,
}: {
  children: React.ReactNode
}) => {
  const locale = await getLocaleOnServer()
  return (
    <html lang={locale ?? 'en'} className="h-full">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700&family=Zen+Kaku+Gothic+New:wght@500;700&display=swap" rel="stylesheet" />
      </head>
      <body className="h-full" style={{ fontFamily: '\'Noto Sans JP\', sans-serif' }}>
        <div className="w-full h-full min-w-[300px] overflow-hidden">
          {children}
        </div>
      </body>
    </html>
  )
}

export default LocaleLayout
