'use server'

import { redirect } from 'next/navigation'
import { submitChangePassword } from '../../../lib/auth.ts'

export async function changePasswordAction(formData: FormData): Promise<void> {
  const currentPassword = String(formData.get('currentPassword') ?? '')
  const newPassword = String(formData.get('newPassword') ?? '')
  const confirmPassword = String(formData.get('confirmPassword') ?? '')

  const result = await submitChangePassword({ currentPassword, newPassword, confirmPassword })

  if (!result.ok) {
    if (result.reason === 'unauthenticated') {
      redirect('/login')
    }
    redirect(`/change-password?error=${result.reason}`)
  }

  // Session stays valid after a forced change (design spec §5.1) — no
  // re-login. Root ('/') is still Plan 01's placeholder; Plan 02 replaces
  // it with the real role-based destination.
  redirect('/')
}
