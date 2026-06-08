import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import type { ExtractionResult } from './extractor';

const scrypt = promisify(scryptCallback);

export type User = {
  id: string;
  email: string;
  passwordHash: string;
  passwordSalt: string;
  verifiedAt?: string;
  createdAt: string;
};

export type Session = {
  token: string;
  userId: string;
  createdAt: string;
};

export type VerificationToken = {
  tokenHash: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
  sentAt: string;
  token?: string;
};

export type LibraryItem = {
  id: string;
  userId: string;
  videoUrl: string;
  videoTitle?: string;
  links: ExtractionResult['links'];
  transcriptResources?: ExtractionResult['transcriptResources'];
  rejected: number;
  savedAt: string;
};

export type GuestImport = {
  id: string;
  guestId: string;
  extraction: ExtractionResult;
  createdAt: string;
  claimedAt?: string;
  claimedByUserId?: string;
  libraryItemId?: string;
};

export type StoreData = {
  users: User[];
  sessions: Session[];
  verificationTokens: VerificationToken[];
  libraryItems: LibraryItem[];
  guestImports: GuestImport[];
};

export type Store = {
  data: StoreData;
  persist: () => void;
};

export function createInMemoryStore(initial?: Partial<StoreData>): Store {
  return {
    data: {
      users: initial?.users ?? [],
      sessions: initial?.sessions ?? [],
      verificationTokens: initial?.verificationTokens ?? [],
      libraryItems: initial?.libraryItems ?? [],
      guestImports: initial?.guestImports ?? []
    },
    persist: () => undefined
  };
}

