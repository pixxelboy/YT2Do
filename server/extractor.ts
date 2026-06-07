import type { LinkPreview } from './preview';

export type SourceType = 'description_link' | 'description_text' | 'transcript';
export type ExtractionSource = 'description_links' | 'transcript' | 'none';

export type ExtractedLink = {
  url: string;
  host: string;
  description: string;
  videoTitle?: string;
  videoUrl: string;
  preview?: LinkPreview;
  source_type?: SourceType;
  source_url?: string;
  source_label?: string;
  confidence?: 'high' | 'medium' | 'low';
  category?: 'useful' | 'low_value';
  reason?: string;
};

export type TranscriptResource = {
  name: string;
  description: string;
  source: 'transcript-mention';
  confidence: 'medium';
  status: 'unresolved';
  evidence: {
    text: string;
  };
};

export type ExtractionDebug = {
  videoId?: string;
  descriptionFetched: boolean;
  descriptionLength: number;
  totalLinksFound: number;
  usefulLinksFound: number;
  lowValueLinksFound: number;
  extractionSource: ExtractionSource;
  transcriptFetched: boolean;
  fallbackReason?: string;
};

export type ExtractionResult = {
  videoUrl: string;
  videoTitle?: string;
  links: ExtractedLink[];
  otherLinks?: ExtractedLink[];
  transcriptResources?: TranscriptResource[];
  transcriptUrl?: string;
  rejected: number;
  extractionSource: ExtractionSource;
  debug: ExtractionDebug;
};

export type DescriptionLinkExtraction = {
  usefulLinks: ExtractedLink[];
  lowValueLinks: ExtractedLink[];
  totalLinksFound: number;
};

const TRACKING_PARAMS = new Set([
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'utm_name',
  'si', 'feature', 'fbclid', 'gclid', 'mc_cid', 'mc_eid', 'ref', 'ref_', 'spm'
]);

const SPONSOR_KEYWORDS = [
  'sponsor', 'sponsored', 'partner', 'partnership', 'paid promotion', 'ad:', 'advertisement',
  'presented by', 'affiliate', 'discount', 'coupon', 'promo code', 'use code', 'save ', 'deal', 'offer',
  'trial', 'commission', 'shop my', 'merch', 'store', 'buy me', 'patreon', 'donate',
  'membership', 'join this channel', 'join us', 'coaching'
];

const USEFUL_CONTEXT_KEYWORDS = [
  'resource', 'resources', 'links', 'tool', 'tools', 'repo', 'github', 'documentation', 'docs',
  'template', 'course', 'download', 'newsletter', 'website', 'mentioned', 'references', 'article',
  'demo', 'product', 'project', 'asset', 'guide'
];

