import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractFromYoutubeHtml, normalizeYoutubeUrl } from './extractor';

const app = express();
const port = Number(process.env.PORT ?? 8787);

app.use(express.json({ limit: '64kb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'yt2do-api' });
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
    const result = extractFromYoutubeHtml(html, videoUrl);
    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown fetch error';
    res.status(502).json({ error: `Could not fetch the YouTube page: ${message}` });
  }
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const staticDir = path.resolve(__dirname, '../dist');
app.use(express.static(staticDir));
app.use((_req, res) => {
  res.sendFile(path.join(staticDir, 'index.html'));
});

app.listen(port, () => {
  console.log(`YT2Do API listening on http://localhost:${port}`);
});