export function createFileStore(filePathInput?: string): Store {
  const filePath = filePathInput ?? path.resolve(process.cwd(), 'data/store.json');
  const dir = path.dirname(filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const data = existsSync(filePath)
    ? { ...createInMemoryStore().data, ...JSON.parse(readFileSync(filePath, 'utf8')) }
    : createInMemoryStore().data;

  return {
    data,
    persist: () => writeFileSync(filePath, JSON.stringify(data, null, 2))
  };
}

const VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const VERIFICATION_RESEND_COOLDOWN_MS = 60 * 1000;

export async function createAccount(store: Store, emailInput: string, password: string, options: { now?: Date } = {}) {
  const now = options.now ?? new Date();
  const email = normalizeEmail(emailInput);
  assertEmail(email);
  assertPassword(password);

  const existing = store.data.users.find((user) => user.email === email);
  if (existing?.verifiedAt) throw new Error('An account already exists for this email.');
  if (existing && !existing.verifiedAt) {
    store.data.users = store.data.users.filter((user) => user.id !== existing.id);
    store.data.verificationTokens = store.data.verificationTokens.filter((token) => token.userId !== existing.id);
  }

  const salt = randomToken(16);
  const user: User = {
    id: randomToken(16),
    email,
    passwordSalt: salt,
    passwordHash: await hashPassword(password, salt),
    createdAt: now.toISOString()
  };
  const verification = createVerificationToken(user.id, now);

  store.data.users.push(user);
  store.data.verificationTokens.push(verification.entry);
  store.persist();

  return { user: publicUser(user), verificationToken: verification.token };
}

export async function verifyEmail(store: Store, token: string, now = new Date()) {
  const tokenHash = hashVerificationToken(token);
  const verification = store.data.verificationTokens.find((entry) => entry.tokenHash === tokenHash || entry.token === token);
  if (!verification) throw new Error('Invalid or expired verification token.');
  if (new Date(verification.expiresAt).getTime() <= now.getTime()) {
    store.data.verificationTokens = store.data.verificationTokens.filter((entry) => entry !== verification);
    store.persist();
    throw new Error('Invalid or expired verification token.');
  }
  const user = store.data.users.find((entry) => entry.id === verification.userId);
  if (!user) throw new Error('Invalid verification token.');

  user.verifiedAt = now.toISOString();
  store.data.verificationTokens = store.data.verificationTokens.filter((entry) => entry !== verification);
  store.persist();
  return publicUser(user);
}

export async function resendVerification(store: Store, emailInput: string, now = new Date()) {
  const email = normalizeEmail(emailInput);
  const user = store.data.users.find((entry) => entry.email === email);
  if (!user || user.verifiedAt) return null;

  const existing = store.data.verificationTokens.find((entry) => entry.userId === user.id);
  if (existing && now.getTime() - new Date(existing.sentAt ?? existing.createdAt).getTime() < VERIFICATION_RESEND_COOLDOWN_MS) {
    throw new Error('Wait before requesting another verification email.');
  }

  const verification = createVerificationToken(user.id, now);
  store.data.verificationTokens = store.data.verificationTokens.filter((entry) => entry.userId !== user.id);
  store.data.verificationTokens.push(verification.entry);
  store.persist();
  return { user: publicUser(user), verificationToken: verification.token };
}

export async function login(store: Store, emailInput: string, password: string) {
  const email = normalizeEmail(emailInput);
  const user = store.data.users.find((entry) => entry.email === email);
  if (!user || !(await verifyPassword(password, user.passwordSalt, user.passwordHash))) throw new Error('Invalid email or password.');
  if (!user.verifiedAt) throw new Error('Verify your email before signing in.');

  const session: Session = { token: randomToken(24), userId: user.id, createdAt: new Date().toISOString() };
  store.data.sessions.push(session);
  store.persist();
  return { token: session.token, user: publicUser(user) };
}

export function getSessionUser(store: Store, authHeader?: string) {
  const token = authHeader?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return null;
  const session = store.data.sessions.find((entry) => entry.token === token);
  if (!session) return null;
  const user = store.data.users.find((entry) => entry.id === session.userId && entry.verifiedAt);
  return user ? publicUser(user) : null;
}

export function saveExtractionToLibrary(store: Store, userId: string, extraction: ExtractionResult): LibraryItem {
  const item: LibraryItem = {
    id: randomToken(16),
    userId,
    videoUrl: extraction.videoUrl,
    videoTitle: extraction.videoTitle,
    links: extraction.links,
    transcriptResources: extraction.transcriptResources,
    rejected: extraction.rejected,
    savedAt: new Date().toISOString()
  };
  store.data.libraryItems.unshift(item);
  store.persist();
  return item;
}

export function createGuestImport(store: Store, guestId: string, extraction: ExtractionResult): GuestImport {
  const item: GuestImport = {
    id: randomToken(16),
    guestId,
    extraction,
    createdAt: new Date().toISOString()
  };
  store.data.guestImports.unshift(item);
  store.persist();
  return item;
}

export function claimGuestImport(store: Store, userId: string, guestImportId: string, guestId: string): LibraryItem {
  const guestImport = store.data.guestImports.find((entry) => entry.id === guestImportId && entry.guestId === guestId);
  if (!guestImport) throw new Error('This unsaved import expired. Please run the import again.');

  if (guestImport.libraryItemId) {
    const existing = store.data.libraryItems.find((item) => item.id === guestImport.libraryItemId && item.userId === userId);
    if (existing) return existing;
  }

  const item = saveExtractionToLibrary(store, userId, guestImport.extraction);
  guestImport.claimedAt = new Date().toISOString();
  guestImport.claimedByUserId = userId;
  guestImport.libraryItemId = item.id;
  store.persist();
  return item;
}

export function listLibrary(store: Store, userId: string): LibraryItem[] {
  return store.data.libraryItems.filter((item) => item.userId === userId);
}

export function deleteLibraryLink(store: Store, userId: string, itemId: string, linkUrl: string): boolean {
  const item = store.data.libraryItems.find((entry) => entry.userId === userId && entry.id === itemId);
  if (!item) return false;
  const before = item.links.length;
  item.links = item.links.filter((link) => link.url !== linkUrl);
  const deleted = item.links.length !== before;
  if (deleted) store.persist();
  return deleted;
}

export function deleteLibraryItem(store: Store, userId: string, itemId: string): boolean {
  const before = store.data.libraryItems.length;
  store.data.libraryItems = store.data.libraryItems.filter((item) => !(item.userId === userId && item.id === itemId));
  const deleted = store.data.libraryItems.length !== before;
  if (deleted) store.persist();
  return deleted;
}

export function publicUser(user: User) {
  return { id: user.id, email: user.email, verifiedAt: user.verifiedAt };
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

async function hashPassword(password: string, salt: string) {
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return derived.toString('hex');
}

async function verifyPassword(password: string, salt: string, hash: string) {
  const derived = Buffer.from(await hashPassword(password, salt), 'hex');
  const expected = Buffer.from(hash, 'hex');
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

function assertEmail(email: string) {
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('Enter a valid email address.');
}

function assertPassword(password: string) {
  if (password.length < 8) throw new Error('Password must be at least 8 characters.');
}

function randomToken(bytes: number) {
  return randomBytes(bytes).toString('hex');
}

function createVerificationToken(userId: string, now: Date) {
  const token = randomToken(32);
  const createdAt = now.toISOString();
  return {
    token,
    entry: {
      tokenHash: hashVerificationToken(token),
      userId,
      createdAt,
      sentAt: createdAt,
      expiresAt: new Date(now.getTime() + VERIFICATION_TOKEN_TTL_MS).toISOString()
    }
  };
}

function hashVerificationToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}
