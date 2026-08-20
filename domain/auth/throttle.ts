// Design spec §5.4: 5 failed logins per username per 15 min -> 15 min
// lockout; 20 failed logins per IP per 15 min.
//
// Refinement on the spec (documented in the Phase 1 plan index / Plan 01):
// §4.1's schema has no failed-attempts table, and Phase 1 runs a single app
// instance (design spec §3.1), so an in-memory sliding window is enough and
// avoids a table that exists purely for rate-limit bookkeeping. Cost: a
// container restart clears counters. Revisit with a shared store only if
// this ever needs to survive restarts or run across multiple instances.

const WINDOW_MS = 15 * 60 * 1000
const USERNAME_LIMIT = 5
const IP_LIMIT = 20

const byUsername = new Map<string, number[]>()
const byIp = new Map<string, number[]>()

function prune(timestamps: number[], now: number): number[] {
  return timestamps.filter((t) => now - t < WINDOW_MS)
}

function countWithin(store: Map<string, number[]>, key: string, now: number): number {
  return prune(store.get(key) ?? [], now).length
}

function record(store: Map<string, number[]>, key: string, now: number): void {
  const pruned = prune(store.get(key) ?? [], now)
  pruned.push(now)
  store.set(key, pruned)
}

function usernameKey(username: string): string {
  return username.toLowerCase()
}

export function isLocked(username: string, ip: string, now: number = Date.now()): boolean {
  return (
    countWithin(byUsername, usernameKey(username), now) >= USERNAME_LIMIT ||
    countWithin(byIp, ip, now) >= IP_LIMIT
  )
}

export function recordFailure(username: string, ip: string, now: number = Date.now()): void {
  record(byUsername, usernameKey(username), now)
  record(byIp, ip, now)
}

export function recordSuccess(username: string, ip: string): void {
  byUsername.delete(usernameKey(username))
  byIp.delete(ip)
}
