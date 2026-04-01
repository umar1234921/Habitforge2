# Habitforge2

## Web app

### Run locally
```bash
npm install
npm run web:dev
```

### Optional: AI Tutor mode (Gemini)
Use a gitignored env file instead of committing keys:

1. Create `.env.local` in the project root
2. Add:
```bash
VITE_HF_GEMINI_API_KEY=your-gemini-api-key
```
3. Restart dev server:
```bash
npm run web:dev
```

Legacy fallback still works via `/js/local-config.js`, but prefer `.env.local`.

#### How to stop key revocation from happening again
- **Never commit keys**: keep them only in `.env.local` (already gitignored).
- **Use restricted keys** in Google AI Studio:
  - API restriction: Generative Language API only
  - Tight quota limits
  - Rotate keys immediately if exposed
- **Treat front-end keys as potentially discoverable**: this app runs in the browser, so for stronger protection move Gemini calls behind your own backend proxy and keep the real key server-side.

Then use **AI Tutor Mode** inside flashcard study to get concise explanations and memory hooks from the card’s Front/Back content.

Cloud sync is optional and can be enabled with the sidebar toggle
("Enable Cloud Sync") when you want to sync.

## Manual QA
- **Session safety**: start an interleaved session, answer a few cards, delete a referenced deck,
  choose **Delete but keep session** → reload → resume or restore via **Restore last session**.
- **Cloud sync throttling**: enable cloud sync, make rapid edits (e.g., add/delete cards),
  verify the app stays responsive and shows pause/resume toasts without losing local progress.
- **Offline usage**: disconnect internet, run the web app, create a deck and study,
  reload the page and confirm progress persists locally.
