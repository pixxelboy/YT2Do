import { describe, expect, it } from 'vitest';
import { extractUsefulLinks, normalizeYoutubeUrl } from './extractor';

describe('normalizeYoutubeUrl', () => {
  it('accepts common YouTube URL shapes', () => {
    expect(normalizeYoutubeUrl('https://youtu.be/abcDEF_1234?si=tracking')).toBe('https://www.youtube.com/watch?v=abcDEF_1234');
    expect(normalizeYoutubeUrl('youtube.com/shorts/abcDEF_1234')).toBe('https://www.youtube.com/watch?v=abcDEF_1234');
  });
});

describe('extractUsefulLinks', () => {
  it('keeps useful links and strips creator/sponsor clutter', () => {
    const description = `
Follow me: https://instagram.com/creator
Tool: Local-first database https://duckdb.org/docs/
Sponsored by VPNCo use code SAVE20 https://nordvpn.com/somecreator
Docs - Workflow automation https://n8n.io/
Affiliate gear list https://amzn.to/abc123
Creator site https://linktr.ee/creator
`;

    const links = extractUsefulLinks(description, 'https://www.youtube.com/watch?v=video123', 'Video');

    expect(links).toHaveLength(2);
    expect(links.map((link) => link.host)).toEqual(['duckdb.org', 'n8n.io']);
    expect(links[0].description).toBe('Local-first database');
    expect(links[0].videoUrl).toBe('https://www.youtube.com/watch?v=video123');
  });

  it('unwraps YouTube redirect links and removes tracking params', () => {
    const encoded = encodeURIComponent('https://example.com/app?utm_source=youtube&x=1#section');
    const links = extractUsefulLinks(`Resource https://www.youtube.com/redirect?q=${encoded}`, 'https://www.youtube.com/watch?v=video123');
    expect(links[0].url).toBe('https://example.com/app?x=1');
  });
});
