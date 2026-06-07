import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ExternalLink, Filter, Link2, PlayCircle, ShieldCheck, Library, UserRound, Trash2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardMedia, CardTitle } from '@/components/ui/card';
import { Dialog, DialogBody, DialogContent, DialogHeader } from '@/components/ui/dialog';
import { Field, FieldHelper, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Spinner } from '@/components/ui/spinner';
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
  source_type?: 'description_link' | 'description_text' | 'transcript';
  source_url?: string;
  source_label?: string;
  confidence?: 'high' | 'medium' | 'low';
  category?: 'useful' | 'low_value';
  reason?: string;
};

type TranscriptResource = {
  name: string;
  description: string;
  source: 'transcript-mention';
  confidence: 'medium';
  status: 'unresolved';
  evidence: { text: string };
};

type ExtractionResult = {
  videoUrl: string;
  videoTitle?: string;
  links: ExtractedLink[];
  otherLinks?: ExtractedLink[];
  transcriptResources?: TranscriptResource[];
  transcriptUrl?: string;
  rejected: number;
  extractionSource?: 'description_links' | 'transcript' | 'none';
  debug?: {
    videoId?: string;
    descriptionFetched: boolean;
    descriptionLength: number;
    totalLinksFound: number;
    usefulLinksFound: number;
    lowValueLinksFound: number;
    extractionSource: 'description_links' | 'transcript' | 'none';
    transcriptFetched: boolean;
    fallbackReason?: string;
  };
  guestImportId?: string;
  guestId?: string;
};

type User = { id: string; email: string; verifiedAt?: string };
type LibraryItem = ExtractionResult & { id: string; userId: string; savedAt: string };

type Notice = { kind: 'info' | 'error' | 'success'; text: string } | null;

const TOKEN_KEY = 'yt2do.token';
const GUEST_ID_KEY = 'yt2do.guestId';

function NoticeAlert({ notice }: { notice: Notice }) {
  if (!notice) return null;
  const variant = notice.kind === 'error' ? 'destructive' : notice.kind === 'success' ? 'success' : 'info';
  const title = notice.kind === 'error' ? 'Something needs attention' : notice.kind === 'success' ? 'Saved' : 'Note';
  return (
    <Alert className="notice shark-alert" variant={variant}>
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{notice.text}</AlertDescription>
    </Alert>
  );
}

