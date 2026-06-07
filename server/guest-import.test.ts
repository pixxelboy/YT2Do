import { describe, expect, it } from 'vitest';
import { claimGuestImport, createGuestImport, createInMemoryStore, listLibrary } from './authLibrary';

const extraction = {
  videoUrl: 'https://www.youtube.com/watch?v=abc12345678',
  videoTitle: 'Useful tools',
  links: [{
    url: 'https://example.com/tool',
    host: 'example.com',
    description: 'Tool from the video',
    videoUrl: 'https://www.youtube.com/watch?v=abc12345678',
    preview: { title: 'Example Tool', description: 'A target-page description.', source: 'target-content' as const }
  }],
  transcriptResources: [{
    name: 'OpenHuman',
    description: 'Repository mentioned in the video.',
    source: 'transcript-mention' as const,
    confidence: 'medium' as const,
    status: 'unresolved' as const,
    evidence: { text: 'OpenHuman is the number one repo.' }
  }],
  rejected: 0,
  extractionSource: 'description_links' as const,
  debug: {
    videoId: 'abc12345678',
    descriptionFetched: true,
    descriptionLength: 42,
    totalLinksFound: 1,
    usefulLinksFound: 1,
    lowValueLinksFound: 0,
    extractionSource: 'description_links' as const,
    transcriptFetched: false
  }
};

describe('guest imports', () => {
  it('stores an anonymous import result before auth', () => {
    const store = createInMemoryStore();

    const guest = createGuestImport(store, 'guest-session-1', extraction);

    expect(guest.id).toBeTruthy();
    expect(guest.guestId).toBe('guest-session-1');
    expect(guest.extraction.videoUrl).toBe(extraction.videoUrl);
    expect(guest.claimedAt).toBeUndefined();
  });

  it('claims a guest import into the authenticated user library', () => {
    const store = createInMemoryStore();
    const guest = createGuestImport(store, 'guest-session-1', extraction);

    const item = claimGuestImport(store, 'user-1', guest.id, 'guest-session-1');

    expect(item.userId).toBe('user-1');
    expect(item.videoUrl).toBe(extraction.videoUrl);
    expect(listLibrary(store, 'user-1')).toHaveLength(1);
    expect(store.data.guestImports[0].claimedAt).toBeTruthy();
  });

  it('is idempotent when the same guest import is claimed more than once', () => {
    const store = createInMemoryStore();
    const guest = createGuestImport(store, 'guest-session-1', extraction);

    const first = claimGuestImport(store, 'user-1', guest.id, 'guest-session-1');
    const second = claimGuestImport(store, 'user-1', guest.id, 'guest-session-1');

    expect(second.id).toBe(first.id);
    expect(listLibrary(store, 'user-1')).toHaveLength(1);
  });

  it('explains expired guest imports clearly', () => {
    const store = createInMemoryStore();

    expect(() => claimGuestImport(store, 'user-1', 'missing-import', 'guest-session-1'))
      .toThrow('This unsaved import expired. Please run the import again.');
  });
});
