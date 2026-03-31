// ═══ FIREBASE CLOUD SYNC ═══
const syncBtn = document.getElementById('sync-btn');
const syncToggle = document.getElementById('cloud-sync-toggle');
const syncStatus = document.getElementById('cloud-sync-status');

const CLOUD_SAVE_DEBOUNCE_MS = 2500;
const CLOUD_SAVE_BASE_BACKOFF_MS = 2000;
const CLOUD_SAVE_MAX_BACKOFF_MS = 5 * 60 * 1000;
const MAX_CIRCUIT_FAILURE_COUNT = 8;
const MAX_MEDIA_CHUNK_CHARS = 700000;

const CLOUD_SYNC_STATES = {
  CLOSED: 'closed',
  OPEN: 'open',
  HALF_OPEN: 'half_open',
  DISABLED: 'disabled',
};

const circuit = {
  state: CLOUD_SYNC_STATES.CLOSED,
  failureCount: 0,
  retryAt: null,
  timer: null,
};

let firebaseInitPromise = null;
let firebaseReady = false;
let app = null;
let db = null;
let auth = null;
let provider = null;
let fbUid = null;

let cloudSaveTimer = null;
let cloudSaveInFlight = false;
let pendingSaveRequested = false;

let docRef = null;
let setDoc = null;
let getDoc = null;
let getDocs = null;
let collection = null;
let initializeApp = null;
let getFirestore = null;
let getAuth = null;
let signInWithPopup = null;
let GoogleAuthProvider = null;
let onAuthStateChanged = null;

const mediaSyncSignatures = new Map();

const firebaseConfig = {
  apiKey: "AIzaSyDWBU7TfHB0fJvqEY4VT_9vtQ8VHqyvIf8",
  authDomain: "habitforge-gcse.firebaseapp.com",
  projectId: "habitforge-gcse",
  storageBucket: "habitforge-gcse.firebasestorage.app",
  messagingSenderId: "344201835050",
  appId: "1:344201835050:web:b7e11792d6c5adff370953",
  measurementId: "G-D8RYCC1DJY"
};

const _localSave = window.save;
if (typeof _localSave === 'function') {
  window.save = function(options = {}) {
    _localSave(options);
    if (options.skipCloudSync) return;
    if (isCloudSyncEnabled()) requestCloudSave();
  };
}

function isCloudSyncEnabled() {
  return typeof S !== 'undefined' && S.cloudSyncEnabled !== false;
}

function ensureCloudSyncState() {
  if (!S.cloudSync || typeof S.cloudSync !== 'object') {
    S.cloudSync = { state: 'idle', retryAt: null, lastError: null, lastSuccessAt: null };
  }
}

function formatError(err) {
  if (!err) return '';
  if (err.code) return err.code;
  if (err.message) return err.message;
  return String(err);
}

function updateSyncUi() {
  if (syncToggle) syncToggle.checked = isCloudSyncEnabled();
  if (syncBtn) {
    syncBtn.disabled = !isCloudSyncEnabled();
    if (!isCloudSyncEnabled()) {
      syncBtn.textContent = '☁ Cloud sync disabled';
      syncBtn.style.borderColor = '';
      syncBtn.style.color = '';
    } else if (fbUid && auth?.currentUser) {
      syncBtn.textContent = '☁ ' + (auth.currentUser.displayName?.split(' ')[0] || 'Synced');
      syncBtn.style.borderColor = 'var(--accent-3)';
      syncBtn.style.color = 'var(--accent-3)';
    } else {
      syncBtn.textContent = '☁ Sign in to sync';
      syncBtn.style.borderColor = '';
      syncBtn.style.color = '';
    }
  }

  if (!syncStatus) return;
  ensureCloudSyncState();
  if (!isCloudSyncEnabled()) {
    syncStatus.textContent = 'Cloud sync disabled (offline mode).';
    return;
  }
  if (!fbUid) {
    syncStatus.textContent = 'Sign in to sync across devices.';
    return;
  }
  if (S.cloudSync.state === CLOUD_SYNC_STATES.OPEN && S.cloudSync.retryAt) {
    const etaMs = Math.max(0, S.cloudSync.retryAt - Date.now());
    const etaSec = Math.max(1, Math.ceil(etaMs / 1000));
    syncStatus.textContent = `Cloud sync paused — retrying in ${etaSec}s.`;
    return;
  }
  if (S.cloudSync.state === CLOUD_SYNC_STATES.HALF_OPEN) {
    syncStatus.textContent = 'Cloud sync resuming...';
    return;
  }
  syncStatus.textContent = 'Cloud sync active.';
}

