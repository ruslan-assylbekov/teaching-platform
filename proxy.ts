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

  // The proxy layer runs before the App Router's rendering phase even
  // starts, so a thrown error here never reaches app/error.tsx -- it hits
  // Next's own generic top-level handler instead, and the resulting page
  // has no theming, no locale, nothing but bare "Internal Server Error"
  // text (still leak-free, but not the generic error page design spec
  // §5.4 asks for). Falling back to "can't tell, so don't force a
  // redirect" lets the request continue to the actual page, whose own
  // getCurrentUser() call fails the same way but *within* the rendering
  // tree, where app/error.tsx catches it properly.
  let user: Awaited<ReturnType<typeof getCurrentUser>> = null
  try {
    user = await getCurrentUser()
  } catch {
    user = null
  }

  if (user?.must_change_password && pathname !== CHANGE_PASSWORD_PATH) {
    return NextResponse.redirect(new URL(CHANGE_PASSWORD_PATH, request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
