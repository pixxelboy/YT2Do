import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ExternalLink, Filter, Link2, PlayCircle, ShieldCheck, UserRound, X } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardMedia, CardTitle } from '@/components/ui/card';
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
type Notice = { kind: 'info' | 'error' | 'success'; text: string } | null;

const TOKEN_KEY = 'yt2do.token';
const THEME_KEY = 'yt2do.theme';
type ThemeMode = 'light' | 'dark';

function NoticeAlert({ notice }: { notice: Notice }) {
  if (!notice) return null;
  const variant = notice.kind === 'error' ? 'destructive' : notice.kind === 'success' ? 'success' : 'info';
  const title = notice.kind === 'error' ? 'Something needs attention' : notice.kind === 'success' ? 'Ready' : 'Note';
  return (
    <Alert className="notice shark-alert" variant={variant}>
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{notice.text}</AlertDescription>
    </Alert>
  );
}

function getInitialTheme(): ThemeMode {
  const stored = localStorage.getItem(THEME_KEY);
  const theme: ThemeMode = stored === 'dark' || stored === 'light'
    ? stored
    : window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.classList.toggle('dark', theme === 'dark');
  return theme;
}

function applyTheme(theme: ThemeMode) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  localStorage.setItem(THEME_KEY, theme);
}

function ThemeToggleIcon() {
  return (
    <svg
      aria-hidden="true"
      className="transition-transform duration-200"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <path d="M0 0h24v24H0z" fill="none" stroke="none" />
      <path d="M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0" />
      <path d="M12 3l0 18" />
      <path d="M12 9l4.65 -4.65" />
      <path d="M12 14.3l7.37 -7.37" />
      <path d="M12 19.6l8.85 -8.85" />
    </svg>
  );
}

function App() {
  const [url, setUrl] = useState('');
  const [result, setResult] = useState<ExtractionResult | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) ?? '');
  const [user, setUser] = useState<User | null>(null);
  const [authDrawerOpen, setAuthDrawerOpen] = useState(false);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [authLoading, setAuthLoading] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [theme, setTheme] = useState<ThemeMode>(getInitialTheme);

  const canSubmit = useMemo(() => url.trim().length > 8 && !loading, [url, loading]);
  const authHeaders = useMemo(() => token ? { Authorization: `Bearer ${token}` } : undefined, [token]);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('verified') === '1') {
      const email = params.get('email');
      setNotice({ kind: 'success', text: email ? `${email} is verified. You can now sign in.` : 'Email verified. You can now sign in.' });
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

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
    if (!authDrawerOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeAuthDrawer();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [authDrawerOpen]);



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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Extraction failed');
    } finally {
      setLoading(false);
    }
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

  function toggleTheme() {
    setTheme((current) => current === 'dark' ? 'light' : 'dark');
  }

  function openAuthDrawer() {
    setAuthDrawerOpen(true);
    setNotice(null);
    if (!user) setAuthMode('login');
  }

  function closeAuthDrawer() {
    setAuthDrawerOpen(false);
    setNotice(null);
    setAuthPassword('');
  }

  function signOut() {
    localStorage.removeItem(TOKEN_KEY);
    setToken('');
    setUser(null);
    setAuthPassword('');
    setNotice({ kind: 'success', text: 'Signed out.' });
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
        setAuthPassword('');
      } else {
        const payload = await api<{ token: string; user: User }>('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email: authEmail, password: authPassword })
        });
        localStorage.setItem(TOKEN_KEY, payload.token);
        setToken(payload.token);
        setUser(payload.user);
        setAuthPassword('');
        setNotice({ kind: 'success', text: 'Signed in.' });
      }
    } catch (err) {
      setNotice({ kind: 'error', text: err instanceof Error ? err.message : 'Authentication failed.' });
    } finally {
      setAuthLoading(false);
    }
  }


  return (
    <main className="shell shark-shell">
      <div className="topbar">
        <Button
          aria-label={user ? 'Open account' : 'Sign in or sign up'}
          className="account-toggle"
          data-signed-in={user ? 'true' : 'false'}
          size="icon-md"
          type="button"
          variant="ghost"
          onClick={openAuthDrawer}
        >
          <UserRound size={16} />
        </Button>
        <Button
          aria-label="Toggle theme"
          className="theme-toggle group"
          data-mode={theme}
          size="icon-md"
          type="button"
          variant="ghost"
          onClick={toggleTheme}
        >
          <span className="group-data-[mode=dark]:[&_svg]:rotate-180">
            <ThemeToggleIcon />
          </span>
        </Button>
      </div>
      <section className="hero">
        <Badge className="hero-badge" variant="outline"><ShieldCheck size={16} /> No account needed</Badge>
        <h1>Skip the video. Keep the useful tools.</h1>
        <p>
          Paste a YouTube video and turn it into actionable tasks. No account needed for your first import.
        </p>
      </section>

      <NoticeAlert notice={notice} />

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
            copyAll
          })}
      </>

      <AuthDrawer
        authEmail={authEmail}
        authLoading={authLoading}
        authMode={authMode}
        authPassword={authPassword}
        isOpen={authDrawerOpen}
        notice={notice}
        user={user}
        onAuthEmailChange={setAuthEmail}
        onAuthModeChange={setAuthMode}
        onAuthPasswordChange={setAuthPassword}
        onClose={closeAuthDrawer}
        onSignOut={signOut}
        onSubmitAuth={submitAuth}
      />
    </main>
  );
}

