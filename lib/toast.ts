// Every mutating server action in this codebase redirects back to a page
// rather than returning a value a client component could read directly
// (plain <form action={...}> submits throughout, per the layering notes in
// domain/schedule/manage.ts and friends) -- so a toast is triggered the
// same way the existing schedule-conflict error already is: appended to
// the redirect target as a query param, then picked up client-side by
// components/ui/FlashToastBridge.tsx and stripped from the URL.
export const TOAST_KEYS = [
  'changesSaved',
  'studentArchived',
  'studentRestored',
  'studentDeleted',
  'slotSaved',
  'slotDeleted',
  'lessonCancelled',
  'lessonMoved',
] as const

export type ToastKey = (typeof TOAST_KEYS)[number]

export function isToastKey(value: string | null): value is ToastKey {
  return value !== null && (TOAST_KEYS as readonly string[]).includes(value)
}

export function withToast(url: string, key: ToastKey): string {
  const separator = url.includes('?') ? '&' : '?'
  return `${url}${separator}toast=${key}`
}