const SPONSOR_HOST_PARTS = [
  'amzn.to', 'amazon.', 'go.magik.ly', 'rstyle.me', 'shop-links.co', 'liketk.it',
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

export function extractFromYoutubeHtml(html: string, videoUrl: string, transcript = ''): ExtractionResult {
  const title = extractTitle(html);
  const description = extractDescription(html);
  const descriptionLinks = extractLinksFromDescription(description, videoUrl, title);
  const transcriptUrl = extractTranscriptUrl(html) ?? undefined;
  const descriptionFetched = description.trim().length > 0;
  const videoId = new URL(videoUrl).searchParams.get('v') ?? undefined;

  if (descriptionLinks.usefulLinks.length > 0) {
    return {
      videoUrl,
      videoTitle: title,
      links: descriptionLinks.usefulLinks,
      otherLinks: descriptionLinks.lowValueLinks,
      transcriptResources: [],
      transcriptUrl,
      rejected: descriptionLinks.lowValueLinks.length,
      extractionSource: 'description_links',
      debug: {
        videoId,
        descriptionFetched,
        descriptionLength: description.length,
        totalLinksFound: descriptionLinks.totalLinksFound,
        usefulLinksFound: descriptionLinks.usefulLinks.length,
        lowValueLinksFound: descriptionLinks.lowValueLinks.length,
        extractionSource: 'description_links',
        transcriptFetched: false
      }
    };
  }

  const transcriptResources = extractTranscriptResources(transcript);
  const extractionSource: ExtractionSource = transcriptResources.length > 0 ? 'transcript' : 'none';
  return {
    videoUrl,
    videoTitle: title,
    links: [],
    otherLinks: descriptionLinks.lowValueLinks,
    transcriptResources,
    transcriptUrl,
    rejected: descriptionLinks.lowValueLinks.length,
    extractionSource,
    debug: {
      videoId,
      descriptionFetched,
      descriptionLength: description.length,
      totalLinksFound: descriptionLinks.totalLinksFound,
      usefulLinksFound: 0,
      lowValueLinksFound: descriptionLinks.lowValueLinks.length,
      extractionSource,
      transcriptFetched: transcript.trim().length > 0,
      fallbackReason: transcriptResources.length > 0 ? 'no_useful_description_links' : 'no_useful_description_links_or_transcript'
    }
  };
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

function extractTranscriptUrl(html: string): string | null {
  const playerJson = extractBalancedJson(html, 'ytInitialPlayerResponse = ');
  if (!playerJson) return null;
  try {
    const parsed = JSON.parse(playerJson);
    const tracks = parsed?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    if (!Array.isArray(tracks)) return null;
    const englishTrack = tracks.find((track) => typeof track?.languageCode === 'string' && track.languageCode.toLowerCase().startsWith('en'));
    const firstTrack = englishTrack ?? tracks[0];
    return typeof firstTrack?.baseUrl === 'string' ? htmlEntityDecode(firstTrack.baseUrl) : null;
  } catch {
    return null;
  }
}

function extractTranscriptResources(transcript: string): TranscriptResource[] {
  if (!transcript.trim()) return [];
  const sentences = transcript
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const resources: TranscriptResource[] = [];

  for (let index = 0; index < sentences.length; index += 1) {
    const sentence = sentences[index];
    const nextSentence = sentences[index + 1] ?? '';
    for (const name of extractResourceNamesFromSentence(sentence, nextSentence)) {
      const key = name.toLowerCase();
      if (seen.has(key) || isTranscriptNoiseName(name) || !isLikelyResourceName(name)) continue;
      seen.add(key);
      resources.push({
        name,
        description: sentence.slice(0, 220),
        source: 'transcript-mention',
        confidence: 'medium',
        status: 'unresolved',
        evidence: { text: sentence }
      });
    }
  }

  return resources.slice(0, 30);
}

function extractResourceNamesFromSentence(sentence: string, nextSentence = ''): string[] {
  const names = new Set<string>();
  const patterns = [
    /(?:is called|called|named|that is|one that I like is)\s+([A-Za-z0-9][A-Za-z0-9]*(?:[\s-]+[A-Za-z0-9]+){0,3})/gi,
    /(?:This\s+is\s+from)\s+([A-Z][A-Za-z0-9]*(?:[\s-]+[A-Z]?[A-Za-z0-9]+){0,4})/g,
    /(?:repo|tool|project|model|demo|website|app)\s+(?:[^.]{0,80}?\s)?(?:is|called|named|[:,])\s+([A-Z][A-Za-z0-9]*(?:[\s-]+[A-Z]?[A-Za-z0-9]+){0,3})/gi,
    /(?:number\s+(?:one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+(?:hottest\s+)?(?:repo\s+)?(?:of\s+the\s+week\s+)?(?:on\s+GitHub\s+)?(?:is|for\s+the\s+week\s+is|for\s+the\s+week,))\s+([A-Za-z0-9][A-Za-z0-9]*(?:[\s-]+[A-Za-z0-9]+){0,3})/gi,
    /(?:GitHub\s+repo|Hugging\s+Face|called|This\s+is)[:,]?\s+([A-Z][A-Za-z0-9]*(?:[\s-]+[A-Z]?[A-Za-z0-9]+){0,3})/g
  ];

  for (const pattern of patterns) {
    for (const match of sentence.matchAll(pattern)) {
      const cleaned = normalizeCandidateName(match[1] ?? '');
      if (cleaned) names.add(cleaned);
    }
  }

  if (/^Next\.?$/i.test(sentence.trim())) {
    const cleaned = cleanCandidateName(nextSentence);
    if (cleaned) names.add(cleaned);
  }

  return Array.from(names);
}

function cleanCandidateName(value: string): string {
  return cleanText(value)
    .replace(/[.,;:!?]+$/, '')
    .replace(/\b(?:by|from)\s+[A-Z][A-Za-z0-9-]+(?:\s+[A-Z][A-Za-z0-9-]+){0,2}$/i, '')
    .replace(/\b(?:and|or|but|with|from|that|this|here|there|it|they|you|we|i|the|a|an|is|was|are)$/i, '')
    .trim();
}

function normalizeCandidateName(value: string): string {
  const cleaned = cleanCandidateName(value);
  if (!cleaned) return '';
  if (/^[a-z0-9\s-]+$/.test(cleaned) || /^[a-z][A-Za-z0-9\s-]*\b/.test(cleaned)) {
    return cleaned
      .split(/\s+/)
      .map((word) => (/^[A-Z0-9]{2,}$/.test(word) ? word : word.charAt(0).toUpperCase() + word.slice(1)))
      .join(' ');
  }
  return cleaned;
}

function isLikelyResourceName(name: string): boolean {
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.length > 5) return false;
  const hasCapitalizedWord = words.some((word) => /^[A-Z][A-Za-z0-9-]*$/.test(word));
  const hasAcronym = words.some((word) => /^[A-Z0-9]{2,}$/.test(word));
  return hasCapitalizedWord || hasAcronym;
}

function isTranscriptNoiseName(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.length < 3 || [
    'next', 'github', 'youtube', 'hacker news', 'product hunt', 'openai',
    'okay', 'fair', 'yeah', 'all right', 'nice visual connection', 'get up with',
    'great', 'help me understand', 'of course', 'go and clone', 'i love this one',
    'um good question', 'maybe 25 years', 'going to say', 'really cool',
    'a free alternative', 'when i learned', 'building the sales contract'
  ].includes(lower);
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
  return extractLinksFromDescription(description, videoUrl, videoTitle).usefulLinks;
}

export function extractLinksFromDescription(description: string, videoUrl: string, videoTitle?: string): DescriptionLinkExtraction {
  const lines = description.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const seenUseful = new Set<string>();
  const seenLowValue = new Set<string>();
  const usefulLinks: ExtractedLink[] = [];
  const lowValueLinks: ExtractedLink[] = [];
  let totalLinksFound = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const urls = extractUrlCandidates(line);
    const seenOnLine = new Set<string>();
    for (const raw of urls) {
      const normalized = normalizeExternalUrl(raw);
      if (!normalized) continue;
      if (!seenOnLine.has(normalized)) {
        seenOnLine.add(normalized);
        totalLinksFound += 1;
      }
      const host = new URL(normalized).hostname.replace(/^www\./, '');
      const previousLine = lines[index - 1] && !hasUrlCandidate(lines[index - 1]) ? lines[index - 1] : '';
      const context = [previousLine, line].filter(Boolean).join(' ');
      const classification = classifyDescriptionLink(host, context);
      const link: ExtractedLink = {
        url: normalized,
        host,
        description: summarizeLinkLine(line, normalized, host),
        videoTitle,
        videoUrl,
        source_type: 'description_link',
        source_url: videoUrl,
        source_label: context,
        confidence: classification.category === 'useful' ? 'high' : 'low',
        category: classification.category,
        reason: classification.reason
      };

      if (classification.category === 'useful') {
        if (seenUseful.has(normalized)) continue;
        seenUseful.add(normalized);
        usefulLinks.push(link);
      } else {
        if (seenLowValue.has(normalized) || seenUseful.has(normalized)) continue;
        seenLowValue.add(normalized);
        lowValueLinks.push(link);
      }
    }
  }

  return { usefulLinks, lowValueLinks, totalLinksFound };
}

function extractUrlCandidates(line: string): string[] {
  const candidates: string[] = [];
  const markdownUrlPattern = /\[[^\]]+\]\(([^\s)]+)\)/gi;
  for (const match of line.matchAll(markdownUrlPattern)) candidates.push(match[1] ?? '');

  const fullUrlPattern = /https?:\/\/[^\s)\]}>'"]+/gi;
  for (const match of line.matchAll(fullUrlPattern)) candidates.push(match[0]);

  const bareDomainPattern = /(?<![@\w/-])(?:[a-z0-9-]+\.)+(?:com|org|net|io|ai|dev|app|co|gg|ly|me|sh|so|xyz|site|tools|tech)(?:\/[^^\s)\]}>'"]*)?/gi;
  for (const match of line.matchAll(bareDomainPattern)) {
    const value = match[0];
    if (!candidates.some((candidate) => candidate.includes(value))) candidates.push(value);
  }

  return candidates.filter(Boolean);
}

