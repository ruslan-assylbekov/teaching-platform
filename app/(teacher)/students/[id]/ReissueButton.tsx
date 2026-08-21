'use client'

import { useActionState } from 'react'
import { useTranslations } from 'next-intl'
import { reissueAction } from './profile-actions.ts'
import type { ReissueState } from './profile-actions.ts'

const initialState: ReissueState = { status: 'idle' }

export function ReissueButton({ studentId }: { studentId: string }) {
  const t = useTranslations('StudentDetail')
  const tNew = useTranslations('NewStudent')
  const boundAction = reissueAction.bind(null, studentId)
  const [state, formAction, pending] = useActionState(boundAction, initialState)

  if (state.status === 'success') {
    return (
      <div className="card">
        <p className="error-text">{t('reissueWarning')}</p>
        <p>
          <span className="label">{tNew('passwordLabel')}</span>
          <br />
          <code>{state.oneTimePassword}</code>
        </p>
      </div>
    )
  }

  return (
    <form action={formAction}>
      <button type="submit" className="button-secondary" disabled={pending}>
        {t('reissue')}
      </button>
    </form>
  )
}
