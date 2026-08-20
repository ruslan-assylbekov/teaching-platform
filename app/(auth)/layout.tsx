import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '../../lib/session.ts'

// First real use of the design spec §3.4 "guard at the route-group
// boundary" pattern. This duplicates the check middleware.ts already does
// for /change-password specifically — the duplication is deliberate, same
// reasoning as §3.4's cross-student isolation checks: a future routing
// mistake in middleware.ts must not turn into an unauthenticated user
// reaching an authenticated-only page.
export default async function AuthLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser()
  if (!user) {
    redirect('/login')
  }
  return <>{children}</>
}
