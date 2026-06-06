import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ExternalLink, Filter, Link2, Loader2, PlayCircle, ShieldCheck, Library, UserRound, Trash2 } from 'lucide-react';
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

type User = { id: string; email: string; verifiedAt?: string };
type LibraryItem = ExtractionResult & { id: string; userId: string; savedAt: string };

type Notice = { kind: 'info' | 'error' | 'success'; text: string } | null;

const TOKEN_KEY = 'yt2do.token';

function App() {
  const [url, setUrl] = useState('');
  const [result, setResult] = useState<ExtractionResult | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) ?? '');
  const [user, setUser] = useState<User | null>(null);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('signup');
  const [authLoading, setAuthLoading] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [libraryItems, setLibraryItems] = useState<LibraryItem[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [activeView, setActiveView] = useState<'extract' | 'library'>('extract');
  const [saving, setSaving] = useState(false);

  const canSubmit = useMemo(() => url.trim().length > 8 && !loading, [url, loading]);
  const authHeaders = useMemo(() => token ? { Authorization: `Bearer ${token}` } : undefined, [token]);

  useEffect(() => {
    if (!token) return;
    api<{ user: User }>('/api/auth/me', { headers: authHeaders })
      .then((payload) => setUser(payload.user))
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY);
        setToken('');
        setUser(null);
      });
  }, [token, authHeaders]);

  useEffect(() => {
    if (user && activeView === 'library') void loadLibrary();
  }, [user, activeView]);

  async function extract(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    setError('');
    setResult(null);
    setCopied(false);

    try {
      const payload = await api<ExtractionResult>('/api/extract', {
        method: 'POST',
        body: JSON.stringify({ url })
      });
      setResult(payload);
      setActiveView('extract');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Extraction failed');
    } finally {
      setLoading(false);
    }
  }

  async function submitAuth(event: React.FormEvent) {
    event.preventDefault();
    setAuthLoading(true);
    setNotice(null);

    try {
      if (authMode === 'signup') {
        const payload = await api<{ message: string; devVerificationUrl?: string }>('/api/auth/signup', {
          method: 'POST',
          body: JSON.stringify({ email: authEmail, password: authPassword })
        });
        setNotice({
          kind: 'success',
          text: payload.devVerificationUrl
            ? `${payload.message} Dev verification link: ${payload.devVerificationUrl}`
            : payload.message
        });
        setAuthMode('login');
      } else {
        const payload = await api<{ token: string; user: User }>('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email: authEmail, password: authPassword })
        });
        localStorage.setItem(TOKEN_KEY, payload.token);
        setToken(payload.token);
        setUser(payload.user);
        setNotice({ kind: 'success', text: 'Signed in. Your library is private to this account.' });
        setAuthPassword('');
      }
    } catch (err) {
      setNotice({ kind: 'error', text: err instanceof Error ? err.message : 'Authentication failed.' });
    } finally {
      setAuthLoading(false);
    }
  }

  function signOut() {
    localStorage.removeItem(TOKEN_KEY);
    setToken('');
    setUser(null);
    setLibraryItems([]);
    setNotice({ kind: 'info', text: 'Signed out.' });
  }

  async function loadLibrary() {
    if (!authHeaders) return;
    setLibraryLoading(true);
    try {
      const payload = await api<{ items: LibraryItem[] }>('/api/library', { headers: authHeaders });
      setLibraryItems(payload.items);
    } catch (err) {
      setNotice({ kind: 'error', text: err instanceof Error ? err.message : 'Could not load library.' });
    } finally {
      setLibraryLoading(false);
    }
  }

  async function saveCurrentExtraction() {
    if (!result || !authHeaders) {
      setNotice({ kind: 'error', text: 'Sign in with a verified account to save links privately.' });
      return;
    }
    setSaving(true);
    try {
      await api('/api/library', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ extraction: result })
      });
      setNotice({ kind: 'success', text: 'Saved to your private library.' });
      await loadLibrary();
    } catch (err) {
      setNotice({ kind: 'error', text: err instanceof Error ? err.message : 'Could not save to library.' });
    } finally {
      setSaving(false);
    }
  }

  async function removeLibraryItem(id: string) {
    if (!authHeaders) return;
    await api(`/api/library/${id}`, { method: 'DELETE', headers: authHeaders });
    setLibraryItems((items) => items.filter((item) => item.id !== id));
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
        <div className="badge"><ShieldCheck size={16} /> private cross-device link library</div>
        <h1>Skip the video. Keep the useful tools.</h1>
        <p>
          Paste a YouTube video URL. YT2Do removes creator/social/sponsor clutter, previews each target without AI,
          and lets verified users save private collections across devices.
        </p>
      </section>

      <section className="account-grid">
        <div className="card auth-card">
          {user ? (
            <div className="signed-in">
              <div><UserRound size={18} /> <strong>{user.email}</strong></div>
              <p>Verified account. Saved collections stay private to you.</p>
              <button className="secondary" onClick={signOut}>Sign out</button>
            </div>
          ) : (
            <form onSubmit={submitAuth}>
              <div className="auth-tabs">
                <button type="button" className={authMode === 'signup' ? 'active-tab' : 'ghost-tab'} onClick={() => setAuthMode('signup')}>Create account</button>
                <button type="button" className={authMode === 'login' ? 'active-tab' : 'ghost-tab'} onClick={() => setAuthMode('login')}>Sign in</button>
              </div>
              <label htmlFor="email">Email</label>
              <input id="email" type="email" value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} placeholder="you@example.com" />
              <label htmlFor="password">Password</label>
              <input id="password" type="password" value={authPassword} onChange={(event) => setAuthPassword(event.target.value)} placeholder="At least 8 characters" />
              <button type="submit" disabled={authLoading}>{authLoading ? <Loader2 className="spin" size={18} /> : <UserRound size={18} />} {authMode === 'signup' ? 'Create verified account' : 'Sign in'}</button>
            </form>
          )}
        </div>
        <div className="card privacy-card">
          <h2><Library size={20} /> Library</h2>
          <p>Save extracted collections after signing in. Your account token gates library reads, saves, and deletes.</p>
          <div className="view-actions">
            <button className={activeView === 'extract' ? '' : 'secondary'} onClick={() => setActiveView('extract')}>Extractor</button>
            <button className={activeView === 'library' ? '' : 'secondary'} onClick={() => setActiveView('library')} disabled={!user}>My Library</button>
          </div>
        </div>
      </section>

      {notice && <div className={`card notice ${notice.kind}`}>{notice.text}</div>}

      {activeView === 'extract' && (
        <>
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
          {result && renderResults(result, { copied, copyAll, saveCurrentExtraction, saving, canSave: Boolean(user) })}
        </>
      )}

      {activeView === 'library' && (
        <section className="results">
          <div className="result-header">
            <div>
              <p className="eyebrow">{libraryItems.length} saved collections</p>
              <h2>Your private library</h2>
            </div>
            <button className="secondary" onClick={loadLibrary} disabled={libraryLoading}>{libraryLoading ? 'Loading…' : 'Refresh'}</button>
          </div>
          {libraryItems.length === 0 ? <div className="card empty">No saved collections yet.</div> : libraryItems.map((item) => (
            <section className="library-collection" key={item.id}>
              <div className="library-heading">
                <div>
                  <h3>{item.videoTitle ?? 'Saved YouTube collection'}</h3>
                  <a href={item.videoUrl} target="_blank" rel="noreferrer"><PlayCircle size={16} /> Check original video</a>
                </div>
                <button className="danger" onClick={() => removeLibraryItem(item.id)}><Trash2 size={16} /> Delete</button>
              </div>
              <div className="grid">{item.links.map((link) => renderLinkCard(link))}</div>
            </section>
          ))}
        </section>
      )}
    </main>
  );
}

