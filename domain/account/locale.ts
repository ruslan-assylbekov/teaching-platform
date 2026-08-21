import { setLocale as setLocaleDb } from '../../db/queries/users.ts'

// Locale is a per-user setting (design spec §2/§5, users.locale) --
// switchable by the user themselves, not tied to their role.
export async function setUserLocale(userId: string, locale: 'ru' | 'en'): Promise<void> {
  await setLocaleDb(userId, locale)
}
