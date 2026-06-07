import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchTranscript, parseTimedTextTranscript } from './transcript';

vi.mock('youtube-transcript', () => ({
  YoutubeTranscript: {
    fetchTranscript: vi.fn(async () => [
      { text: 'The number one hottest repo is OpenHuman.' },
      { text: 'Number two is Code Graph.' }
    ])
  }
}));

afterEach(() => {
  vi.restoreAllMocks();
});

describe('parseTimedTextTranscript', () => {
  it('turns YouTube timedtext XML into readable transcript text', () => {
    const xml = `<?xml version="1.0"?><transcript>
      <text start="0" dur="2">OpenHuman is the first repo.</text>
      <text start="2" dur="3">Code Graph maps your code base &amp; helps agents.</text>
    </transcript>`;

    expect(parseTimedTextTranscript(xml)).toBe('OpenHuman is the first repo. Code Graph maps your code base & helps agents.');
  });
});

describe('fetchTranscript', () => {
  it('falls back to the transcript package when YouTube timedtext returns an empty body', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, text: async () => '' })));

    const transcript = await fetchTranscript('https://youtube.test/api/timedtext?v=psZrQ7xGGaQ', 'https://www.youtube.com/watch?v=psZrQ7xGGaQ');

    expect(transcript).toContain('OpenHuman');
    expect(transcript).toContain('Code Graph');
  });
});
