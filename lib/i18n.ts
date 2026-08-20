import { getRequestConfig } from 'next-intl/server'
import { headers } from 'next/headers'
import { getCurrentUser } from './session.ts'

const SUPPORTED_LOCALES = ['ru', 'en'] as const
type Locale = (typeof SUPPORTED_LOCALES)[number]
const DEFAULT_LOCALE: Locale = 'ru'

function isSupportedLocale(value: string): value is Locale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value)
}

async function resolveLocale(): Promise<Locale> {
  // Locale is a per-user setting (design spec §2, users.locale), not a URL
  // segment — there is no /en/... or /ru/... prefix in this app.
  const user = await getCurrentUser()
  if (user) return user.locale

  // Pre-auth (the /login page itself, design spec §5.1 doesn't specify
  // pre-auth locale behaviour): fall back to the browser's Accept-Language
  // header, then the same 'ru' default the users table uses.
  const headerList = await headers()
  const acceptLanguage = headerList.get('accept-language') ?? ''
  const preferred = acceptLanguage.split(',')[0]?.trim().slice(0, 2).toLowerCase()
  if (preferred && isSupportedLocale(preferred)) return preferred

  return DEFAULT_LOCALE
}

export default getRequestConfig(async () => {
  const locale = await resolveLocale()
  const messages = (await import(`../messages/${locale}.json`)).default
  return { locale, messages }
})
