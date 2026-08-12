/**
 * Local authentication adapter.
 *
 * Credentials are stored as PBKDF2-SHA256 hashes with a per-user random salt —
 * never as plaintext. This mirrors the shape of Supabase Auth (signUp /
 * signInWithPassword / signOut / getSession) so swapping adapters later is a
 * one-file change.
 *
 * This adapter is for local, single-device use. It is NOT a substitute for a
 * server-side auth provider: anything stored in the browser is readable by
 * anyone with access to the machine.
 */

import { get, getByIndex, put, remove } from './db'
import type { Profile } from '@/types'
import { nowIso, slugify, uid } from '@/lib/utils'

const SESSION_KEY = 'bookspace.session'
const PBKDF2_ITERATIONS = 210_000

interface CredentialRecord {
  email: string
  userId: string
  salt: string
  hash: string
  iterations: number
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AuthError'
  }
}

function toBase64(bytes: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
}

function fromBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0))
}

async function derive(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },
    key,
    256,
  )
  return toBase64(bits)
}

/** Constant-time-ish comparison so hash checks don't leak timing information. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

async function uniqueUsername(base: string): Promise<string> {
  const root = slugify(base) || 'reader'
  let candidate = root
  let suffix = 1
  while (await getByIndex<Profile>('profiles', 'by_username', candidate)) {
    suffix += 1
    candidate = `${root}-${suffix}`
  }
  return candidate
}

export interface SignUpInput {
  email: string
  password: string
  displayName: string
}

export async function signUp({
  email,
  password,
  displayName,
}: SignUpInput): Promise<Profile> {
  const normalized = normalizeEmail(email)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new AuthError('Enter a valid email address.')
  }
  if (password.length < 8) {
    throw new AuthError('Password must be at least 8 characters.')
  }
  if (!displayName.trim()) {
    throw new AuthError('Tell us what to call you.')
  }
  if (await get<CredentialRecord>('credentials', normalized)) {
    throw new AuthError('An account already exists for this email.')
  }

  const salt = crypto.getRandomValues(new Uint8Array(16))
  const hash = await derive(password, salt, PBKDF2_ITERATIONS)
  const userId = uid('usr')

  const profile: Profile = {
    id: userId,
    username: await uniqueUsername(displayName),
    displayName: displayName.trim(),
    email: normalized,
    bio: null,
    avatarUrl: null,
    createdAt: nowIso(),
    onboardedAt: null,
    favoriteGenres: [],
    profileVisibility: 'private',
    reviewVisibility: 'private',
    showReadingActivity: true,
  }

  await put<Profile>('profiles', profile)
  await put<CredentialRecord>('credentials', {
    email: normalized,
    userId,
    salt: toBase64(salt.buffer as ArrayBuffer),
    hash,
    iterations: PBKDF2_ITERATIONS,
  })

  setSession(userId)
  return profile
}

export async function signIn(email: string, password: string): Promise<Profile> {
  const normalized = normalizeEmail(email)
  const credential = await get<CredentialRecord>('credentials', normalized)
  // Same message either way so the form can't be used to enumerate accounts.
  const failure = new AuthError('Email or password is incorrect.')
  if (!credential) {
    // Burn comparable time so a missing account isn't obviously faster.
    await derive(password, crypto.getRandomValues(new Uint8Array(16)), PBKDF2_ITERATIONS)
    throw failure
  }
  const hash = await derive(password, fromBase64(credential.salt), credential.iterations)
  if (!safeEqual(hash, credential.hash)) throw failure

  const profile = await get<Profile>('profiles', credential.userId)
  if (!profile) throw failure

  setSession(profile.id)
  return profile
}

export async function changePassword(
  userId: string,
  email: string,
  currentPassword: string,
  nextPassword: string,
): Promise<void> {
  const normalized = normalizeEmail(email)
  const credential = await get<CredentialRecord>('credentials', normalized)
  if (!credential || credential.userId !== userId) {
    throw new AuthError('Account not found.')
  }
  const currentHash = await derive(
    currentPassword,
    fromBase64(credential.salt),
    credential.iterations,
  )
  if (!safeEqual(currentHash, credential.hash)) {
    throw new AuthError('Current password is incorrect.')
  }
  if (nextPassword.length < 8) {
    throw new AuthError('New password must be at least 8 characters.')
  }
  const salt = crypto.getRandomValues(new Uint8Array(16))
  await put<CredentialRecord>('credentials', {
    ...credential,
    salt: toBase64(salt.buffer as ArrayBuffer),
    hash: await derive(nextPassword, salt, PBKDF2_ITERATIONS),
    iterations: PBKDF2_ITERATIONS,
  })
}

export async function deleteAccountCredentials(email: string): Promise<void> {
  await remove('credentials', normalizeEmail(email))
}

export function setSession(userId: string): void {
  localStorage.setItem(SESSION_KEY, userId)
}

export function getSessionUserId(): string | null {
  return localStorage.getItem(SESSION_KEY)
}

export function signOut(): void {
  localStorage.removeItem(SESSION_KEY)
}

export async function getSessionProfile(): Promise<Profile | null> {
  const userId = getSessionUserId()
  if (!userId) return null
  const profile = await get<Profile>('profiles', userId)
  if (!profile) {
    signOut()
    return null
  }
  return profile
}
