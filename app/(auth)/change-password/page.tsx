import { getTranslations } from 'next-intl/server'
import { changePasswordAction } from './actions.ts'

export default async function ChangePasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const t = await getTranslations('ChangePassword')
  const { error } = await searchParams

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <h1>{t('title')}</h1>
        <p>{t('description')}</p>
        <form action={changePasswordAction}>
          <div className="field">
            <label className="label" htmlFor="currentPassword">
              {t('currentPassword')}
            </label>
            <input
              id="currentPassword"
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              required
            />
          </div>
          <div className="field">
            <label className="label" htmlFor="newPassword">
              {t('newPassword')}
            </label>
            <input id="newPassword" name="newPassword" type="password" autoComplete="new-password" required minLength={8} />
          </div>
          <div className="field">
            <label className="label" htmlFor="confirmPassword">
              {t('confirmPassword')}
            </label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
            />
          </div>
          {error === 'wrong-current' && <p className="error-text">{t('wrongCurrent')}</p>}
          {error === 'mismatch' && <p className="error-text">{t('mismatch')}</p>}
          {error === 'too-short' && <p className="error-text">{t('tooShort')}</p>}
          <button type="submit" className="button">
            {t('submit')}
          </button>
        </form>
      </div>
    </div>
  )
}
