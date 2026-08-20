import { getTranslations } from 'next-intl/server'
import { loginAction } from './actions.ts'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const t = await getTranslations('Login')
  const { error } = await searchParams

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <h1>{t('title')}</h1>
        <form action={loginAction}>
          <div className="field">
            <label className="label" htmlFor="username">
              {t('username')}
            </label>
            <input id="username" name="username" type="text" autoComplete="username" required />
          </div>
          <div className="field">
            <label className="label" htmlFor="password">
              {t('password')}
            </label>
            <input id="password" name="password" type="password" autoComplete="current-password" required />
          </div>
          {error === 'archived' && <p className="error-text">{t('archived')}</p>}
          {error === 'invalid' && <p className="error-text">{t('invalidCredentials')}</p>}
          <button type="submit" className="button">
            {t('submit')}
          </button>
        </form>
      </div>
    </div>
  )
}