function renderResults(result: ExtractionResult, actions: { copied: boolean; copyAll: () => void; saveCurrentExtraction: () => void; saving: boolean; canSave: boolean }) {
  return (
    <section className="results">
      <div className="result-header">
        <div>
          <p className="eyebrow">{result.links.length} useful links found</p>
          <h2>{result.videoTitle ?? 'YouTube video'}</h2>
          <a href={result.videoUrl} target="_blank" rel="noreferrer"><PlayCircle size={16} /> Check original video</a>
        </div>
        <div className="result-actions">
          <button className="secondary" onClick={actions.copyAll} disabled={result.links.length === 0}>{actions.copied ? 'Copied' : 'Copy all'}</button>
          <button onClick={actions.saveCurrentExtraction} disabled={!actions.canSave || result.links.length === 0 || actions.saving}>{actions.saving ? 'Saving…' : 'Save to Library'}</button>
        </div>
      </div>

      {result.links.length === 0 ? (
        <div className="card empty">
          No non-sponsored external tools/sites were found. {result.rejected > 0 ? `${result.rejected} links were filtered out.` : ''}
        </div>
      ) : <div className="grid">{result.links.map((link) => renderLinkCard(link))}</div>}
    </section>
  );
}

function renderLinkCard(link: ExtractedLink) {
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
}

async function api<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers ?? {})
    }
  });
  if (response.status === 204) return undefined as T;
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? 'Request failed.');
  return payload;
}

createRoot(document.getElementById('root')!).render(<App />);