function setCloudSyncState(state, { retryAt = null, error = null, successAt = null } = {}) {
  ensureCloudSyncState();
  const prev = S.cloudSync.state;
  S.cloudSync.state = state;
  S.cloudSync.retryAt = retryAt;
  if (error) S.cloudSync.lastError = formatError(error);
  if (successAt) S.cloudSync.lastSuccessAt = successAt;
  if (prev !== state) {
    console.log(`[HabitForge] Cloud sync state: ${prev} → ${state}`);
  }
  if (typeof toast === 'function') {
    if (prev !== state && state === CLOUD_SYNC_STATES.OPEN) {
      toast('Cloud sync paused (rate limited). Your progress is saved locally.', 'info');
    }
    if (prev === CLOUD_SYNC_STATES.OPEN && state === CLOUD_SYNC_STATES.CLOSED) {
      toast('Cloud sync resumed.', 'info');
    }
  }
  updateSyncUi();
}

function isTransientError(err) {
  const code = (err && err.code) || '';
  const msg = (err && err.message) || '';
  return (
    code === 'resource-exhausted' ||
    code === 'unavailable' ||
    code === 'deadline-exceeded' ||
    code === 'aborted' ||
    code === 'cancelled' ||
    /RESOURCE_EXHAUSTED|UNAVAILABLE|quota|Bandwidth|rate|too many/i.test(msg)
  );
}

function openCircuit(err) {
  circuit.failureCount = Math.min(circuit.failureCount + 1, MAX_CIRCUIT_FAILURE_COUNT);
  const jitter = 0.5 + Math.random() * 0.5;
  const delayMs = Math.min(
    CLOUD_SAVE_MAX_BACKOFF_MS,
    CLOUD_SAVE_BASE_BACKOFF_MS * Math.pow(2, circuit.failureCount - 1) * jitter
  );
  circuit.state = CLOUD_SYNC_STATES.OPEN;
  circuit.retryAt = Date.now() + delayMs;
  setCloudSyncState(CLOUD_SYNC_STATES.OPEN, { retryAt: circuit.retryAt, error: err });

  if (circuit.timer) clearTimeout(circuit.timer);
  circuit.timer = setTimeout(() => {
    circuit.timer = null;
    if (!isCloudSyncEnabled()) return;
    circuit.state = CLOUD_SYNC_STATES.HALF_OPEN;
    setCloudSyncState(CLOUD_SYNC_STATES.HALF_OPEN, { retryAt: null });
    flushCloudQueue({ force: true });
  }, delayMs);
}

function closeCircuit(successAt = null) {
  if (circuit.timer) clearTimeout(circuit.timer);
  circuit.timer = null;
  circuit.failureCount = 0;
  circuit.retryAt = null;
  circuit.state = CLOUD_SYNC_STATES.CLOSED;
  if (successAt) {
    setCloudSyncState(CLOUD_SYNC_STATES.CLOSED, { successAt });
  } else {
    setCloudSyncState(CLOUD_SYNC_STATES.CLOSED);
  }
}

function requestCloudSave() {
  pendingSaveRequested = true;
  if (!isCloudSyncEnabled()) return;
  if (!firebaseReady && !firebaseInitPromise) ensureCloudSyncStarted();
  if (!fbUid) return;
  if (circuit.state === CLOUD_SYNC_STATES.OPEN) return;
  if (cloudSaveTimer) clearTimeout(cloudSaveTimer);
  cloudSaveTimer = setTimeout(() => {
    cloudSaveTimer = null;
    flushCloudQueue();
  }, CLOUD_SAVE_DEBOUNCE_MS);
}

