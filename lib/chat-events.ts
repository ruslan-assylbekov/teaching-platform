import { EventEmitter } from 'node:events'

// In-process pub/sub for live chat delivery (design spec §7.3): the send
// route publishes here, each open SSE stream subscribes. Correct only
// within a single Node process -- if this app ever runs more than one
// instance, this needs a shared bus (Postgres LISTEN/NOTIFY, Redis pub/sub)
// instead. Acceptable at Phase 1 scale (design spec §3.1: one VM, one
// container), same reasoning as Plan 01's in-memory login throttle.
//
// Guarded on globalThis the same way lib/session.ts's sweep interval is,
// so dev-mode module reloads don't create a second emitter that live
// messages silently stop reaching.
declare global {
  var __chatEvents: EventEmitter | undefined
}

export const chatEvents: EventEmitter = globalThis.__chatEvents ?? new EventEmitter()
globalThis.__chatEvents = chatEvents

// Every open SSE connection subscribes to the same emitter -- potentially
// many at once even at this scale (one teacher, several students' streams
// open simultaneously).
chatEvents.setMaxListeners(0)

export function eventNameForStudent(studentId: string): string {
  return `message:${studentId}`
}
