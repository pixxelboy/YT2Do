export type ExtractedLink = {
  url: string;
  host: string;
  description: string;
  videoTitle?: string;
  videoUrl: string;
};

export type ExtractionResult = {
  videoUrl: string;
  videoTitle?: string;
  links: ExtractedLink[];
  rejected: number;
};

const TRACKING_PARAMS = new Set([
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'utm_name',
  'si', 'feature', 'fbclid', 'gclid', 'mc_cid', 'mc_eid', 'ref', 'ref_', 'spm'
]);

const SPONSOR_KEYWORDS = [
  'sponsor', 'sponsored', 'partner', 'partnership', 'paid promotion', 'ad:', 'advertisement',
  'affiliate', 'discount', 'coupon', 'promo code', 'use code', 'save ', 'deal', 'offer',
  'trial', 'commission', 'shop my', 'merch', 'store', 'buy me', 'patreon', 'donate',
  'membership', 'join this channel', 'newsletter', 'course', 'coaching'
];

const SPONSOR_HOST_PARTS = [
  'amzn.to', 'amazon.', 'bit.ly', 'go.magik.ly', 'rstyle.me', 'shop-links.co', 'liketk.it',
  'shareasale', 'impact.com', 'partnerstack', 'refersion', 'rewardstyle', 'patreon.com',
  'buymeacoffee.com', 'ko-fi.com', 'teespring.com', 'spring.com', 'merch', 'shopify.com',
  'skillshare.com', 'brilliant.org', 'squarespace.com', 'nordvpn.com', 'surfshark.com',
  'expressvpn.com', 'audible.com', 'grammarly.com', 'betterhelp.com', 'incogni.com',
  'rayconglobal.com', 'ridge.com', 'manscaped.com', 'displate.com', 'huel.com'
];

const CREATOR_ONLY_HOSTS = [
  'youtube.com', 'youtu.be', 'instagram.com', 'tiktok.com', 'twitter.com', 'x.com', 'facebook.com',
  'threads.net', 'discord.gg', 'discord.com', 'twitch.tv', 'linktr.ee', 'beacons.ai', 'solo.to'
];

export function normalizeYoutubeUrl(input: string): string | null {
  try {
    const trimmed = input.trim();
    const prefixed = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const url = new URL(prefixed);
    const host = url.hostname.replace(/^www\./, '');
    let id: string | null = null;

    if (host === 'youtu.be') id = url.pathname.split('/').filter(Boolean)[0] ?? null;
    if (host.endsWith('youtube.com')) {
      if (url.pathname === '/watch') id = url.searchParams.get('v');
      if (url.pathname.startsWith('/shorts/')) id = url.pathname.split('/')[2] ?? null;
      if (url.pathname.startsWith('/embed/')) id = url.pathname.split('/')[2] ?? null;
    }

    if (!id || !/^[a-zA-Z0-9_-]{6,}$/.test(id)) return null;
    return `https://www.youtube.com/watch?v=${id}`;
  } catch {
    return null;
  }
}

export function extractFromYoutubeHtml(html: string, videoUrl: string): ExtractionResult {
  const title = extractTitle(html);
  const description = extractDescription(html);
  const links = extractUsefulLinks(description, videoUrl, title);
  return { videoUrl, videoTitle: title, links, rejected: countLinks(description) - links.length };
}

function extractTitle(html: string): string | undefined {
  const jsonTitle = html.match(/"title"\s*:\s*\{"simpleText"\s*:\s*"((?:\\.|[^"\\])*)"\}/)?.[1];
  if (jsonTitle) return cleanText(decodeJsonString(jsonTitle));

  const ogTitle = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i)?.[1];
  if (ogTitle) return cleanText(htmlEntityDecode(ogTitle));
  return undefined;
}

