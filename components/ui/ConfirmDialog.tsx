'use client'

import { useTranslations } from 'next-intl'
import { Modal } from './Modal.tsx'

// Gates every destructive schedule action (cancel an occurrence, delete a
// recurring slot, approve a request that mutates the schedule) behind an
// explicit confirm step -- none of them fired immediately before this.
export function ConfirmDialog({
  open,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  open: boolean
  message: string
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
}) {
  const tCommon = useTranslations('Common')

  return (
    <Modal open={open} onClose={onCancel}>
      <p>{message}</p>
      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
        <button type="button" className="button-secondary" onClick={onCancel}>
          {tCommon('cancel')}
        </button>
        <button type="button" className="button-danger" onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </Modal>
  )
}
