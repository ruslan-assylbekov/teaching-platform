'use client'

import { useActionState } from 'react'
import { useTranslations } from 'next-intl'
import { createStudentAction } from './actions.ts'
import type { CreateStudentState } from './actions.ts'

const initialState: CreateStudentState = { status: 'idle' }

export function NewStudentForm() {
  const t = useTranslations('NewStudent')
  const tProfile = useTranslations('Profile')
  const [state, formAction, pending] = useActionState(createStudentAction, initialState)

  if (state.status === 'success') {
    return (
      <div className="card">
        <h1>{t('credentialsTitle')}</h1>
        <p className="error-text">{t('credentialsWarning')}</p>
        <p>
          <span className="label">{t('usernameLabel')}</span>
          <br />
          {state.username}
        </p>
        <p>
          <span className="label">{t('passwordLabel')}</span>
          <br />
          <code>{state.oneTimePassword}</code>
        </p>
        <a className="button" href={`/students/${state.studentId}`}>
          {t('doneButton')}
        </a>
      </div>
    )
  }

  return (
    <div>
      <h1>{t('title')}</h1>
      <form action={formAction}>
        <div className="field">
          <label className="label" htmlFor="fullName">
            {tProfile('fullName')}
          </label>
          <input id="fullName" name="fullName" type="text" required />
        </div>
        <div className="field">
          <label className="label" htmlFor="grade">
            {tProfile('grade')}
          </label>
          <input id="grade" name="grade" type="text" required />
        </div>
        <div className="field">
          <label className="label" htmlFor="school">
            {tProfile('school')}
          </label>
          <input id="school" name="school" type="text" />
        </div>
        <div className="field">
          <label className="label" htmlFor="level">
            {tProfile('level')}
          </label>
          <input id="level" name="level" type="text" required />
        </div>
        <div className="field">
          <label className="label" htmlFor="objectives">
            {tProfile('objectives')}
          </label>
          <textarea id="objectives" name="objectives" />
        </div>
        <div className="field">
          <label className="label" htmlFor="privateNotes">
            {tProfile('privateNotes')}
          </label>
          <textarea id="privateNotes" name="privateNotes" />
        </div>
        <div className="field">
          <label className="label" htmlFor="parentPhone">
            {tProfile('parentPhone')}
          </label>
          <input id="parentPhone" name="parentPhone" type="text" />
        </div>
        <div className="field">
          <label className="label" htmlFor="parentName">
            {tProfile('parentName')}
          </label>
          <input id="parentName" name="parentName" type="text" />
        </div>
        {state.status === 'error' && <p className="error-text">{t(state.messageKey)}</p>}
        <button type="submit" className="button" disabled={pending}>
          {t('submit')}
        </button>
      </form>
    </div>
  )
}
