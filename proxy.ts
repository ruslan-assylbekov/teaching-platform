import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getCurrentUser } from './lib/session.ts'

const CHANGE_PASSWORD_PATH = '/change-password'

// Design spec §5.1: forced on first login, blocks all other routes until
// done. This is a cross-cutting rule (applies to every route, not one
// subtree), so it lives here rather than a single layout — the (auth)
// layout guard still separately requires authentication for
// /change-password itself, deliberately redundant per §3.4's philosophy.
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const user = await getCurrentUser()

  if (user?.must_change_password && pathname !== CHANGE_PASSWORD_PATH) {
    return NextResponse.redirect(new URL(CHANGE_PASSWORD_PATH, request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
