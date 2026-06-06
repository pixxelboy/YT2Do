import { describe, expect, it } from 'vitest';
import { createInMemoryStore, createAccount, verifyEmail, login, saveExtractionToLibrary, listLibrary, deleteLibraryItem } from './authLibrary';

describe('account email verification and private library', () => {
  it('requires email verification before login', async () => {
    const store = createInMemoryStore();
    const signup = await createAccount(store, 'User@Example.com', 'correct horse battery staple');

    await expect(login(store, 'user@example.com', 'correct horse battery staple')).rejects.toThrow('Verify your email before signing in.');

    await verifyEmail(store, signup.verificationToken);
    const session = await login(store, 'USER@example.com', 'correct horse battery staple');

    expect(session.token).toHaveLength(48);
    expect(session.user.email).toBe('user@example.com');
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
      rejected: 0
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
      rejected: 0
    });

    expect(deleteLibraryItem(store, otherSession.user.id, item.id)).toBe(false);
    expect(deleteLibraryItem(store, ownerSession.user.id, item.id)).toBe(true);
    expect(listLibrary(store, ownerSession.user.id)).toEqual([]);
  });
});
