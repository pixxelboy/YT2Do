import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ExternalLink, Filter, Link2, Loader2, PlayCircle, ShieldCheck } from 'lucide-react';
import './styles.css';

type LinkPreview = {
  title: string;
  description: string;
  image?: string;
  favicon?: string;
  source: 'target-content' | 'description-line' | 'host-fallback';
};

type ExtractedLink = {
  url: string;
  host: string;
  description: string;
  videoTitle?: string;
  videoUrl: string;
  preview?: LinkPreview;
};

type ExtractionResult = {
  videoUrl: string;
  videoTitle?: string;
  links: ExtractedLink[];
  rejected: number;
};

function App() {
  const [url, setUrl] = useState('');
  const [result, setResult] = useState<ExtractionResult | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const canSubmit = useMemo(() => url.trim().length > 8 && !loading, [url, loading]);

  async function extract(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    setError('');
    setResult(null);
    setCopied(false);

    try {
      const response = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'Extraction failed');
      setResult(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Extraction failed');
    } finally {
      setLoading(false);
    }
  }

  async function copyAll() {
    if (!result) return;
    const text = result.links
      .map((link) => `${link.preview?.title ?? link.host}\n${link.preview?.description ?? link.description}\n${link.url}\nFrom: ${link.videoUrl}`)
      .join('\n\n');
    await navigator.clipboard.writeText(text);
    setCopied(true);
  }

  return (
    <main className="shell">
      <section className="hero">
        <div className="badge"><ShieldCheck size={16} /> sponsor-filtered link extraction</div>
        <h1>Skip the video. Keep the useful tools.</h1>
        <p>
          Paste a YouTube video URL. YT2Do reads the description, removes creator/social/sponsor clutter,
          visits each remaining target page, and returns pragmatic non-AI previews from page metadata/content.
        </p>
      </section>

      <form className="card input-card" onSubmit={extract}>
        <label htmlFor="youtube-url">YouTube video URL</label>
        <div className="input-row">
          <input
            id="youtube-url"
            value={url}
            placeholder="https://www.youtube.com/watch?v=..."
            onChange={(event) => setUrl(event.target.value)}
            autoComplete="off"
          />
          <button disabled={!canSubmit} type="submit">
            {loading ? <Loader2 className="spin" size={18} /> : <Link2 size={18} />}
            Extract
          </button>
        </div>
        <div className="filters">
          <span><Filter size={14} /> filters creator bios, socials, affiliate links, coupon/promo links</span>
        </div>
      </form>

      {error && <div className="card error">{error}</div>}

      {result && (
        <section className="results">
          <div className="result-header">
            <div>
              <p className="eyebrow">{result.links.length} useful links found</p>
              <h2>{result.videoTitle ?? 'YouTube video'}</h2>
              <a href={result.videoUrl} target="_blank" rel="noreferrer"><PlayCircle size={16} /> Check original video</a>
            </div>
            <button className="secondary" onClick={copyAll} disabled={result.links.length === 0}>
              {copied ? 'Copied' : 'Copy all'}
            </button>
          </div>

          {result.links.length === 0 ? (
            <div className="card empty">
              No non-sponsored external tools/sites were found. {result.rejected > 0 ? `${result.rejected} links were filtered out.` : ''}
            </div>
          ) : (
            <div className="grid">
              {result.links.map((link) => {
                const preview = link.preview;
                const previewDescription = preview?.description ?? link.description;
                return (
                  <article className="link-card" key={link.url}>
                    <div className="preview-strip">
                      {preview?.image ? (
                        <img className="preview-image" src={preview.image} alt="" loading="lazy" />
                      ) : (
                        <div className="preview-placeholder">
                          {preview?.favicon ? <img src={preview.favicon} alt="" loading="lazy" /> : <Link2 size={24} />}
                        </div>
                      )}
                    </div>
                    <div className="host-row">
                      {preview?.favicon && <img src={preview.favicon} alt="" loading="lazy" />}
                      <span className="host" title={link.host}>{link.host}</span>
                    </div>
                    <h3 title={preview?.title ?? link.description}>{preview?.title ?? link.description}</h3>
                    <p className="target-description">{previewDescription}</p>
                    <p className="source-line">YouTube context: {link.description}</p>
                    <a className="url-line" href={link.url} target="_blank" rel="noreferrer" title={link.url}>{link.url}</a>
                    <div className="actions">
                      <a href={link.url} target="_blank" rel="noreferrer">Open link <ExternalLink size={14} /></a>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
