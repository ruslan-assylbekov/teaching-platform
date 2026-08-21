'use server'

import { revalidatePath } from 'next/cache'
import { setUserLocale } from '../domain/account/locale.ts'
import { getCurrentUser } from '../lib/session.ts'

export async function setLocaleAction(locale: 'ru' | 'en'): Promise<void> {
  const user = await getCurrentUser()
  if (!user) return
  await setUserLocale(user.id, locale)
  revalidatePath('/', 'layout')
}
