import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractFromYoutubeHtml, normalizeYoutubeUrl } from './extractor';
import { fetchTranscript } from './transcript';
import { fetchLinkPreview } from './preview';
import { claimGuestImport, createAccount, createFileStore, createGuestImport, deleteLibraryItem, getSessionUser, listLibrary, login, resendVerification, saveExtractionToLibrary, verifyEmail } from './authLibrary';
import { sendVerificationEmail } from './email';

const app = express();
const port = Number(process.env.PORT ?? 8787);
const store = createFileStore(process.env.YT2DO_STORE_PATH);

app.use(express.json({ limit: '64kb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'yt2do-api' });
});

app.post('/api/auth/signup', async (req, res) => {
  try {
    const signup = await createAccount(store, String(req.body?.email ?? ''), String(req.body?.password ?? ''));
    const verifyUrl = verificationUrl(signup.verificationToken);
    await sendVerificationEmail({ to: signup.user.email, verifyUrl, appUrl: appUrl() });
    res.status(201).json({
      user: signup.user,
      message: 'Account created. Check your email to verify the account before signing in.',
      devVerificationUrl: process.env.NODE_ENV === 'production' || process.env.RESEND_API_KEY ? undefined : verifyUrl
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'An account already exists for this email.') {
      res.status(202).json({ message: 'If an account can be created for that email, a verification link will be sent.' });
      return;
    }
    res.status(400).json({ error: error instanceof Error ? error.message : 'Could not create account.' });
  }
});

app.post('/api/auth/resend-verification', async (req, res) => {
  try {
    const resend = await resendVerification(store, String(req.body?.email ?? ''));
    if (resend) {
      const verifyUrl = verificationUrl(resend.verificationToken);
      await sendVerificationEmail({ to: resend.user.email, verifyUrl, appUrl: appUrl() });
      res.json({
        message: 'If that email is waiting for verification, a new link has been sent.',
        devVerificationUrl: process.env.NODE_ENV === 'production' || process.env.RESEND_API_KEY ? undefined : verifyUrl
      });
      return;
    }
    res.json({ message: 'If that email is waiting for verification, a new link has been sent.' });
  } catch (error) {
    res.status(429).json({ error: error instanceof Error ? error.message : 'Could not resend verification email.' });
  }
});

app.get('/api/auth/verify', async (req, res) => {
  try {
    const user = await verifyEmail(store, String(req.query.token ?? ''));
    res.redirect(`${appUrl()}?verified=1&email=${encodeURIComponent(user.email)}`);
  } catch (error) {
    res.status(400).type('html').send(`<h1>Verification failed</h1><p>${error instanceof Error ? error.message : 'Invalid verification link.'}</p>`);
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    res.json(await login(store, String(req.body?.email ?? ''), String(req.body?.password ?? '')));
  } catch (error) {
    res.status(401).json({ error: error instanceof Error ? error.message : 'Could not sign in.' });
  }
});

app.get('/api/auth/me', (req, res) => {
  const user = getSessionUser(store, req.headers.authorization);
  if (!user) {
    res.status(401).json({ error: 'Not signed in.' });
    return;
  }
  res.json({ user });
});

app.get('/api/library', (req, res) => {
  const user = getSessionUser(store, req.headers.authorization);
  if (!user) {
    res.status(401).json({ error: 'Sign in to view your private library.' });
    return;
  }
  res.json({ items: listLibrary(store, user.id) });
});

app.post('/api/library', (req, res) => {
  const user = getSessionUser(store, req.headers.authorization);
  if (!user) {
    res.status(401).json({ error: 'Sign in to save links to your private library.' });
    return;
  }
  const extraction = req.body?.extraction;
  if (!extraction?.videoUrl || !Array.isArray(extraction.links)) {
    res.status(400).json({ error: 'Missing extraction payload.' });
    return;
  }
  res.status(201).json({ item: saveExtractionToLibrary(store, user.id, extraction) });
});

app.post('/api/library/claim', (req, res) => {
  const user = getSessionUser(store, req.headers.authorization);
  if (!user) {
    res.status(401).json({ error: 'Sign in to save this import.' });
    return;
  }
  const guestImportId = String(req.body?.guestImportId ?? '');
  const guestId = String(req.body?.guestId ?? '');
  if (!guestImportId || !guestId) {
    res.status(400).json({ error: 'Missing unsaved import session.' });
    return;
  }
  try {
    res.status(201).json({ item: claimGuestImport(store, user.id, guestImportId, guestId) });
  } catch (error) {
    res.status(410).json({ error: error instanceof Error ? error.message : 'This unsaved import expired. Please run the import again.' });
  }
});

app.delete('/api/library/:id', (req, res) => {
  const user = getSessionUser(store, req.headers.authorization);
  if (!user) {
    res.status(401).json({ error: 'Sign in to manage your private library.' });
    return;
  }
  if (!deleteLibraryItem(store, user.id, req.params.id)) {
    res.status(404).json({ error: 'Library item not found.' });
    return;
  }
  res.status(204).send();
});

app.post('/api/extract', async (req, res) => {
  const videoUrl = normalizeYoutubeUrl(String(req.body?.url ?? ''));
  if (!videoUrl) {
    res.status(400).json({ error: 'Paste a valid YouTube video, Shorts, or youtu.be URL.' });
    return;
  }

  try {
    const response = await fetch(videoUrl, {
      headers: {
        'Accept-Language': 'en-US,en;q=0.9',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36'
      }
    });

    if (!response.ok) {
      res.status(502).json({ error: `YouTube returned HTTP ${response.status}. Try again or paste a different public video.` });
      return;
    }

    const html = await response.text();
    const initialResult = extractFromYoutubeHtml(html, videoUrl);
    const needsTranscript = initialResult.extractionSource !== 'description_links' && Boolean(initialResult.transcriptUrl);
    const transcript = needsTranscript ? await fetchTranscript(initialResult.transcriptUrl!, videoUrl).catch(() => '') : '';
    const result = needsTranscript && transcript ? extractFromYoutubeHtml(html, videoUrl, transcript) : initialResult;
    console.info('[YT2Do import debug]', JSON.stringify(result.debug));
    result.links = await Promise.all(
      result.links.map(async (link) => ({
        ...link,
        preview: await fetchLinkPreview(link.url, link.description)
      }))
    );

    const guestId = String(req.body?.guestId ?? '').trim();
    if (guestId) {
      const guestImport = createGuestImport(store, guestId, result);
      res.json({ ...result, guestImportId: guestImport.id, guestId });
      return;
    }

    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown fetch error';
    res.status(502).json({ error: `Could not fetch the YouTube page: ${message}` });
  }
});

function appUrl() {
  return process.env.PUBLIC_APP_URL ?? 'http://localhost:5173';
}

function apiBaseUrl() {
  return process.env.PUBLIC_API_URL ?? `http://localhost:${port}`;
}

function verificationUrl(token: string) {
  return `${apiBaseUrl()}/api/auth/verify?token=${encodeURIComponent(token)}`;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const staticDir = path.resolve(__dirname, '../dist');
app.use(express.static(staticDir));
app.use((_req, res) => {
  res.sendFile(path.join(staticDir, 'index.html'));
});

app.listen(port, () => {
  console.log(`YT2Do API listening on http://localhost:${port}`);
});
