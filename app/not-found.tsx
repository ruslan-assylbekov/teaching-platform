import { getTranslations } from 'next-intl/server'

export default async function NotFound() {
  const t = await getTranslations('NotFoundPage')

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <h1>{t('title')}</h1>
        <p className="hint-text">{t('body')}</p>
      </div>
    </div>
  )
}
