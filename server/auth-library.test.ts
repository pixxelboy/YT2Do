import { describe, expect, it } from 'vitest';
import { createInMemoryStore, createAccount, verifyEmail, login, saveExtractionToLibrary, listLibrary, deleteLibraryItem, resendVerification } from './authLibrary';

describe('account email verification and private library', () => {
  it('requires email verification before login', async () => {
    const store = createInMemoryStore();
    const signup = await createAccount(store, 'User@Example.com', 'correct horse battery staple');

    await expect(login(store, 'user@example.com', 'correct horse battery staple')).rejects.toThrow('Verify your email before signing in.');
    expect(store.data.verificationTokens[0]).not.toHaveProperty('token', signup.verificationToken);
    expect(store.data.verificationTokens[0].tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(store.data.verificationTokens[0].expiresAt).toBeTruthy();

    await verifyEmail(store, signup.verificationToken);
    await expect(verifyEmail(store, signup.verificationToken)).rejects.toThrow('Invalid or expired verification token.');
    const session = await login(store, 'USER@example.com', 'correct horse battery staple');

    expect(session.token).toHaveLength(48);
    expect(session.user.email).toBe('user@example.com');
  });

  it('rejects expired verification links', async () => {
    const store = createInMemoryStore();
    const signup = await createAccount(store, 'expired@example.com', 'correct horse battery staple', {
      now: new Date('2026-01-01T00:00:00.000Z')
    });

    await expect(verifyEmail(store, signup.verificationToken, new Date('2026-01-02T00:00:01.000Z')))
      .rejects.toThrow('Invalid or expired verification token.');
    expect(store.data.users[0].verifiedAt).toBeUndefined();
  });

  it('resends verification with a cooldown and replaces the previous token', async () => {
    const store = createInMemoryStore();
    const signup = await createAccount(store, 'resend@example.com', 'correct horse battery staple', {
      now: new Date('2026-01-01T00:00:00.000Z')
    });

    await expect(resendVerification(store, 'resend@example.com', new Date('2026-01-01T00:00:30.000Z')))
      .rejects.toThrow('Wait before requesting another verification email.');

    const resent = await resendVerification(store, 'resend@example.com', new Date('2026-01-01T00:02:00.000Z'));

    expect(resent?.verificationToken).toBeTruthy();
    expect(resent?.verificationToken).not.toBe(signup.verificationToken);
    await expect(verifyEmail(store, signup.verificationToken, new Date('2026-01-01T00:02:01.000Z')))
      .rejects.toThrow('Invalid or expired verification token.');
    await verifyEmail(store, resent!.verificationToken, new Date('2026-01-01T00:02:01.000Z'));
    expect(store.data.users[0].verifiedAt).toBeTruthy();
  });

  it('keeps resend responses neutral for missing or already verified accounts', async () => {
    const store = createInMemoryStore();
    const signup = await createAccount(store, 'verified@example.com', 'correct horse battery staple');
    await verifyEmail(store, signup.verificationToken);

    await expect(resendVerification(store, 'missing@example.com')).resolves.toBeNull();
    await expect(resendVerification(store, 'verified@example.com')).resolves.toBeNull();
  });

  it('keeps saved library links private to the verified account', async () => {
    const store = createInMemoryStore();
    const first = await createAccount(store, 'first@example.com', 'first password');
    const second = await createAccount(store, 'second@example.com', 'second password');
    await verifyEmail(store, first.verificationToken);
    await verifyEmail(store, second.verificationToken);

    const firstSession = await login(store, 'first@example.com', 'first password');
    const secondSession = await login(store, 'second@example.com', 'second password');

    const item = saveExtractionToLibrary(store, firstSession.user.id, {
      videoUrl: 'https://www.youtube.com/watch?v=abc12345678',
      videoTitle: 'Useful tools',
      links: [{
        url: 'https://example.com/tool',
        host: 'example.com',
        description: 'Tool from the video',
        videoUrl: 'https://www.youtube.com/watch?v=abc12345678',
        preview: { title: 'Example Tool', description: 'A target-page description.', source: 'target-content' }
      }],
      rejected: 0,
      extractionSource: 'description_links',
      debug: {
        videoId: 'abc12345678',
        descriptionFetched: true,
        descriptionLength: 42,
        totalLinksFound: 1,
        usefulLinksFound: 1,
        lowValueLinksFound: 0,
        extractionSource: 'description_links',
        transcriptFetched: false
      }
    });

    expect(listLibrary(store, firstSession.user.id)).toEqual([item]);
    expect(listLibrary(store, secondSession.user.id)).toEqual([]);
  });

  it('allows users to delete only their own saved collections', async () => {
    const store = createInMemoryStore();
    const owner = await createAccount(store, 'owner@example.com', 'owner password');
    const other = await createAccount(store, 'other@example.com', 'other password');
    await verifyEmail(store, owner.verificationToken);
    await verifyEmail(store, other.verificationToken);
    const ownerSession = await login(store, 'owner@example.com', 'owner password');
    const otherSession = await login(store, 'other@example.com', 'other password');

    const item = saveExtractionToLibrary(store, ownerSession.user.id, {
      videoUrl: 'https://www.youtube.com/watch?v=abc12345678',
      links: [],
      rejected: 0,
      extractionSource: 'none',
      debug: {
        videoId: 'abc12345678',
        descriptionFetched: false,
        descriptionLength: 0,
        totalLinksFound: 0,
        usefulLinksFound: 0,
        lowValueLinksFound: 0,
        extractionSource: 'none',
        transcriptFetched: false
      }
    });

    expect(deleteLibraryItem(store, otherSession.user.id, item.id)).toBe(false);
    expect(deleteLibraryItem(store, ownerSession.user.id, item.id)).toBe(true);
    expect(listLibrary(store, ownerSession.user.id)).toEqual([]);
  });
});