function hasUrlCandidate(line: string): boolean {
  return extractUrlCandidates(line).length > 0;
}

function normalizeExternalUrl(raw: string): string | null {
  try {
    const stripped = raw
      .trim()
      .replace(/^<|>$/g, '')
      .replace(/[.,;:!?]+$/, '');
    const prefixed = /^https?:\/\//i.test(stripped) ? stripped : `https://${stripped}`;
    const url = new URL(prefixed);

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

function classifyDescriptionLink(host: string, context: string): { category: 'useful' | 'low_value'; reason: string } {
  const lowerHost = host.toLowerCase();
  const lowerContext = context.toLowerCase();
  const hasUsefulContext = USEFUL_CONTEXT_KEYWORDS.some((keyword) => lowerContext.includes(keyword));

  if (CREATOR_ONLY_HOSTS.some((part) => lowerHost === part || lowerHost.endsWith(`.${part}`))) {
    return { category: 'low_value', reason: 'creator_or_social_link' };
  }
  if (SPONSOR_HOST_PARTS.some((part) => lowerHost.includes(part)) && !hasUsefulContext) {
    return { category: 'low_value', reason: 'sponsor_or_affiliate_host' };
  }
  if (SPONSOR_KEYWORDS.some((keyword) => lowerContext.includes(keyword)) && !hasUsefulContext) {
    return { category: 'low_value', reason: 'sponsor_or_self_promo_context' };
  }
  return { category: 'useful', reason: hasUsefulContext ? 'useful_context_label' : 'external_resource_link' };
}

function summarizeLinkLine(line: string, url: string, host: string): string {
  const withoutUrls = line
    .replace(/\[[^\]]+\]\([^)]*\)/g, ' ')
    .replace(/https?:\/\/[^\s)\]}>'"]+/gi, ' ')
    .replace(/(?<![@\w/-])(?:[a-z0-9-]+\.)+(?:com|org|net|io|ai|dev|app|co|gg|ly|me|sh|so|xyz|site|tools|tech)(?:\/[^\s)\]}>'"]*)?/gi, ' ');
  const cleaned = cleanText(withoutUrls)
    .replace(/^[-–—•*\d.\s]+/, '')
    .replace(/^(link|links|site|tool|tools|resource|resources|website|repo|docs|documentation|template|course|download)\s*[:：-]\s*/i, '')
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
