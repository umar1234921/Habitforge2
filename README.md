# Habitforge2

## Web app

### Run locally
```bash
npm install
npm run web:dev
```

### Optional: AI Tutor mode (OpenRouter)
Create a local gitignored file at `/js/local-config.js`:
```js
window.HF_OPENROUTER_API_KEY = 'your-openrouter-api-key';
```
Then use **AI Tutor Mode** inside flashcard study to get beginner-friendly explanations with deck + GCSE context.
Use a restricted key (API and quota limits) because this app runs client-side. For stronger key security, route requests through your own backend proxy.

Cloud sync is optional and can be enabled with the sidebar toggle
("Enable Cloud Sync") when you want to sync.

## Manual QA
- **Session safety**: start an interleaved session, answer a few cards, delete a referenced deck,
  choose **Delete but keep session** → reload → resume or restore via **Restore last session**.
- **Cloud sync throttling**: enable cloud sync, make rapid edits (e.g., add/delete cards),
  verify the app stays responsive and shows pause/resume toasts without losing local progress.
- **Offline usage**: disconnect internet, run the web app, create a deck and study,
  reload the page and confirm progress persists locally.
