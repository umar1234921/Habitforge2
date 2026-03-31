# Habitforge2

## Desktop app (offline)
HabitForge can run as a fully offline desktop app using Electron.

### Run locally
```bash
npm install
npm run desktop:dev
```

Cloud sync is optional and **disabled by default** in the desktop app. Use the sidebar toggle
("Enable Cloud Sync") to opt in when you want to sync.

### Build installers
```bash
npm run desktop:build
```
Build artifacts are produced in `dist/` (Windows NSIS .exe, macOS .dmg/.zip, Linux AppImage/.deb).

## Manual QA
- **Session safety**: start an interleaved session, answer a few cards, delete a referenced deck,
  choose **Delete but keep session** → reload → resume or restore via **Restore last session**.
- **Cloud sync throttling**: enable cloud sync, make rapid edits (e.g., add/delete cards),
  verify the app stays responsive and shows pause/resume toasts without losing local progress.
- **Desktop offline**: disconnect internet, run the desktop app, create a deck and study,
  restart the app and confirm progress persists with cloud sync still off by default.
