import { describe, expect, it } from 'vitest';
import { extractFromYoutubeHtml } from './extractor';

const dtdVideoUrl = 'https://www.youtube.com/watch?v=DTD3OoEwoLU';

describe('description-first extraction priority', () => {
  it('uses DTD3OoEwoLU-style description links before transcript resources', () => {
    const html = `
      <html><head><meta property="og:title" content="Missed description links"></head><body>
      <script>
        ytInitialPlayerResponse = {
          "captions": {"playerCaptionsTracklistRenderer": {"captionTracks": [{"baseUrl":"https://youtube.test/timedtext?v=DTD3OoEwoLU&lang=en","languageCode":"en"}]}},
          "videoDetails": {"shortDescription":"Resources mentioned:\nWebsite: https://www.cursor.com/\nRepo: https://github.com/modelcontextprotocol/servers\nTemplate: https://example.com/template?utm_source=youtube\nFollow: https://x.com/creator"}
        };
      </script>
      </body></html>
    `;
    const transcript = `Number one repo of the week is Transcript Only Tool. It is called Shadow Resource.`;

    const result = extractFromYoutubeHtml(html, dtdVideoUrl, transcript);

    expect(result.debug.videoId).toBe('DTD3OoEwoLU');
    expect(result.debug.descriptionFetched).toBe(true);
    expect(result.extractionSource).toBe('description_links');
    expect(result.debug.transcriptFetched).toBe(false);
    expect(result.links.map((link) => link.url)).toEqual([
      'https://www.cursor.com/',
      'https://github.com/modelcontextprotocol/servers',
      'https://example.com/template'
    ]);
    expect(result.links[0].source_type).toBe('description_link');
    expect(result.otherLinks?.map((link) => link.host)).toEqual(['x.com']);
    expect(result.transcriptResources).toEqual([]);
  });

  it('falls back to transcript only when no useful description links exist', () => {
    const html = `
      <script>
        ytInitialPlayerResponse = {
          "captions": {"playerCaptionsTracklistRenderer": {"captionTracks": [{"baseUrl":"https://youtube.test/timedtext?lang=en","languageCode":"en"}]}},
          "videoDetails": {"shortDescription":"Follow me https://x.com/creator and subscribe https://youtube.com/@creator"}
        };
      </script>
    `;

    const result = extractFromYoutubeHtml(html, 'https://www.youtube.com/watch?v=psZrQ7xGGaQ', 'The number seven repo of the week is Agent Memory.');

    expect(result.extractionSource).toBe('transcript');
    expect(result.debug.fallbackReason).toBe('no_useful_description_links');
    expect(result.debug.lowValueLinksFound).toBe(2);
    expect((result.transcriptResources ?? []).map((resource) => resource.name)).toEqual(['Agent Memory']);
  });
});