async function flushCloudQueue({ force = false } = {}) {
  if (cloudSaveInFlight) return;
  if (!pendingSaveRequested) {
    if (circuit.state === CLOUD_SYNC_STATES.HALF_OPEN) closeCircuit();
    return;
  }
  if (!isCloudSyncEnabled() || !fbUid) return;
  if (!firebaseReady) {
    if (!firebaseInitPromise) ensureCloudSyncStarted();
    return;
  }
  if (circuit.state === CLOUD_SYNC_STATES.OPEN && !force) return;

  cloudSaveInFlight = true;
  pendingSaveRequested = false;
  try {
    await performCloudSave();
    closeCircuit(Date.now());
  } catch (err) {
    pendingSaveRequested = true;
    if (isTransientError(err)) {
      openCircuit(err);
    } else {
      setCloudSyncState(CLOUD_SYNC_STATES.CLOSED, { error: err });
      if (typeof toast === 'function') {
        toast('Cloud sync failed — data saved locally', 'info');
      }
    }
  } finally {
    cloudSaveInFlight = false;
    if (pendingSaveRequested) requestCloudSave();
  }
}

function mediaSignature(mediaMap) {
  if (!mediaMap || typeof mediaMap !== 'object' || Array.isArray(mediaMap)) return '';
  const names = Object.keys(mediaMap).sort();
  if (!names.length) return '';
  return names.map(name => `${name}:${String(mediaMap[name] || '').length}`).join('|');
}

function splitMediaChunks(mediaMap, maxChars = MAX_MEDIA_CHUNK_CHARS) {
  const entries = Object.entries(mediaMap || {});
  if (!entries.length) return [];
  const chunks = [];
  let cur = {};
  let curSize = 0;
  entries.forEach(([filename, dataUrl]) => {
    const safeData = String(dataUrl || '');
    const estSize = filename.length + safeData.length + 16;
    if (curSize > 0 && curSize + estSize > maxChars) {
      chunks.push(cur);
      cur = {};
      curSize = 0;
    }
    cur[filename] = safeData;
    curSize += estSize;
  });
  if (Object.keys(cur).length) chunks.push(cur);
  return chunks;
}

async function fbLoadMedia(uid) {
  const mediaByDeck = {};
  const deckMediaSnap = await getDocs(collection(db, 'gcse_users', uid, 'deck_media'));
  for (const deckDoc of deckMediaSnap.docs) {
    const deckId = deckDoc.id;
    const meta = deckDoc.data() || {};
    let chunkCount = Number(meta.chunkCount);
    if (!Number.isFinite(chunkCount) || chunkCount < 0) {
      chunkCount = 0;
    }
    const media = {};

    if (chunkCount > 0) {
      const chunkSnap = await getDocs(collection(db, 'gcse_users', uid, 'deck_media', deckId, 'chunks'));
      const seenChunkIds = new Set();
      chunkSnap.forEach(chunkDoc => {
        const chunkIdx = Number(chunkDoc.id);
        if (!Number.isInteger(chunkIdx) || chunkIdx < 0 || chunkIdx >= chunkCount) {
          console.warn('[HabitForge] Skipping invalid media chunk id:', deckId, chunkDoc.id);
          return;
        }
        seenChunkIds.add(chunkIdx);
        const chunkData = chunkDoc.data();
        if (chunkData && chunkData.media && typeof chunkData.media === 'object' && !Array.isArray(chunkData.media)) {
          Object.assign(media, chunkData.media);
        }
      });
      if (seenChunkIds.size < chunkCount) {
        console.warn('[HabitForge] Missing one or more media chunks for deck:', deckId);
      }
    } else {
      const chunkSnap = await getDocs(collection(db, 'gcse_users', uid, 'deck_media', deckId, 'chunks'));
      if (!chunkSnap.empty) {
        console.warn('[HabitForge] Missing/invalid chunkCount metadata; inferring media chunks for deck:', deckId);
        chunkSnap.forEach(chunkDoc => {
          const chunkIdx = Number(chunkDoc.id);
          if (!Number.isInteger(chunkIdx) || chunkIdx < 0) return;
          const chunkData = chunkDoc.data();
          if (chunkData && chunkData.media && typeof chunkData.media === 'object' && !Array.isArray(chunkData.media)) {
            Object.assign(media, chunkData.media);
          }
        });
      }
    }
    if (!Object.keys(media).length && meta.media && typeof meta.media === 'object' && !Array.isArray(meta.media)) {
      Object.assign(media, meta.media);
    }

    if (Object.keys(media).length) {
      mediaByDeck[deckId] = media;
      mediaSyncSignatures.set(deckId, mediaSignature(media));
    }
  }
  return mediaByDeck;
}