function extractDescription(html: string): string {
  const playerJson = extractBalancedJson(html, 'ytInitialPlayerResponse = ');
  if (playerJson) {
    try {
      const parsed = JSON.parse(playerJson);
      const simple = parsed?.microformat?.playerMicroformatRenderer?.description?.simpleText;
      if (typeof simple === 'string') return simple;
      const attributed = parsed?.videoDetails?.shortDescription;
      if (typeof attributed === 'string') return attributed;
    } catch {
      // Fall through to regex extraction.
    }
  }

  const shortDescription = html.match(/"shortDescription"\s*:\s*"((?:\\.|[^"\\])*)"/)?.[1];
  if (shortDescription) return decodeJsonString(shortDescription);
  return '';
}

function extractBalancedJson(html: string, marker: string): string | null {
  const start = html.indexOf(marker);
  if (start === -1) return null;
  const braceStart = html.indexOf('{', start + marker.length);
  if (braceStart === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = braceStart; i < html.length; i += 1) {
    const char = html[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return html.slice(braceStart, i + 1);
    }
  }
  return null;
}

export function extractUsefulLinks(description: string, videoUrl: string, videoTitle?: string): ExtractedLink[] {
  const lines = description.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const seen = new Set<string>();
  const results: ExtractedLink[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const urls = Array.from(line.matchAll(/https?:\/\/[^\s)\]}>'"]+/gi)).map((match) => match[0]);
    for (const raw of urls) {
      const normalized = normalizeExternalUrl(raw);
      if (!normalized) continue;
      const host = new URL(normalized).hostname.replace(/^www\./, '');
      const previousLine = lines[index - 1] && !/https?:\/\//i.test(lines[index - 1]) ? lines[index - 1] : '';
      const context = [previousLine, line].filter(Boolean).join(' ');
      if (isSponsoredOrCreatorOnly(host, context)) continue;
      if (seen.has(normalized)) continue;
      seen.add(normalized);
      results.push({
        url: normalized,
        host,
        description: summarizeLinkLine(line, normalized, host),
        videoTitle,
        videoUrl
      });
    }
  }

  return results;
}

function normalizeExternalUrl(raw: string): string | null {
  try {
    const stripped = raw.replace(/[.,;:!?]+$/, '');
    const url = new URL(stripped);

    if (url.hostname.includes('youtube.com') && url.pathname === '/redirect' && url.searchParams.get('q')) {
      return normalizeExternalUrl(url.searchParams.get('q') ?? '');
    }

    for (const key of Array.from(url.searchParams.keys())) {
      if (TRACKING_PARAMS.has(key) || key.startsWith('utm_')) url.searchParams.delete(key);
    }
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

function isSponsoredOrCreatorOnly(host: string, context: string): boolean {
  const lowerHost = host.toLowerCase();
  const lowerContext = context.toLowerCase();
  if (CREATOR_ONLY_HOSTS.some((part) => lowerHost === part || lowerHost.endsWith(`.${part}`))) return true;
  if (SPONSOR_HOST_PARTS.some((part) => lowerHost.includes(part))) return true;
  return SPONSOR_KEYWORDS.some((keyword) => lowerContext.includes(keyword));
}

function summarizeLinkLine(line: string, url: string, host: string): string {
  const withoutUrls = line.replace(/https?:\/\/[^\s)\]}>'"]+/gi, ' ');
  const cleaned = cleanText(withoutUrls)
    .replace(/^[-–—•*\d.\s]+/, '')
    .replace(/^(link|site|tool|resource|website)\s*[:：-]\s*/i, '')
    .trim();

  if (cleaned.length >= 3) return cleaned.slice(0, 180);
  return host.replace(/^www\./, '');
}

function countLinks(text: string): number {
  return Array.from(text.matchAll(/https?:\/\/[^\s)\]}>'"]+/gi)).length;
}

function decodeJsonString(value: string): string {
  try {
    return JSON.parse(`"${value}"`);
  } catch {
    return value.replace(/\\n/g, '\n').replace(/\\u0026/g, '&').replace(/\\\//g, '/');
  }
}

function htmlEntityDecode(value: string): string {
  return value.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

function cleanText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}
