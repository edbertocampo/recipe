# Savr: TikTok recipes you won't forget

A Progressive Web App (PWA). Share a TikTok cooking video to it (or paste the link) and it turns the video into a clean recipe you can actually cook from:

- **Ingredients with amounts.** Switch between cups/spoons and **grams/ml**. Every ingredient comes with a metric weight.
- **Servings scaler.** Tap −/+ and every amount recalculates.
- **Times.** Prep, cook and total time, plus a **timer button on each step** that needs one (sound + vibration + notification).
- **Cook mode.** One big step at a time, shows the ingredients used in that step, swipe to move between steps, and keeps the screen on.
- **Shopping list.** Shares or copies the ingredients you haven't ticked off.
- **Library.** Recipes are saved on your phone and work offline. Includes search and personal notes.
- **Honest about guesses.** When the video doesn't say an amount, the app marks it with ≈. If the video only shows the dish, the recipe is labelled "Estimated".
- **Fallback.** If the recipe is in the comments or a screenshot, paste that text in too.

## How it works

1. The server resolves the TikTok link and reads the **caption** (TikTok oEmbed + the video page) and, when TikTok has them, the video's **auto-generated subtitles**. Many creators say the recipe out loud, so the subtitles matter.
2. That text goes to Claude (`claude-opus-5-5`) with a strict JSON schema, and Claude returns a structured recipe (quantities, grams, ml, step timers, nutrition estimate).
3. The PWA stores the recipe in the browser (localStorage) and does all scaling and unit switching on the device.

```
public/         the PWA (no build step): index.html, app.js, units.js, styles.css, sw.js, manifest
api/extract.js  Vercel serverless function  POST /api/extract {url, text}
lib/            TikTok fetching, Claude prompt + schema, shared handler
server.js       plain Node server for local dev or any Node host
```

## Run locally

```bash
npm install
ANTHROPIC_API_KEY=sk-ant-... npm start      # http://localhost:3000
npm test
```

## Deploy (Vercel, free tier works)

1. Import this repo in Vercel (no build settings needed; `public/` is served and `api/` becomes functions).
2. Add the environment variable `ANTHROPIC_API_KEY`.
3. Recommended: also set `ACCESS_CODE`. The app will ask for it once, which stops strangers from spending your API credits.

It also runs on Render, Railway, Fly, etc. with `npm start`.

## Install on your phone

- **Android (Chrome):** open the site, then tap **Install**. After that, Savr appears in TikTok's **Share → More** sheet. Pick it and the recipe starts loading automatically.
- **iPhone (Safari):** Share → **Add to Home Screen**. iOS doesn't let PWAs receive shares, so in TikTok tap **Share → Copy link**, open Savr and tap **Paste**.

## Notes and limits

- TikTok sometimes blocks server requests or changes its page format. When that happens the app asks you to paste the caption or recipe text instead.
- Grams for volume ingredients (e.g. "1 cup flour") and nutrition are AI estimates.
- Each extraction is one Claude API call, billed to your key.
