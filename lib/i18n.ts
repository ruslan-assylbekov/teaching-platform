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
  //
  // getCurrentUser() runs on every request as part of resolving the root
  // layout itself (via next-intl's request config), so a database outage
  // here would crash the root layout -- a failure app/error.tsx can't
  // catch, only app/global-error.tsx could. Falling back instead means a
  // DB outage degrades to "wrong locale, working generic error page" (the
  // nearest error.tsx boundary for whatever page-level query actually
  // needed the database), not "the whole app is a blank global-error page"
  // (design spec §5.4: "Database unreachable -> generic error page").
  let user: Awaited<ReturnType<typeof getCurrentUser>> = null
  try {
    user = await getCurrentUser()
  } catch {
    user = null
  }
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
