# Habitforge2

## Web app

### Run locally
```bash
npm install
npm run web:dev
```

Cloud sync is optional and can be enabled with the sidebar toggle
("Enable Cloud Sync") when you want to sync.

## Manual QA
- **Session safety**: start an interleaved session, answer a few cards, delete a referenced deck,
  choose **Delete but keep session** → reload → resume or restore via **Restore last session**.
- **Cloud sync throttling**: enable cloud sync, make rapid edits (e.g., add/delete cards),
  verify the app stays responsive and shows pause/resume toasts without losing local progress.
- **Offline usage**: disconnect internet, run the web app, create a deck and study,
  reload the page and confirm progress persists locally.