async function withRetry(fn, maxRetries = 3, baseDelayMs = 1000) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (!isTransientError(e) || attempt === maxRetries) throw e;
      const jitter = 0.5 + Math.random() * 0.5;
      const delayMs = baseDelayMs * Math.pow(2, attempt) * jitter;
      console.warn(`[HabitForge] Firestore transient error (attempt ${attempt + 1}), retrying in ${Math.round(delayMs)}ms:`, e.code || e.message);
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
}

async function fbSaveMedia(uid, decks) {
  if (!uid || !Array.isArray(decks)) return;
  const failedDeckIds = [];
  for (const deck of decks) {
    if (!deck || !deck.id || !deck.media || typeof deck.media !== 'object' || Array.isArray(deck.media)) continue;
    const names = Object.keys(deck.media);
    if (!names.length) continue;
    const sig = mediaSignature(deck.media);
    if (mediaSyncSignatures.get(deck.id) === sig) continue;

    const chunks = splitMediaChunks(deck.media);
    let pendingChunkIndexes = chunks.map((_, i) => i);
    let attempt = 1;
    const retryStartAt = Date.now();
    let lastChunkError = null;
    while (pendingChunkIndexes.length) {
      const failedChunkIndexes = [];
      for (const i of pendingChunkIndexes) {
        try {
          await withRetry(() =>
            setDoc(
              docRef(db, 'gcse_users', uid, 'deck_media', deck.id, 'chunks', String(i)),
              { media: chunks[i] },
              { merge: true }
            )
          );
          await new Promise(r => setTimeout(r, 150));
        } catch (e) {
          console.warn(`[HabitForge] Media chunk ${i} save failed for deck ${deck.id} (attempt ${attempt}):`, e);
          lastChunkError = e;
          failedChunkIndexes.push(i);
        }
      }
      if (!failedChunkIndexes.length) break;
      if (Date.now() - retryStartAt > CLOUD_SAVE_MAX_BACKOFF_MS) {
        pendingChunkIndexes = failedChunkIndexes;
        break;
      }
      const delayMs = Math.min(CLOUD_SAVE_MAX_BACKOFF_MS, CLOUD_SAVE_BASE_BACKOFF_MS * Math.pow(2, attempt - 1));
      await new Promise(r => setTimeout(r, delayMs));
      attempt += 1;
      pendingChunkIndexes = failedChunkIndexes;
    }

    if (pendingChunkIndexes.length) {
      failedDeckIds.push(deck.id);
      console.warn(`[HabitForge] Media cloud save failed for deck ${deck.id}; failed chunks: ${pendingChunkIndexes.join(', ')}`);
      if (lastChunkError) console.warn('[HabitForge] Last media chunk error:', lastChunkError);
      continue;
    }

    await withRetry(() =>
      setDoc(
        docRef(db, 'gcse_users', uid, 'deck_media', deck.id),
        { chunkCount: chunks.length, updatedAt: Date.now() },
        { merge: true }
      )
    );
    mediaSyncSignatures.set(deck.id, sig);
  }
  if (failedDeckIds.length) {
    throw Object.assign(
      new Error('Media cloud save failed for one or more decks'),
      { failedDeckIds }
    );
  }
}