function getGuestId() {
  const existing = sessionStorage.getItem(GUEST_ID_KEY);
  if (existing) return existing;
  const next = crypto.randomUUID();
  sessionStorage.setItem(GUEST_ID_KEY, next);
  return next;
}

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
  const [showAuth, setShowAuth] = useState(false);
  const [savePromptVisible, setSavePromptVisible] = useState(false);

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
      const guestId = getGuestId();
      const payload = await api<ExtractionResult>('/api/extract', {
        method: 'POST',
        body: JSON.stringify({ url, guestId })
      });
      setResult(payload);
      setSavePromptVisible(true);
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
        setAuthPassword('');
        setShowAuth(false);
        await saveCurrentExtraction({ Authorization: `Bearer ${payload.token}` });
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

  async function loadLibrary(headersOverride?: { Authorization: string }) {
    const headers = headersOverride ?? authHeaders;
    if (!headers) return;
    setLibraryLoading(true);
    try {
      const payload = await api<{ items: LibraryItem[] }>('/api/library', { headers });
      setLibraryItems(payload.items);
    } catch (err) {
      setNotice({ kind: 'error', text: err instanceof Error ? err.message : 'Could not load library.' });
    } finally {
      setLibraryLoading(false);
    }
  }

  async function saveCurrentExtraction(headersOverride?: { Authorization: string }) {
    if (!result) return;
    const headers = headersOverride ?? authHeaders;
    if (!headers) {
      setAuthMode('signup');
      setShowAuth(true);
      setNotice(null);
      return;
    }
    setSaving(true);
    try {
      if (result.guestImportId && result.guestId) {
        await api('/api/library/claim', {
          method: 'POST',
          headers,
          body: JSON.stringify({ guestImportId: result.guestImportId, guestId: result.guestId })
        });
      } else {
        await api('/api/library', {
          method: 'POST',
          headers,
          body: JSON.stringify({ extraction: result })
        });
      }
      setSavePromptVisible(false);
      setNotice({ kind: 'success', text: 'Saved. This import is now in your private library.' });
      await loadLibrary(headers);
    } catch (err) {
      setNotice({ kind: 'error', text: err instanceof Error ? err.message : 'Could not save this import. Retry when you are ready.' });
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
    const text = [
      ...result.links.map((link) => `${link.preview?.title ?? link.host}\n${link.preview?.description ?? link.description}\n${link.url}\nSource: Found in video description\nFrom: ${link.videoUrl}`),
      ...(result.otherLinks ?? []).map((link) => `${link.preview?.title ?? link.host}\n${link.preview?.description ?? link.description}\n${link.url}\nSource: Other links found in description\nFrom: ${link.videoUrl}`),
      ...(result.transcriptResources ?? []).map((resource) => `${resource.name}\n${resource.description}\n${googleSearchUrl(resource.name)}\nSource: Extracted from transcript\nFrom: ${result.videoUrl}`)
    ].join('\n\n');
    await navigator.clipboard.writeText(text);
    setCopied(true);
  }

  return (
    <main className="shell shark-shell">
      <section className="hero">
        <Badge className="hero-badge" variant="outline"><ShieldCheck size={16} /> No account needed</Badge>
        <h1>Skip the video. Keep the useful tools.</h1>
        <p>
          Paste a YouTube video and turn it into actionable tasks. No account needed for your first import.
        </p>
      </section>

      <section className="account-grid compact-account-grid">
        <Card className="privacy-card">
          <CardHeader>
            <CardTitle className="inline-title"><Library size={18} /> Library</CardTitle>
            <CardDescription>{user ? 'You are signed in. Saved imports stay private to your workspace.' : 'Import first. Save only when the result is worth keeping.'}</CardDescription>
          </CardHeader>
          <CardFooter className="view-actions">
            <Button size="lg" variant={activeView === 'extract' ? 'default' : 'secondary'} onClick={() => setActiveView('extract')}>Extractor</Button>
            <Button size="lg" variant={activeView === 'library' ? 'default' : 'secondary'} onClick={() => setActiveView('library')} disabled={!user}>My Library</Button>
            {user && <Button size="lg" variant="secondary" onClick={signOut}>Sign out</Button>}
          </CardFooter>
        </Card>
      </section>

      <NoticeAlert notice={notice} />

      <Dialog open={showAuth && !user} onOpenChange={(details: { open: boolean }) => setShowAuth(details.open)}>
        <DialogContent className="save-auth-card" size="lg">
          <DialogHeader
            title="Keep this for later"
            description="Create a private workspace to keep this import and future videos."
          />
          <DialogBody>
            <p className="eyebrow">Save this import</p>
            <form onSubmit={submitAuth}>
              <div className="auth-tabs">
                <Button type="button" variant={authMode === 'signup' ? 'default' : 'ghost'} onClick={() => setAuthMode('signup')}>New workspace</Button>
                <Button type="button" variant={authMode === 'login' ? 'default' : 'ghost'} onClick={() => setAuthMode('login')}>Sign in</Button>
              </div>
              <Field>
                <FieldLabel>Email</FieldLabel>
                <Input size="lg" type="email" value={authEmail} onChange={(event: React.ChangeEvent<HTMLInputElement>) => setAuthEmail(event.target.value)} placeholder="you@example.com" />
              </Field>
              <Field>
                <FieldLabel>Password</FieldLabel>
                <Input size="lg" type="password" value={authPassword} onChange={(event: React.ChangeEvent<HTMLInputElement>) => setAuthPassword(event.target.value)} placeholder="At least 8 characters" />
              </Field>
              <Button type="submit" size="xl" isLoading={authLoading}><UserRound size={18} /> Save this import</Button>
            </form>
          </DialogBody>
        </DialogContent>
      </Dialog>

      {activeView === 'extract' && (
        <>
          <Card className="input-card" asChild>
            <form onSubmit={extract}>
              <CardContent>
                <Field>
                  <FieldLabel>YouTube video URL</FieldLabel>
                  <div className="input-row">
                    <Input
                      size="lg"
                      value={url}
                      placeholder="https://www.youtube.com/watch?v=..."
                      onChange={(event: React.ChangeEvent<HTMLInputElement>) => setUrl(event.target.value)}
                      autoComplete="off"
                    />
                    <Button size="xl" disabled={!canSubmit} type="submit" isLoading={loading}>
                      <Link2 size={18} />
                      Extract
                    </Button>
                  </div>
                  <FieldHelper><Filter size={14} /> Description links first. Transcript only if no useful links are found.</FieldHelper>
                </Field>
              </CardContent>
            </form>
          </Card>

          {error && (
            <Alert className="error shark-alert" variant="destructive">
              <AlertTitle>Unable to import this video</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {loading && (
            <Card className="loading-card" role="status" aria-live="polite">
              <CardHeader
                title="Checking the video description…"
                description="Looking for useful links. Transcript fallback runs only if no useful description links are found."
              />
              <CardContent>
                <div className="loading-row"><Spinner className="size-5" /> Extracting resources</div>
                <Progress indeterminate />
              </CardContent>
            </Card>
          )}
          {result && renderResults(result, {
            copied,
            copyAll,
            saveCurrentExtraction,
            saving,
            showSavePrompt: savePromptVisible,
            continueWithoutSaving: () => setSavePromptVisible(false)
          })}
        </>
      )}

      {activeView === 'library' && (
        <section className="results">
          <div className="result-header">
            <div>
              <p className="eyebrow">{libraryItems.length} saved collections</p>
              <h2>Your private library</h2>
            </div>
            <Button variant="secondary" onClick={() => loadLibrary()} disabled={libraryLoading} isLoading={libraryLoading}>Refresh</Button>
          </div>
          {libraryItems.length === 0 ? <Card className="empty"><CardContent>No saved collections yet.</CardContent></Card> : libraryItems.map((item) => (
            <section className="library-collection" key={item.id}>
              <div className="library-heading">
                <div>
                  <h3>{item.videoTitle ?? 'Saved YouTube collection'}</h3>
                  <a href={item.videoUrl} target="_blank" rel="noreferrer"><PlayCircle size={16} /> Check original video</a>
                </div>
                <Button variant="destructive" onClick={() => removeLibraryItem(item.id)}><Trash2 size={16} /> Delete</Button>
              </div>
              <div className="grid">{item.links.map((link) => renderLinkCard(link))}</div>
              {(item.transcriptResources ?? []).length > 0 && (
                <section className="transcript-section">
                  <div className="section-heading">
                    <p className="eyebrow">Saved video-derived resources</p>
                    <h3>Resources without direct URLs</h3>
                  </div>
                  <div className="grid">{(item.transcriptResources ?? []).map((resource) => renderTranscriptResourceCard(resource))}</div>
                </section>
              )}
            </section>
          ))}
        </section>
      )}
    </main>
  );
}

function renderResults(result: ExtractionResult, actions: { copied: boolean; copyAll: () => void; saveCurrentExtraction: () => void; saving: boolean; showSavePrompt: boolean; continueWithoutSaving: () => void }) {
  const transcriptResources = result.transcriptResources ?? [];
  const otherLinks = result.otherLinks ?? [];
  const totalResources = result.links.length + transcriptResources.length;
  const sourceMessage = result.extractionSource === 'description_links'
    ? 'Found in video description'
    : result.extractionSource === 'transcript'
      ? 'No useful links found in the description. We used the transcript instead.'
      : 'No useful links or transcript could be extracted.';
  return (
    <section className="results">
      <div className="result-header">
        <div>
          <p className="eyebrow">{totalResources} useful resources found · {result.links.length} links · {transcriptResources.length} video-derived</p>
          <h2>Your import is ready</h2>
          <p className="result-support">{sourceMessage}</p>
          <p className="result-support">Save it to come back later, edit your tasks, and build your library.</p>
          <a href={result.videoUrl} target="_blank" rel="noreferrer"><PlayCircle size={16} /> Check original video</a>
        </div>
        <div className="result-actions">
          <Button variant="secondary" onClick={actions.copyAll} disabled={totalResources === 0}>{actions.copied ? 'Copied' : 'Copy all'}</Button>
          {actions.showSavePrompt ? (
            <>
              <Button onClick={() => actions.saveCurrentExtraction()} disabled={totalResources === 0 || actions.saving} isLoading={actions.saving}>Save this import</Button>
              <Button variant="secondary" onClick={actions.continueWithoutSaving}>Continue without saving</Button>
            </>
          ) : (
            <Button variant="secondary" onClick={() => actions.saveCurrentExtraction()} disabled={totalResources === 0 || actions.saving} isLoading={actions.saving}>Save this import</Button>
          )}
        </div>
      </div>

      {totalResources === 0 && otherLinks.length === 0 ? (
        <Card className="empty"><CardContent>
          No non-sponsored external tools/sites were found. {result.rejected > 0 ? `${result.rejected} links were filtered out.` : ''}
        </CardContent></Card>
      ) : (
        <>
          {result.links.length > 0 && (
            <section className="description-links-section">
              <div className="section-heading">
                <p className="eyebrow">Found in video description</p>
                <h3>Links found in the video description</h3>
              </div>
              <div className="grid">{result.links.map((link) => renderLinkCard(link))}</div>
            </section>
          )}
          {transcriptResources.length > 0 && (
            <section className="transcript-section">
              <div className="section-heading">
                <p className="eyebrow">Extracted from transcript</p>
                <h3>Generated from transcript because the description did not contain useful links</h3>
              </div>
              <div className="grid">{transcriptResources.map((resource) => renderTranscriptResourceCard(resource))}</div>
            </section>
          )}
          {otherLinks.length > 0 && (
            <section className="other-links-section">
              <div className="section-heading">
                <p className="eyebrow">Other links found in description</p>
                <h3>Low-value or self-promotional links</h3>
              </div>
              <div className="grid">{otherLinks.map((link) => renderLinkCard(link))}</div>
            </section>
          )}
        </>
      )}
    </section>
  );
}

function renderLinkCard(link: ExtractedLink) {
  const preview = link.preview;
  const previewDescription = preview?.description ?? link.description;
  return (
    <Card className="link-card" key={link.url}>
      <CardMedia className="preview-strip" variant="image">
        {preview?.image ? (
          <img className="preview-image" src={preview.image} alt="" loading="lazy" />
        ) : (
          <div className="preview-placeholder">
            {preview?.favicon ? <img src={preview.favicon} alt="" loading="lazy" /> : <Link2 size={24} />}
          </div>
        )}
      </CardMedia>
      <CardHeader>
        <div className="host-row">
          {preview?.favicon && <img src={preview.favicon} alt="" loading="lazy" />}
          <Badge variant={link.category === 'low_value' ? 'secondary' : 'success'}>{link.category === 'low_value' ? 'Other description link' : 'Found in video description'}</Badge>
          <span className="host" title={link.host}>{link.host}</span>
        </div>
        <CardTitle className="resource-title" title={preview?.title ?? link.description}>{preview?.title ?? link.description}</CardTitle>
        <CardDescription className="target-description">{previewDescription}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="source-line">YouTube context: {link.description}</p>
        <a className="url-line" href={link.url} target="_blank" rel="noreferrer" title={link.url}>{link.url}</a>
      </CardContent>
      <CardFooter>
        <Button asChild variant="outline" size="sm"><a href={link.url} target="_blank" rel="noreferrer">Open link <ExternalLink size={14} /></a></Button>
      </CardFooter>
    </Card>
  );
}

function renderTranscriptResourceCard(resource: TranscriptResource) {
  const searchUrl = googleSearchUrl(resource.name);
  return (
    <Card className="link-card transcript-card" key={`${resource.name}-${resource.evidence.text}`}>
      <CardMedia className="preview-strip transcript-strip" variant="image">
        <div className="preview-placeholder"><Link2 size={24} /></div>
      </CardMedia>
      <CardHeader>
        <div className="host-row">
          <Badge variant="info">Extracted from transcript</Badge>
          <span className="host">No direct URL</span>
        </div>
        <CardTitle className="resource-title" title={resource.name}>{resource.name}</CardTitle>
        <CardDescription className="target-description">{resource.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <a className="url-line" href={searchUrl} target="_blank" rel="noreferrer" title={searchUrl}>{searchUrl}</a>
      </CardContent>
      <CardFooter>
        <Button asChild variant="outline" size="sm"><a href={searchUrl} target="_blank" rel="noreferrer">Search Google <ExternalLink size={14} /></a></Button>
      </CardFooter>
    </Card>
  );
}

function googleSearchUrl(query: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
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
