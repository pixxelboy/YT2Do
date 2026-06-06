# YT2Do

Cross-device web app for extracting useful external tools/sites from YouTube video descriptions.

What it does:

- Accepts YouTube watch, Shorts, embed, and youtu.be URLs.
- Fetches the public video page through a small local API, because browsers cannot reliably read YouTube pages directly due to CORS.
- Extracts links from the video description only.
- Filters common creator/social/profile links and likely sponsored/affiliate/promo links.
- Keeps each extracted link tied back to the original YouTube video URL.

## Run locally

```bash
npm install
npm run dev
```

- App: http://localhost:5173
- API: http://localhost:8787/api/health

## Validate

```bash
npm test
npm run build
```

## Filtering note

Sponsor detection is heuristic. It deliberately rejects obvious affiliate networks, common sponsorship domains, coupon/promo language, creator socials, and creator bio hubs. That avoids noisy creator copy, but no automated filter can prove every link is unsponsored without source-of-truth disclosure data.
