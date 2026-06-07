import { describe, expect, it } from 'vitest';
import { extractFromYoutubeHtml, extractLinksFromDescription, extractUsefulLinks, normalizeYoutubeUrl } from './extractor';

const videoUrl = 'https://www.youtube.com/watch?v=psZrQ7xGGaQ';

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

  it('extracts common URL forms from descriptions and classifies useful vs low-value links', () => {
    const description = `
Resources:
- Docs: https://docs.example.com/guide?utm_source=youtube&chapter=1.
- Repo [GitHub](https://github.com/acme/project),
- Short template: bit.ly/acme-template
- Product page: example.ai/demo?ref=youtube
Follow me: https://x.com/creator
Subscribe: https://www.youtube.com/@creator
`;

    const result = extractLinksFromDescription(description, 'https://www.youtube.com/watch?v=video123', 'Video');

    expect(result.totalLinksFound).toBe(6);
    expect(result.usefulLinks.map((link) => link.url)).toEqual([
      'https://docs.example.com/guide?chapter=1',
      'https://github.com/acme/project',
      'https://bit.ly/acme-template',
      'https://example.ai/demo'
    ]);
    expect(result.lowValueLinks.map((link) => link.host)).toEqual(['x.com', 'youtube.com']);
    expect(result.usefulLinks[0].source_type).toBe('description_link');
    expect(result.usefulLinks[0].source_label).toContain('Docs');
  });

  it('deduplicates links after normalization', () => {
    const result = extractLinksFromDescription(`
Docs: https://example.com/docs?utm_source=youtube&x=1
Again: https://example.com/docs?x=1.
`, 'https://www.youtube.com/watch?v=video123');

    expect(result.totalLinksFound).toBe(2);
    expect(result.usefulLinks).toHaveLength(1);
    expect(result.usefulLinks[0].url).toBe('https://example.com/docs?x=1');
  });
});

describe('transcript-backed resource extraction', () => {
  it('surfaces useful named tools from transcript text when the description has no links', () => {
    const html = `
      <html><head><meta property="og:title" content="Top GitHub repos"></head><body>
      <script>
        ytInitialPlayerResponse = {
          "captions": {
            "playerCaptionsTracklistRenderer": {
              "captionTracks": [{"baseUrl":"https://youtube.test/api/timedtext?v=psZrQ7xGGaQ&lang=en"}]
            }
          },
          "videoDetails": {"shortDescription":"No useful links here"}
        };
      </script>
      </body></html>
    `;
    const transcript = `
      The number one hottest repo of the week on GitHub is OpenHuman.
      Number two for the week is Code Graph. It maps your code base.
      First of all, we should say that here is the GitHub repo, CLI Printing Press.
      It is called Supertonic, and here it is on Hugging Face.
      Next. Cloak browser.
    `;

    const result = extractFromYoutubeHtml(html, videoUrl, transcript);
    const names = (result.transcriptResources ?? []).map((resource) => resource.name);

    expect(result.links).toEqual([]);
    expect(names).toEqual(['OpenHuman', 'Code Graph', 'CLI Printing Press', 'Supertonic', 'Cloak browser']);
  });

  it('does not promote conversational filler as transcript resources', () => {
    const result = extractFromYoutubeHtml('', videoUrl, `
      Okay. Fair? Yeah. All right. Nice visual connection. Get up with it.
      It basically understands what's there to make it easier for Claude code.
      The number seven repo of the week is Agent Memory.
    `);

    const names = (result.transcriptResources ?? []).map((resource) => resource.name);
    expect(names).toEqual(['Agent Memory']);
  });

  it('extracts the caption track URL from YouTube player JSON', () => {
    const html = `
      <script>ytInitialPlayerResponse = {"captions":{"playerCaptionsTracklistRenderer":{"captionTracks":[{"baseUrl":"https://youtube.test/timedtext?lang=en&fmt=srv3"}]}}};</script>
    `;

    const result = extractFromYoutubeHtml(html, videoUrl);

    expect(result.transcriptUrl).toBe('https://youtube.test/timedtext?lang=en&fmt=srv3');
  });
});
