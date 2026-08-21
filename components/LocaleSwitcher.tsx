'use client'

import { useTransition } from 'react'
import { setLocaleAction } from '../app/set-locale-action.ts'

// design spec §2/§5: locale is a per-user setting, switchable by the user.
// Calling the server action directly (not via a <form>) and letting its
// revalidatePath drive the refresh is what gets the re-render without a
// full page reload -- no client-side i18n state to manage here at all,
// since lib/i18n.ts resolves locale from the authenticated user's row on
// every request.
export function LocaleSwitcher({ current }: { current: 'ru' | 'en' }) {
  const [isPending, startTransition] = useTransition()

  function handleClick(locale: 'ru' | 'en') {
    if (locale === current || isPending) return
    startTransition(() => {
      void setLocaleAction(locale)
    })
  }

  return (
    <div className="locale-switcher">
      <button type="button" className={current === 'ru' ? 'locale-active' : ''} onClick={() => handleClick('ru')} disabled={isPending}>
        RU
      </button>
      <button type="button" className={current === 'en' ? 'locale-active' : ''} onClick={() => handleClick('en')} disabled={isPending}>
        EN
      </button>
    </div>
  )
}
