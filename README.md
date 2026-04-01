# Habitforge2

## Web app

### Run locally
```bash
npm install
npm run web:dev
```

### Optional: AI Tutor mode (Gemini)
Create a local gitignored file at `/js/local-config.js`:
```js
window.HF_GEMINI_API_KEY = 'your-gemini-api-key';
```
Then use **AI Tutor Mode** inside flashcard study to get concise explanations and memory hooks from the card’s Front/Back content.
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
