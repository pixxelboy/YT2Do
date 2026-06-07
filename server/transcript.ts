import { YoutubeTranscript } from 'youtube-transcript';

export function parseTimedTextTranscript(xml: string): string {
  const segments = Array.from(xml.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/gi))
    .map((match) => decodeXmlText(match[1] ?? '').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  return segments.join(' ');
}

export async function fetchTranscript(transcriptUrl: string, videoUrl?: string): Promise<string> {
  const timedText = await fetchTimedTextTranscript(transcriptUrl).catch(() => '');
  if (timedText) return timedText;
  if (!videoUrl) return '';
  return fetchTranscriptPackageFallback(videoUrl).catch(() => '');
}

async function fetchTimedTextTranscript(transcriptUrl: string): Promise<string> {
  const url = new URL(transcriptUrl);
  if (!url.searchParams.has('fmt')) url.searchParams.set('fmt', 'srv3');

  const response = await fetch(url, {
    headers: {
      'Accept-Language': 'en-US,en;q=0.9',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36'
    }
  });
  if (!response.ok) return '';
  const xml = await response.text();
  return parseTimedTextTranscript(xml);
}

async function fetchTranscriptPackageFallback(videoUrl: string): Promise<string> {
  const segments = await YoutubeTranscript.fetchTranscript(videoUrl);
  return segments
    .map((segment) => segment.text?.replace(/\s+/g, ' ').trim() ?? '')
    .filter(Boolean)
    .join(' ');
}

function decodeXmlText(value: string): string {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_match, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCharCode(Number.parseInt(code, 16)));
}
