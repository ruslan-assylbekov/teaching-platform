'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { login } from '../../../lib/auth.ts'

function getClientIp(headerList: Headers): string {
  const forwarded = headerList.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0]!.trim()
  return headerList.get('x-real-ip') ?? 'unknown'
}

export async function loginAction(formData: FormData): Promise<void> {
  const username = String(formData.get('username') ?? '').trim()
  const password = String(formData.get('password') ?? '')

  if (!username || !password) {
    redirect('/login?error=invalid')
  }

  const headerList = await headers()
  const ip = getClientIp(headerList)

  const result = await login(username, password, ip)

  if (!result.ok) {
    redirect(`/login?error=${result.reason}`)
  }

  // Root ('/') is still a Plan 01 placeholder that redirects to /login —
  // Plan 02 replaces it with the real teacher Today page / student /me
  // split. Forced-change-password is the one destination that's real here.
  redirect(result.mustChangePassword ? '/change-password' : '/')
}
