# Bible Study

A React + Vite proof-of-concept for searching the Bible by keyword, viewing verse meanings, taking notes, saving bookmarks, and exploring related passages through a Cytoscape bubble map.

## What's implemented

- **Full KJV text** — 31,102 verses, loaded as a local JSON asset.
- **Fuzzy keyword search** across verse text, book names, and abbreviations.
- **Curated meanings** for a small set of common terms.
- **AI-style insight** generated from cross-reference analysis.
- **Notes and bookmarks** persisted in the browser.
- **Interactive bubble map** linking verses, books, and keywords.
- **Biblical Google Map** — real Google Maps styled to look like an antique atlas (with a standard-style toggle), searchable across ~80 geocoded biblical places and ~40 biblical figures, showing relevant places/people for the selected verse.
- **Character timelines & journeys** — search a biblical figure to see their bio, approximate scholarly date range, and an animated path connecting their life events across the map.
- **PWA scaffold** (web app manifest).

## Run locally

```powershell
cd C:\Users\cscla\CascadeProjects\bible-study-app\web
npm install
npm run dev
```

The dev server runs on `http://localhost:5173` (or the next free port).

### Google Maps API key

The Map tab requires a Google Maps JavaScript API key. Create `web/.env.local` (gitignored) with:

```
VITE_GOOGLE_MAPS_API_KEY=your-key-here
```

See `C:\Users\cscla\.windsurf\plans\google-cloud-maps-setup-5844ec.md` for full Google Cloud setup steps (enabling the API, key restrictions, Android/iOS keys).

## Data

The KJV data was downloaded from [midvash/bible-data](https://github.com/midvash/bible-data) and transformed into a flat `public/data/bible.json` file. To add more translations or versions later, place a similarly shaped JSON in `public/data/` and update `src/bible.ts`.

`public/data/places.json` and `public/data/characters.json` hold the biblical geography and character datasets (see `src/places.ts` / `src/characters.ts`). Both are hand-curated starter sets (~80 places, ~40 figures) — add more entries following the existing `Place`/`Character` shapes in `src/types.ts` to expand coverage.

## Next steps

- Swap the rule-based insight for a real AI service (OpenAI/Anthropic backend).
- Add a backend with auth and cloud sync for notes/bookmarks.
- Wrap the web app with Capacitor for iOS/Android.
