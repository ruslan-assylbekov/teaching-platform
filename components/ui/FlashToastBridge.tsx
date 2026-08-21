'use client'

import { Suspense, useEffect } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { isToastKey } from '../../lib/toast.ts'
import { useToast } from './ToastProvider.tsx'

// Reads the `?toast=<key>` a server action's redirect appended (lib/toast.ts),
// shows it, then strips the param so a refresh doesn't repeat it -- the
// same redirect-then-read-query-param shape the existing schedule-conflict
// error already used, generalized. useSearchParams requires a Suspense
// boundary in the App Router; that's the whole reason for the wrapper below.
function FlashToastBridgeInner() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const { show } = useToast()
  const t = useTranslations('Toast')

  useEffect(() => {
    const key = searchParams.get('toast')
    if (!isToastKey(key)) return

    show(t(key))

    const params = new URLSearchParams(searchParams)
    params.delete('toast')
    const query = params.toString()
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
    // Deliberately reacting only to the URL, not `show`/`t`/`router` identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  return null
}

export function FlashToastBridge() {
  return (
    <Suspense fallback={null}>
      <FlashToastBridgeInner />
    </Suspense>
  )
}
