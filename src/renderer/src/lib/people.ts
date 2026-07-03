/**
 * Shared member-lookup helpers. Previously re-implemented as `members.find(...)`
 * / `nameById` in 11+ files.
 */
import { Member } from '../types'

/** id (as string) → member name, for fast repeated lookups in a render. */
export function memberNameMap(members: Member[]): Map<string, string> {
  const m = new Map<string, string>()
  members.forEach((x) => m.set(String(x.id), x.name))
  return m
}

/** id (as string) → member, for fast repeated lookups in a render. */
export function memberMap(members: Member[]): Map<string, Member> {
  const m = new Map<string, Member>()
  members.forEach((x) => m.set(String(x.id), x))
  return m
}

/** Resolve a member name from an id; "#id" when not found, a fallback when empty. */
export function nameById(members: Member[], id: unknown, emptyLabel = 'Unassigned'): string {
  const found = members.find((m) => String(m.id) === String(id))
  return found?.name ?? (id ? `#${id}` : emptyLabel)
}

/** Active members (excludes those who have left). */
export const activeMembers = (members: Member[]): Member[] => members.filter((m) => m.status !== 'left')