function renderResults(result: ExtractionResult, actions: { copied: boolean; copyAll: () => void }) {
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
          <a href={result.videoUrl} target="_blank" rel="noreferrer"><PlayCircle size={16} /> Check original video</a>
        </div>
        <div className="result-actions">
          <Button variant="secondary" onClick={actions.copyAll} disabled={totalResources === 0}>{actions.copied ? 'Copied' : 'Copy all'}</Button>
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
  const title = preview?.title ?? link.description;
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
      <CardHeader className="result-card-body">
        <CardTitle className="resource-title" title={title}>{title}</CardTitle>
        <CardDescription className="target-description">{previewDescription}</CardDescription>
        <a className="url-line" href={link.url} target="_blank" rel="noreferrer" title={link.url}>{link.url}</a>
      </CardHeader>
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
      <CardHeader className="result-card-body">
        <CardTitle className="resource-title" title={resource.name}>{resource.name}</CardTitle>
        <CardDescription className="target-description">{resource.description}</CardDescription>
        <a className="url-line" href={searchUrl} target="_blank" rel="noreferrer" title={searchUrl}>{searchUrl}</a>
      </CardHeader>
      <CardFooter>
        <Button asChild variant="outline" size="sm"><a href={searchUrl} target="_blank" rel="noreferrer">Search Google <ExternalLink size={14} /></a></Button>
      </CardFooter>
    </Card>
  );
}




function AuthDrawer(props: {
  authEmail: string;
  authLoading: boolean;
  authMode: 'login' | 'signup';
  authPassword: string;
  isOpen: boolean;
  notice: Notice;
  user: User | null;
  onAuthEmailChange: (value: string) => void;
  onAuthModeChange: (mode: 'login' | 'signup') => void;
  onAuthPasswordChange: (value: string) => void;
  onClose: () => void;
  onSignOut: () => void;
  onSubmitAuth: (event: React.FormEvent) => void;
}) {
  if (!props.isOpen) return null;

  return (
    <div className="drawer-layer">
      <button className="drawer-backdrop" type="button" aria-label="Close account drawer" onClick={props.onClose} />
      <aside className="auth-drawer" role="dialog" aria-modal="true" aria-labelledby="auth-drawer-title">
        <div className="drawer-header">
          <div>
            <p className="eyebrow">YT2Do account</p>
            <h2 id="auth-drawer-title">Sign in or create an account</h2>
          </div>
          <Button aria-label="Close account drawer" size="icon-md" variant="ghost" type="button" onClick={props.onClose}>
            <X size={16} />
          </Button>
        </div>

        <NoticeAlert notice={props.notice} />

        {props.user ? (
          <div className="drawer-signed-in">
            <UserRound size={20} />
            <div>
              <strong>{props.user.email}</strong>
              <p>You are signed in.</p>
              <Button type="button" variant="outline" size="sm" onClick={props.onSignOut}>Sign out</Button>
            </div>
          </div>
        ) : (
          <form className="drawer-auth-form" onSubmit={props.onSubmitAuth}>
            <div className="auth-tabs" role="tablist" aria-label="Authentication mode">
              <Button type="button" variant={props.authMode === 'login' ? 'default' : 'ghost'} onClick={() => props.onAuthModeChange('login')}>Sign in</Button>
              <Button type="button" variant={props.authMode === 'signup' ? 'default' : 'ghost'} onClick={() => props.onAuthModeChange('signup')}>Sign up</Button>
            </div>
            <Field>
              <FieldLabel>Email</FieldLabel>
              <Input size="lg" type="email" value={props.authEmail} onChange={(event: React.ChangeEvent<HTMLInputElement>) => props.onAuthEmailChange(event.target.value)} placeholder="you@example.com" autoComplete="email" />
            </Field>
            <Field>
              <FieldLabel>Password</FieldLabel>
              <Input size="lg" type="password" value={props.authPassword} onChange={(event: React.ChangeEvent<HTMLInputElement>) => props.onAuthPasswordChange(event.target.value)} placeholder="At least 8 characters" autoComplete={props.authMode === 'login' ? 'current-password' : 'new-password'} />
            </Field>
            <Button type="submit" size="xl" isLoading={props.authLoading}>
              <UserRound size={18} /> {props.authMode === 'login' ? 'Sign in' : 'Create account'}
            </Button>
          </form>
        )}
      </aside>
    </div>
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

  const text = await response.text();
  const payload = text ? parseJsonPayload(text) : undefined;
  if (!response.ok) {
    const message = payload && typeof payload === 'object' && 'error' in payload
      ? String(payload.error)
      : text || `Request failed with HTTP ${response.status}.`;
    throw new Error(message);
  }
  return payload as T;
}

function parseJsonPayload(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
}

createRoot(document.getElementById('root')!).render(<App />);
