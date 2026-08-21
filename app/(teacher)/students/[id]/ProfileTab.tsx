import { getTranslations } from 'next-intl/server'
import type { StudentWithAccount } from '../../../../db/queries/students.ts'
import { archiveAction, deleteAction, unarchiveAction, updateProfileAction } from './profile-actions.ts'
import { ReissueButton } from './ReissueButton.tsx'

export async function ProfileTab({ student, deleteError }: { student: StudentWithAccount; deleteError: boolean }) {
  const t = await getTranslations('Profile')
  const tDetail = await getTranslations('StudentDetail')

  return (
    <div>
      {student.status === 'archived' && (
        <p>
          <span className="badge badge-cancelled">{tDetail('archivedBadge')}</span>
        </p>
      )}

      <form action={updateProfileAction.bind(null, student.user_id)}>
        <div className="field">
          <label className="label" htmlFor="fullName">
            {t('fullName')}
          </label>
          <input id="fullName" name="fullName" type="text" defaultValue={student.full_name} required />
        </div>
        <div className="field">
          <label className="label" htmlFor="grade">
            {t('grade')}
          </label>
          <input id="grade" name="grade" type="text" defaultValue={student.grade} required />
        </div>
        <div className="field">
          <label className="label" htmlFor="school">
            {t('school')}
          </label>
          <input id="school" name="school" type="text" defaultValue={student.school ?? ''} />
        </div>
        <div className="field">
          <label className="label" htmlFor="level">
            {t('level')}
          </label>
          <input id="level" name="level" type="text" defaultValue={student.level} required />
        </div>
        <div className="field">
          <label className="label" htmlFor="objectives">
            {t('objectives')}
          </label>
          <textarea id="objectives" name="objectives" defaultValue={student.objectives ?? ''} />
        </div>
        <div className="field">
          <label className="label" htmlFor="privateNotes">
            {t('privateNotes')}
          </label>
          <textarea id="privateNotes" name="privateNotes" defaultValue={student.private_notes ?? ''} />
        </div>
        <div className="field">
          <label className="label" htmlFor="parentPhone">
            {t('parentPhone')}
          </label>
          <input id="parentPhone" name="parentPhone" type="text" defaultValue={student.parent_phone ?? ''} />
        </div>
        <div className="field">
          <label className="label" htmlFor="parentName">
            {t('parentName')}
          </label>
          <input id="parentName" name="parentName" type="text" defaultValue={student.parent_name ?? ''} />
        </div>
        <button type="submit" className="button">
          {t('save')}
        </button>
      </form>

      <hr />

      <ReissueButton studentId={student.user_id} />

      <form action={student.status === 'active' ? archiveAction.bind(null, student.user_id) : unarchiveAction.bind(null, student.user_id)}>
        <button type="submit" className="button-secondary">
          {student.status === 'active' ? tDetail('archiveButton') : tDetail('unarchiveButton')}
        </button>
      </form>

      <details>
        <summary>{tDetail('deleteButton')}</summary>
        <form action={deleteAction.bind(null, student.user_id)}>
          <div className="field">
            <label className="label" htmlFor="confirmation">
              {tDetail('deleteConfirmLabel')}
            </label>
            <input id="confirmation" name="confirmation" type="text" required />
          </div>
          {deleteError && <p className="error-text">{tDetail('deleteErrorMessage')}</p>}
          <button type="submit" className="button-danger">
            {tDetail('deleteConfirmSubmit')}
          </button>
        </form>
      </details>
    </div>
  )
}