async function fbLoad(uid) {
  try {
    const snap = await getDoc(docRef(db, 'gcse_users', uid));
    if (snap.exists()) {
      const cloudData = snap.data() || {};
      const localRevision = Number.isFinite(S.clientRevision) ? S.clientRevision : 0;
      const cloudRevision = Number.isFinite(cloudData.clientRevision) ? cloudData.clientRevision : 0;
      const localCloudSyncEnabled = S.cloudSyncEnabled;
      const localCloudSyncState = S.cloudSync;

      if (cloudRevision >= localRevision) {
        const localDecks = Array.isArray(S.flashcardDecks) ? S.flashcardDecks : [];
        const cloudDecks = Array.isArray(cloudData.flashcardDecks) ? cloudData.flashcardDecks : [];
        const cloudDeckIds = new Set(cloudDecks.map(d => d.id).filter(Boolean));
        const orphanedLocalDecks = localDecks.filter(d => d.id && !cloudDeckIds.has(d.id));

        Object.assign(S, cloudData);
        S.cloudSyncEnabled = localCloudSyncEnabled;
        S.cloudSync = localCloudSyncState;

        try {
          const cloudMedia = await fbLoadMedia(uid);
          const allIdbMedia = await MediaDB.loadAll();
          if (Array.isArray(S.flashcardDecks)) {
            const idbSavePromises = [];
            S.flashcardDecks = S.flashcardDecks.map(deck => {
              const media = cloudMedia[deck.id] || allIdbMedia[deck.id];
              if (media && Object.keys(media).length) {
                if (cloudMedia[deck.id]) {
                  idbSavePromises.push(MediaDB.save(deck.id, media));
                }
                return { ...deck, media };
              }
              return deck;
            });
            if (idbSavePromises.length) {
              const idbResults = await Promise.allSettled(idbSavePromises);
              const failures = idbResults.filter(r => r.status === 'rejected');
              if (failures.length) {
                console.warn('[HabitForge] IDB save from cloud media had failures:', failures);
              }
            }
          }
        } catch (idbErr) {
          console.warn('[HabitForge] IDB media restore failed:', idbErr);
        }

        if (orphanedLocalDecks.length > 0) {
          const mergedById = new Map([...S.flashcardDecks, ...orphanedLocalDecks].map(d => [d.id, d]));
          S.flashcardDecks = [...mergedById.values()];
          if (typeof save === 'function') save();
        } else if (typeof save === 'function') {
          save({ bumpRevision: false, skipCloudSync: true });
        }

        renderDashboard();
        renderHabits();
        renderTodos();
        renderQuickLinks();
        renderTimetable();
        renderFlashcards();
        renderDashFlashcards();
        updateXPDisplay();
        updateStreakDisplay();
        console.log('[HabitForge] ☁ Cloud data loaded');
      } else {
        console.log('[HabitForge] Local data is newer — keeping local state');
        requestCloudSave();
      }
    } else {
      console.log('[HabitForge] No cloud data yet — pushing local data to cloud');
      requestCloudSave();
    }
  } catch (e) {
    console.warn('[HabitForge] Cloud load failed:', e);
  }
}

async function performCloudSave() {
  if (!fbUid) return;
  const stateForCloud = { ...S, updatedAt: Date.now() };
  if (Array.isArray(S.flashcardDecks)) {
    stateForCloud.flashcardDecks = S.flashcardDecks.map(({ media, ...rest }) => rest);
  }
  if (!Number.isFinite(stateForCloud.clientRevision)) stateForCloud.clientRevision = 0;
  await withRetry(() => setDoc(docRef(db, 'gcse_users', fbUid), stateForCloud));
  const allDecks = Array.isArray(S.flashcardDecks) ? S.flashcardDecks : [];
  await fbSaveMedia(fbUid, allDecks);
}

