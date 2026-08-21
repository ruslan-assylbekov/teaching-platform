'use client'

import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { useTranslations } from 'next-intl'

// Thin wrapper over the native <dialog> element -- no dialog/modal library
// exists in this repo (nor any UI library at all), and <dialog> already
// gives focus-trapping, Escape-to-close (fires onCancel), and a ::backdrop
// for free. The base every other modal in this feature set builds on:
// the student roster picker, the occurrence detail panel, and
// ConfirmDialog.tsx.
export function Modal({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const tCommon = useTranslations('Common')

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog ref={dialogRef} className="modal" onClose={onClose} onCancel={onClose}>
      <button type="button" className="modal-close" aria-label={tCommon('close')} onClick={onClose}>
        ×
      </button>
      {children}
    </dialog>
  )
}
