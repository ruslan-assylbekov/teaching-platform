// Design spec §4.4: "Unread count = messages after this timestamp." Pure
// given rows already fetched -- Plan 02's Today page and the sidebar badge
// can both call this against whatever slice of messages they already have,
// without a second round trip per student. Structurally typed rather than
// importing MessageRow, so this stays decoupled from db/'s row shape the
// same way domain/schedule/expand.ts stays decoupled from schedule.ts's.
export function countUnread(messages: { created_at: Date }[], lastReadAt: Date | null): number {
  if (!lastReadAt) return messages.length
  return messages.filter((m) => m.created_at.getTime() > lastReadAt.getTime()).length
}