async function fbSaveNow() {
  if (cloudSaveTimer) {
    clearTimeout(cloudSaveTimer);
    cloudSaveTimer = null;
  }
  pendingSaveRequested = true;
  if (circuit.state === CLOUD_SYNC_STATES.OPEN) {
    updateSyncUi();
    return;
  }
  await flushCloudQueue({ force: true });
}

async function ensureCloudSyncStarted() {
  if (firebaseReady) return;
  if (firebaseInitPromise) return firebaseInitPromise;
  firebaseInitPromise = (async () => {
    ({ initializeApp } = await import("https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js"));
    ({ getFirestore, doc: docRef, setDoc, getDoc, getDocs, collection } =
      await import("https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js"));
    ({ getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged } =
      await import("https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js"));

    app  = initializeApp(firebaseConfig);
    db   = getFirestore(app);
    auth = getAuth(app);
    provider = new GoogleAuthProvider();
    firebaseReady = true;

    onAuthStateChanged(auth, async (user) => {
      if (!isCloudSyncEnabled()) {
        fbUid = null;
        updateSyncUi();
        return;
      }
      if (user) {
        fbUid = user.uid;
        updateSyncUi();
        await fbLoad(user.uid);
      } else {
        fbUid = null;
        updateSyncUi();
      }
    });

    setCloudSyncState(CLOUD_SYNC_STATES.CLOSED);
  })();

  firebaseInitPromise.catch(err => {
    firebaseInitPromise = null;
    firebaseReady = false;
    console.warn('[HabitForge] Cloud sync init failed:', err);
    if (syncToggle) syncToggle.checked = false;
    if (typeof S !== 'undefined') S.cloudSyncEnabled = false;
    if (typeof save === 'function') save();
    setCloudSyncState(CLOUD_SYNC_STATES.DISABLED, { error: err });
    if (typeof toast === 'function') {
      toast('Cloud sync unavailable offline. Running locally only.', 'info');
    }
  });

  return firebaseInitPromise;
}

function disableCloudSync() {
  if (cloudSaveTimer) clearTimeout(cloudSaveTimer);
  cloudSaveTimer = null;
  pendingSaveRequested = false;
  if (circuit.timer) clearTimeout(circuit.timer);
  circuit.timer = null;
  circuit.state = CLOUD_SYNC_STATES.DISABLED;
  circuit.retryAt = null;
  setCloudSyncState(CLOUD_SYNC_STATES.DISABLED);
}

if (syncToggle) {
  syncToggle.checked = isCloudSyncEnabled();
  syncToggle.addEventListener('change', async () => {
    const enabled = !!syncToggle.checked;
    if (typeof S !== 'undefined') S.cloudSyncEnabled = enabled;
    if (!enabled) {
      if (typeof save === 'function') save();
      disableCloudSync();
      return;
    }
    try {
      await ensureCloudSyncStarted();
    } catch (err) {
      return;
    }
    if (typeof save === 'function') save();
    requestCloudSave();
  });
}

if (syncBtn) {
  syncBtn.addEventListener('click', async () => {
    if (!isCloudSyncEnabled()) return;
    try {
      await ensureCloudSyncStarted();
    } catch (err) {
      return;
    }
    if (fbUid) {
      await fbSaveNow();
      if (syncBtn) {
        syncBtn.textContent = '✓ Saved to cloud';
        setTimeout(() => updateSyncUi(), 2000);
      }
    } else {
      try {
        await signInWithPopup(auth, provider);
      } catch (e) {
        console.error('Sign-in failed:', e);
        alert('Sign-in failed. Make sure your Cloudflare domain is added to Firebase Authorised Domains (Step 12e).');
      }
    }
  });
}

if (isCloudSyncEnabled()) {
  ensureCloudSyncStarted();
} else {
  setCloudSyncState(CLOUD_SYNC_STATES.DISABLED);
}

updateSyncUi();
