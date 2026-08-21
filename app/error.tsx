'use client'

import { useTranslations } from 'next-intl'

// Catches failures in any segment below the root layout (design spec
// §5.4's generic-error-page requirement). The root layout's own providers
// already rendered successfully by the time this can be hit, so using
// next-intl here is safe -- unlike app/global-error.tsx, which can't
// assume that.
export default function ErrorBoundary({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations('ErrorPage')

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <h1>{t('title')}</h1>
        <p className="hint-text">{t('body')}</p>
        <button type="button" className="button" onClick={() => reset()}>
          {t('retry')}
        </button>
      </div>
    </div>
  )
}
