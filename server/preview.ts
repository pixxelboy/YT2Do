export type LinkPreview = {
  title: string;
  description: string;
  image?: string;
  favicon?: string;
  source: 'target-content' | 'description-line' | 'host-fallback';
};

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36';

export async function fetchLinkPreview(url: string, fallbackDescription: string): Promise<LinkPreview> {
  const host = new URL(url).hostname.replace(/^www\./, '');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4500);

  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'Accept': 'text/html,application/xhtml+xml,text/plain;q=0.8,*/*;q=0.4',
        'Accept-Language': 'en-US,en;q=0.9',
        'User-Agent': USER_AGENT
      }
    });

    const contentType = response.headers.get('content-type') ?? '';
    if (!response.ok || !contentType.toLowerCase().includes('text/html')) {
      return fallbackPreview(host, fallbackDescription, url, 'description-line');
    }

    const html = await response.text();
    return parseTargetMetadata(html.slice(0, 600_000), url, fallbackDescription);
  } catch {
    return fallbackPreview(host, fallbackDescription, url, 'description-line');
  } finally {
    clearTimeout(timeout);
  }
}

export function parseTargetMetadata(html: string, url: string, fallbackDescription: string): LinkPreview {
  const host = new URL(url).hostname.replace(/^www\./, '');
  const title = cleanText(
    pickMeta(html, ['og:title', 'twitter:title'])
    ?? html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
    ?? host
  );

  const description = cleanText(
    pickMeta(html, ['og:description', 'twitter:description', 'description'])
    ?? firstParagraph(html)
    ?? fallbackDescription
    ?? host
  );

  const image = absolutize(
    pickMeta(html, ['og:image', 'twitter:image', 'twitter:image:src'])
    ?? firstLinkedImage(html),
    url
  );
  const favicon = absolutize(
    pickLink(html, ['icon', 'shortcut icon', 'apple-touch-icon', 'mask-icon'])
    ?? '/favicon.ico',
    url
  );

  return {
    title: truncate(title || host, 90),
    description: truncate(description || fallbackDescription || host, 210),
    image,
    favicon,
    source: description ? 'target-content' : 'description-line'
  };
}

function fallbackPreview(host: string, fallbackDescription: string, url: string, source: LinkPreview['source']): LinkPreview {
  return {
    title: host,
    description: truncate(cleanText(fallbackDescription) || `Open ${host} for details.`, 210),
    favicon: new URL('/favicon.ico', url).toString(),
    source
  };
}

function pickMeta(html: string, keys: string[]): string | undefined {
  for (const key of keys) {
    const patterns = [
      new RegExp(`<meta[^>]+(?:property|name)=["']${escapeRegExp(key)}["'][^>]+content=["']([^"']*)["'][^>]*>`, 'i'),
      new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${escapeRegExp(key)}["'][^>]*>`, 'i')
    ];
    for (const pattern of patterns) {
      const match = html.match(pattern)?.[1];
      if (match) return decodeEntities(match);
    }
  }
  return undefined;
}

function pickLink(html: string, rels: string[]): string | undefined {
  const links = Array.from(html.matchAll(/<link\s+[^>]*>/gi)).map((match) => match[0]);
  for (const rel of rels) {
    const link = links.find((tag) => new RegExp(`rel=["'][^"']*${escapeRegExp(rel)}[^"']*["']`, 'i').test(tag));
    const href = link?.match(/href=["']([^"']+)["']/i)?.[1];
    if (href) return decodeEntities(href);
  }
  return undefined;
}

function firstLinkedImage(html: string): string | undefined {
  return html.match(/<img[^>]+src=["']([^"']+)["'][^>]*>/i)?.[1];
}

function firstParagraph(html: string): string | undefined {
  const body = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ');
  const paragraph = body.match(/<p[^>]*>([\s\S]{30,700}?)<\/p>/i)?.[1];
  if (!paragraph) return undefined;
  return decodeEntities(stripTags(paragraph));
}

function absolutize(value: string | undefined, baseUrl: string): string | undefined {
  if (!value) return undefined;
  try {
    return new URL(decodeEntities(value), baseUrl).toString();
  } catch {
    return undefined;
  }
}

function stripTags(value: string): string {
  return value.replace(/<[^>]+>/g, ' ');
}

function cleanText(value: string): string {
  return decodeEntities(stripTags(value)).replace(/\s+/g, ' ').trim();
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1).trim()}…`;
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number.parseInt(code, 10)));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
