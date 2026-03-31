/* ================================================================
   FLASHCARDS — Anki SM-2 Spaced Repetition
   ================================================================ */

// ─── MEDIA PERSISTENCE (IndexedDB) ───────────────────────
// Images are stored here instead of localStorage so that the 5 MB
// localStorage quota never causes them to be silently dropped.
const MediaDB = (() => {
  const DB_NAME = 'hf_media';
  const STORE   = 'deckMedia';
  const VERSION = 1;

  function open() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, VERSION);
      req.onupgradeneeded = e => e.target.result.createObjectStore(STORE);
      req.onsuccess = e => resolve(e.target.result);
      req.onerror   = e => reject(e.target.error);
    });
  }

  return {
    async save(deckId, mediaMap) {
      if (!deckId || !mediaMap || !Object.keys(mediaMap).length) return;
      const db = await open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(mediaMap, deckId);
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror    = e => { db.close(); reject(e.target.error); };
      });
    },

    async loadAll() {
      const db     = await open();
      const result = {};
      return new Promise((resolve, reject) => {
        const tx      = db.transaction(STORE, 'readonly');
        const curReq  = tx.objectStore(STORE).openCursor();
        curReq.onsuccess = e => {
          const cur = e.target.result;
          if (cur) { result[cur.key] = cur.value; cur.continue(); }
          else { db.close(); resolve(result); }
        };
        curReq.onerror = e => { db.close(); reject(e.target.error); };
      });
    },

    async delete(deckId) {
      const db = await open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(deckId);
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror    = e => { db.close(); reject(e.target.error); };
      });
    },
  };
})();

// ─── DATE HELPERS (timezone-safe) ────────────────────────
function parseLocalDate(str) {
  if (!str) return null;
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function dateToKey(d) {
  const y   = d.getFullYear();
  const m   = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function todayLocalKey() {
  return dateToKey(new Date());
}

// Duration of the card flip CSS transition (must match .fc-card-inner transition in style.css)
const FC_FLIP_DURATION_MS = 300;
const FC_AI_TUTOR_TIMEOUT_MS = 15000;
const FC_AI_TUTOR_MODEL = 'gemini-1.5-flash';
const FC_AI_TUTOR_TEMPERATURE = 0.3;
const FC_AI_TUTOR_MAX_TOKENS = 420;
const FC_SUBJECT_CTX_MAX_TOPICS = 6;
const FC_SUBJECT_CTX_MAX_POINTS = 3;


const SRS = {
  /**
   * Grade a card and return the updated card object.
   * @param {object} card  The card to grade.
   * @param {number} g     0=Again, 1=Hard, 2=Good, 3=Easy
   */
  grade(card, g) {
    let interval = card.interval || 1;
    let reps     = card.reps    || 0;
    let ef       = card.ef      || 2.5;
    let lapses   = card.lapses  || 0;

    if (g === 0) {
      // Again — keep card in learning with a same-day retry, count lapse
      interval = 0;
      reps     = 0;
      lapses++;
    } else {
      // Hard / Good / Easy: advance interval
      if (reps === 0)      interval = g === 3 ? 4 : g === 1 ? 1 : 2;
      else if (reps === 1) interval = 6;
      else                 interval = Math.round(interval * ef);

      if (g === 3) interval = Math.round(interval * 1.3); // Easy bonus
      if (g === 1) interval = Math.max(1, Math.round(interval * 0.8)); // Hard penalty

      ef = Math.max(1.3, ef + (g === 3 ? 0.15 : g === 1 ? -0.15 : 0));
      reps++;
    }

    interval = Math.max(0, interval);
    const d = new Date();
    d.setDate(d.getDate() + interval);
    const nextReview = dateToKey(d);
    return { ...card, interval, reps, ef, lapses, nextReview };
  },

  /**
   * Exam-aware grading: applies SM-2 then clamps nextReview to exam date.
   * In the final 7-day window, schedules more aggressively.
   * Falls back to normal SM-2 when exam mode is off or no exam date is set.
   */
  gradeExamAware(card, g, deck) {
    const updated = this.grade({ ...card }, g);
    if (!deck || !deck.examMode || !deck.examDate) return updated;

    const todayD  = parseLocalDate(todayLocalKey());
    const examD   = parseLocalDate(deck.examDate);
    const daysToExam = Math.max(0, Math.ceil((examD - todayD) / 86400000));

    if (daysToExam <= 0) return updated; // Exam is today or past — no clamping

    let { nextReview } = updated;

    // Clamp so nextReview never exceeds the exam date
    if (nextReview > deck.examDate) nextReview = deck.examDate;

    // Final review window (≤7 days): schedule more aggressively
    if (daysToExam <= 7) {
      const finalDays = g === 3 ? 3 : g === 2 ? 2 : 1;
      const capped    = Math.min(finalDays, daysToExam);
      const finalD    = new Date(todayD);
      finalD.setDate(finalD.getDate() + capped);
      const finalStr  = dateToKey(finalD);
      if (finalStr < nextReview) nextReview = finalStr;
    }

    return { ...updated, nextReview };
  },

  /**
   * Returns exam scheduling statistics for a deck.
   * Returns null when no exam date is configured.
   */
  examStats(deck) {
    if (!deck.examDate) return null;
    const todayD  = parseLocalDate(todayLocalKey());
    const examD   = parseLocalDate(deck.examDate);
    const daysToExam = Math.max(0, Math.ceil((examD - todayD) / 86400000));

    const totalDueBeforeExam = deck.cards.filter(
      c => !c.nextReview || c.nextReview <= deck.examDate
    ).length;

    // Count only cards not yet reviewed, due today, or overdue.
    // Cards already studied today have nextReview set to a future date and are
    // excluded here, so doing extra cards today lowers the required/day figure.
    const today = todayLocalKey();
    const remainingNow = deck.cards.filter(
      c => !c.nextReview || c.nextReview <= today
    ).length;

    const requiredPerDay = daysToExam > 0
      ? Math.ceil(remainingNow / daysToExam)
      : remainingNow;
    const effectiveDailyTarget = Math.max(deck.dailyTarget || 20, requiredPerDay);
    const behindSchedule       = requiredPerDay > (deck.dailyTarget || 20);

    return { daysToExam, totalDueBeforeExam, requiredPerDay, effectiveDailyTarget, behindSchedule };
  },

  isDue(card) {
    return !card.nextReview || card.nextReview <= todayLocalKey();
  },

  /**
   * Cards due today.
   * In exam mode: uses effectiveDailyTarget and prioritises overdue →
   * due today → cards whose nextReview falls after the exam date.
   * Otherwise: caps at deck.dailyTarget.
   */
  dueToday(deck) {
    if (deck.examMode && deck.examDate) {
      const stats          = this.examStats(deck);
      const effectiveTarget = stats ? stats.effectiveDailyTarget : (deck.dailyTarget || 20);
      const today          = todayLocalKey();
      const examDate       = deck.examDate;

      // Priority 1: overdue (no nextReview or nextReview before today)
      const overdue   = deck.cards.filter(c => !c.nextReview || c.nextReview < today);
      // Priority 2: due today
      const dueNow    = deck.cards.filter(c => c.nextReview === today);
      // Priority 3: future cards whose nextReview falls after exam (pull them forward)
      const afterExam = deck.cards.filter(
        c => c.nextReview && c.nextReview > today && c.nextReview > examDate
      );

      const seen   = new Set();
      const unique = [...overdue, ...dueNow, ...afterExam].filter(c => {
        if (seen.has(c.id)) return false;
        seen.add(c.id);
        return true;
      });
      return unique.slice(0, effectiveTarget);
    }
    const due = deck.cards.filter(c => this.isDue(c));
    return due.slice(0, deck.dailyTarget || 20);
  },

  dueCount(deck) {
    if (deck.examMode && deck.examDate) {
      const stats          = this.examStats(deck);
      const effectiveTarget = stats ? stats.effectiveDailyTarget : (deck.dailyTarget || 20);
      const today          = todayLocalKey();
      const examDate       = deck.examDate;
      const count = deck.cards.filter(c =>
        !c.nextReview || c.nextReview <= today ||
        (c.nextReview > today && c.nextReview > examDate)
      ).length;
      return Math.min(count, effectiveTarget);
    }
    return Math.min(
      deck.cards.filter(c => this.isDue(c)).length,
      deck.dailyTarget || 20
    );
  },
};

// ─── UI STATE ─────────────────────────────────────────────
let _fcCurrentDeckId      = null;
let _fcCurrentSubdeck     = null; // null = all cards; string = specific subdeck name
let _fcStudyQueue         = [];
let _fcStudyIdx           = 0;
let _fcFlipped            = false;
let _fcSessionStats       = { again: 0, hard: 0, good: 0, easy: 0 };
let _fcSessionAgainCounts = {}; // tracks per-card re-queue count this session
let _fcInterleaveMode     = false; // true during a cross-deck interleaved session
let _fcDeckLookup         = null; // cached deckId -> deck for study-session rendering
let _fcAiTutorInFlight    = false;
let _fcAiTutorCardKey     = null;
let _fcGradeBtnsByGrade   = null;
let _fcAiConfigLoadTried  = false;
let _fcAiTutorAbort       = null;
const _fcAiTutorCache     = new Map();
const _fcSubjectCtxCache  = new Map();
const FC_AI_TUTOR_CACHE_MAX = 64;

function fcCurrentDeck() {
  return (S.flashcardDecks || []).find(d => d.id === _fcCurrentDeckId) || null;
}

// In interleave mode each card carries a _deckId tag; resolve to its origin deck.
// Falls back to the current single deck in normal mode.
function _fcDeckForCard(card) {
  if (_fcInterleaveMode) {
    const id = card && card._deckId;
    if (!id) return null;
    if (_fcDeckLookup && _fcDeckLookup.has(id)) return _fcDeckLookup.get(id) || null;
    return (S.flashcardDecks || []).find(d => d.id === id) || null;
  }
  return fcCurrentDeck();
}

function fcCurrentStudyCard() {
  return (_fcStudyIdx >= 0 && _fcStudyIdx < _fcStudyQueue.length) ? _fcStudyQueue[_fcStudyIdx] : null;
}

function fcAiTutorKey(card, deck) {
  if (!card) return '';
  const deckId = deck && deck.id ? deck.id : (_fcInterleaveMode ? (card._deckId || '') : (_fcCurrentDeckId || ''));
  return `${deckId}::${card.id || ''}::${card.front || ''}::${card.back || ''}`;
}

function fcAiCacheSet(key, val) {
  if (!key || !val) return;
  _fcAiTutorCache.set(key, val);
  if (_fcAiTutorCache.size > FC_AI_TUTOR_CACHE_MAX) {
    const oldestKey = _fcAiTutorCache.keys().next().value;
    if (oldestKey) _fcAiTutorCache.delete(oldestKey);
  }
}

function fcSetAiStatus(text) {
  const el = $('fc-ai-status');
  if (el) el.textContent = text;
}

function fcSetAiOutput(text) {
  const el = $('fc-ai-output');
  if (!el) return;
  if (!text) {
    el.textContent = '';
    el.classList.add('fc-hidden');
    return;
  }
  el.textContent = text;
  el.classList.remove('fc-hidden');
}

function fcPrepareAiTutor(card, deck) {
  const btn = $('fc-ai-tutor-btn');
  if (!btn) return;
  if (_fcAiTutorAbort) {
    try { _fcAiTutorAbort.abort(); } catch(e) {}
    _fcAiTutorAbort = null;
  }
  _fcAiTutorInFlight = false;
  btn.disabled = false;
  const key = fcAiTutorKey(card, deck);
  _fcAiTutorCardKey = key;
  const cached = key ? _fcAiTutorCache.get(key) : null;
  if (cached) {
    fcSetAiStatus('AI Tutor explanation ready (cached).');
    fcSetAiOutput(cached);
  } else {
    fcSetAiStatus('Need help? Ask AI Tutor for a beginner-friendly explanation.');
    fcSetAiOutput('');
  }
}

function fcGeminiApiKey() {
  return (window.HF_GEMINI_API_KEY || window.GEMINI_API_KEY || window.hfGeminiApiKey || '').trim();
}

async function fcEnsureAiConfigLoaded() {
  if (_fcAiConfigLoadTried) return;
  _fcAiConfigLoadTried = true;
  if (fcGeminiApiKey()) return;
  try {
    await loadScript('/js/local-config.js');
  } catch (e) {
    // Optional local config file may not exist in repository.
  }
}

function fcSubjectContext(deck) {
  const subjectKey = deck && deck.subject ? deck.subject : '';
  if (!subjectKey) return '';
  if (_fcSubjectCtxCache.has(subjectKey)) return _fcSubjectCtxCache.get(subjectKey);
  const subj = GCSE_SUBJECTS[subjectKey];
  if (!subj) return '';
  const lines = [];
  lines.push(`Subject: ${subj.name || subjectKey}`);
  if (subj.board) lines.push(`Exam board: ${subj.board}`);
  const topics = Array.isArray(subj.topics) ? subj.topics.slice(0, FC_SUBJECT_CTX_MAX_TOPICS) : [];
  topics.forEach(t => {
    const pts = Array.isArray(t.points) ? t.points.slice(0, FC_SUBJECT_CTX_MAX_POINTS) : [];
    lines.push(`- ${t.topic}: ${pts.join('; ')}`);
  });
  const ctx = lines.join('\n');
  _fcSubjectCtxCache.set(subjectKey, ctx);
  return ctx;
}

function fcBuildTutorPrompt(card, deck) {
  const deckName = deck && deck.name ? deck.name : (_fcInterleaveMode ? (card._deckName || 'Interleaved') : 'Deck');
  const subjectCtx = fcSubjectContext(deck);
  return [
    'You are a GCSE tutor.',
    'Explain this flashcard to a student who knows absolutely nothing about the topic.',
    'Keep language very simple and avoid jargon.',
    'Use this exact structure:',
    '1) Plain-English idea (2-3 lines)',
    '2) Why it matters for GCSE',
    '3) Tiny worked example',
    '4) One common mistake',
    '5) One quick check question (with answer hidden after "Answer:")',
    '',
    `Deck: ${deckName}`,
    `Flashcard question: ${card.front || ''}`,
    `Flashcard answer: ${card.back || ''}`,
    subjectCtx ? `GCSE context:\n${subjectCtx}` : 'GCSE context: general GCSE revision context',
  ].join('\n');
}

function fcExtractGeminiText(payload) {
  try {
    const parts = payload && payload.candidates && payload.candidates[0] &&
      payload.candidates[0].content && Array.isArray(payload.candidates[0].content.parts)
      ? payload.candidates[0].content.parts
      : [];
    return parts.map(p => (p && p.text) ? p.text : '').join('\n').trim();
  } catch (e) {
    return '';
  }
}

async function explainCurrentCardWithAi() {
  const card = fcCurrentStudyCard();
  if (!card) return;
  const deck = _fcDeckForCard(card);
  const key = fcAiTutorKey(card, deck);
  if (!key) return;

  const cached = _fcAiTutorCache.get(key);
  if (cached) {
    fcSetAiStatus('AI Tutor explanation ready (cached).');
    fcSetAiOutput(cached);
    return;
  }
  if (_fcAiTutorInFlight) return;

  await fcEnsureAiConfigLoaded();
  const apiKey = fcGeminiApiKey();
  if (!apiKey) {
    fcSetAiStatus('AI Tutor unavailable: Gemini API key not found.');
    toast('Add HF_GEMINI_API_KEY in /js/local-config.js (see README).', 'info');
    return;
  }

  _fcAiTutorInFlight = true;
  const btn = $('fc-ai-tutor-btn');
  if (btn) btn.disabled = true;
  fcSetAiStatus('AI Tutor is thinking…');

  const prompt = fcBuildTutorPrompt(card, deck);
  const controller = new AbortController();
  _fcAiTutorAbort = controller;
  const timeout = setTimeout(() => controller.abort(), FC_AI_TUTOR_TIMEOUT_MS);

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${FC_AI_TUTOR_MODEL}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: FC_AI_TUTOR_TEMPERATURE,
            maxOutputTokens: FC_AI_TUTOR_MAX_TOKENS,
          },
          safetySettings: [
            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
            { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
          ],
        }),
        signal: controller.signal,
      }
    );
    if (!res.ok) throw new Error(`Gemini request failed (${res.status})`);
    const data = await res.json();
    const text = fcExtractGeminiText(data);
    if (!text) throw new Error('Empty tutor response');

    fcAiCacheSet(key, text);
    if (_fcAiTutorCardKey === key) {
      fcSetAiOutput(text);
      fcSetAiStatus('AI Tutor explanation ready.');
    }
  } catch (e) {
    if (_fcAiTutorCardKey === key) {
      fcSetAiStatus('AI Tutor failed — check your key/connection and try again.');
    }
    console.warn('[ai tutor]', e);
  } finally {
    clearTimeout(timeout);
    if (_fcAiTutorAbort === controller) _fcAiTutorAbort = null;
    _fcAiTutorInFlight = false;
    if (btn) btn.disabled = false;
  }
}

// Returns a new array of cards interleaved round-robin by the supplied key function.
// Within each group the cards are shuffled randomly.  Falls back to a plain random
// shuffle when all cards share the same key (no interleaving possible).
function _interleaveByKey(cards, keyFn) {
  const groups = {};
  const order  = [];
  for (const card of cards) {
    const key = keyFn(card);
    if (!groups[key]) { groups[key] = []; order.push(key); }
    groups[key].push(card);
  }
  if (order.length <= 1) return [...cards].sort(() => Math.random() - 0.5);
  for (const key of order) groups[key].sort(() => Math.random() - 0.5);
  const result = [];
  let active = [...order];
  while (active.length > 0) {
    const nextActive = [];
    for (const key of active) {
      if (groups[key].length > 0) {
        result.push(groups[key].shift());
        if (groups[key].length > 0) nextActive.push(key);
      }
    }
    active = nextActive;
  }
  return result;
}

// ─── SESSION PROGRESS PERSISTENCE ────────────────────────
// Session state is stored in S.fcSession so that it is included in the
// regular save() / cloud sync cycle and persists across devices.
const FC_SESSION_TRASH_MAX_ENTRIES = 8;

function fcCloneSession(sess) {
  try { return JSON.parse(JSON.stringify(sess)); } catch (e) { return null; }
}

function fcSessionDeckIds(sess) {
  if (!sess) return [];
  if (sess.interleaved) {
    const ids = new Set();
    (sess.queueIds || []).forEach(entry => {
      if (entry && entry._deckId) ids.add(entry._deckId);
    });
    return [...ids];
  }
  return sess.deckId ? [sess.deckId] : [];
}

function updateRestoreSessionBtn() {
  const btn = $('fc-restore-session-btn');
  if (!btn) return;
  const hasTrash = Array.isArray(S.fcSessionTrash) && S.fcSessionTrash.length > 0;
  btn.classList.toggle('fc-hidden', !hasTrash);
}

function fcTrashSession(reason = 'cleared') {
  const sess = S.fcSession;
  if (!sess || sess.status === 'cleared') return;
  if (!Array.isArray(S.fcSessionTrash)) S.fcSessionTrash = [];
  const copy = fcCloneSession(sess);
  if (!copy) return;
  const meta = {
    deckIds: fcSessionDeckIds(copy),
    interleaved: !!copy.interleaved,
    date: copy.date || null,
  };
  S.fcSessionTrash.unshift({
    trashedAt: Date.now(),
    reason,
    session: copy,
    meta,
  });
  if (S.fcSessionTrash.length > FC_SESSION_TRASH_MAX_ENTRIES) {
    S.fcSessionTrash.length = FC_SESSION_TRASH_MAX_ENTRIES;
  }
  updateRestoreSessionBtn();
}

function fcClearSavedSession(reason = 'cleared') {
  try {
    fcTrashSession(reason);
    if (S.fcSession && typeof S.fcSession === 'object') {
      S.fcSession = { status: 'cleared', clearedAt: Date.now(), reason };
    }
    save();
  } catch(e) {}
}

function fcDiscardSession(reason = 'discarded', options = {}) {
  try {
    S.fcSession = null;
    if (!options.skipSave) save();
  } catch(e) {}
}

function fcRestoreLastSession() {
  try {
    if (!Array.isArray(S.fcSessionTrash) || !S.fcSessionTrash.length) {
      toast('No saved sessions to restore', 'info');
      return;
    }
    if (S.fcSession && Array.isArray(S.fcSession.queueIds) && S.fcSession.queueIds.length) {
      fcTrashSession('restore-overwrite');
    }
    const entry = S.fcSessionTrash.shift();
    const restored = entry ? (fcCloneSession(entry.session) || entry.session) : null;
    if (!restored) {
      updateRestoreSessionBtn();
      save();
      return;
    }
    delete restored.status;
    S.fcSession = restored;
    save();
    updateRestoreSessionBtn();
    renderFCDecks();
    const missingDecks = (entry?.meta?.deckIds || []).filter(id =>
      !(S.flashcardDecks || []).some(d => d.id === id)
    );
    if (missingDecks.length) {
      toast('Session restored, but some decks are missing. Missing cards will be skipped.', 'info');
    } else {
      toast('Session restored — open the deck to resume.', 'info');
    }
  } catch(e) {}
}

function fcSessionReferencesDeck(deckId) {
  const sess = S.fcSession;
  if (!sess || sess.status === 'cleared' || sess.trashed) return false;
  if (sess.interleaved) {
    return Array.isArray(sess.queueIds) && sess.queueIds.some(entry => entry && entry._deckId === deckId);
  }
  return sess.deckId === deckId;
}

function markSessionDeckDeleted(deckId, deckName) {
  if (!S.fcSession || typeof S.fcSession !== 'object') return;
  const prev = S.fcSession.degraded || {};
  const missingDeckIds = new Set(Array.isArray(prev.missingDeckIds) ? prev.missingDeckIds : []);
  if (deckId) missingDeckIds.add(deckId);
  S.fcSession.degraded = {
    reason: 'deck-deleted',
    degradedAt: Date.now(),
    missingDeckIds: [...missingDeckIds],
    missingDeckNames: [
      ...new Set([...(prev.missingDeckNames || []), deckName].filter(Boolean))
    ],
  };
}

function clampToLastValidIndex(idx, length) {
  const safeIdx = Number.isFinite(idx) ? idx : 0;
  return Math.max(0, Math.min(safeIdx, Math.max(0, length - 1)));
}

function fcSaveSessionProgress() {
  try {
    // For interleaved sessions each queue entry carries {id, _deckId} so that
    // cards from different decks with the same id can be distinguished on resume.
    const queueIds = _fcInterleaveMode
      ? _fcStudyQueue.map(c => ({ id: c.id, _deckId: c._deckId }))
      : _fcStudyQueue.map(c => c.id);
    const degraded = S.fcSession && S.fcSession.degraded ? fcCloneSession(S.fcSession.degraded) : null;
    S.fcSession = {
      deckId:      _fcCurrentDeckId,
      subdeck:     _fcCurrentSubdeck,
      interleaved: _fcInterleaveMode,
      date:        todayLocalKey(),
      queueIds,
      idx:         _fcStudyIdx,
      stats:       { ..._fcSessionStats },
      againCounts: { ..._fcSessionAgainCounts },
      degraded,
    };
    save();
  } catch(e) {}
}

function fcLoadSavedSession(deckId, subdeckName) {
  try {
    const sess = S.fcSession;
    if (!sess || sess.status === 'cleared') return null;
    if (
      sess.deckId === deckId &&
      (sess.subdeck || null) === (subdeckName || null) &&
      sess.date === todayLocalKey() &&
      Number.isFinite(sess.idx) &&
      sess.idx > 0 &&
      Array.isArray(sess.queueIds) &&
      sess.queueIds.length > 0
    ) return sess;
  } catch(e) {}
  return null;
}

function fcLoadSavedInterleavedSession() {
  try {
    const sess = S.fcSession;
    if (!sess || sess.status === 'cleared') return null;
    if (
      sess.interleaved === true &&
      sess.deckId === null &&
      sess.date === todayLocalKey() &&
      Number.isFinite(sess.idx) &&
      sess.idx > 0 &&
      Array.isArray(sess.queueIds) &&
      sess.queueIds.length > 0
    ) return sess;
  } catch(e) {}
  return null;
}

// ─── PANEL NAVIGATION ─────────────────────────────────────
function fcShowPanel(name) {
  $('fc-decks-panel').classList.toggle('fc-hidden', name !== 'decks');
  $('fc-manage-panel').classList.toggle('fc-hidden', name !== 'manage');
  $('fc-study-panel').classList.toggle('fc-hidden', name !== 'study');
}

// ─── DECK LIST ────────────────────────────────────────────
function renderFlashcards() {
  fcShowPanel('decks');
  renderFCDecks();
}

/**
 * Returns the number of due cards for a specific subdeck (or all cards when
 * subdeckName is falsy).  Uses a temporary deck-like object so that the full
 * SRS.dueCount logic (exam mode, daily target) is honoured.
 */
function subdeckDueCount(deck, subdeckName) {
  const cards = subdeckName
    ? deck.cards.filter(c => c.subdeck === subdeckName)
    : deck.cards;
  return SRS.dueCount({ ...deck, cards });
}

function renderFCDecks() {
  const filterSubject = $('fc-subject-filter') ? $('fc-subject-filter').value : '';
  let decks = S.flashcardDecks || [];
  updateRestoreSessionBtn();

  // Header summary
  let totalDue = 0;
  (S.flashcardDecks || []).forEach(d => { totalDue += SRS.dueCount(d); });
  const allDecks = S.flashcardDecks || [];

  if (filterSubject) decks = decks.filter(d => d.subject === filterSubject);
  const infoEl = $('fc-today-info');
  if (infoEl) {
    infoEl.innerHTML =
      `<span class="fc-today-n">${totalDue}</span> card${totalDue !== 1 ? 's' : ''} due today` +
      ` across <span class="fc-today-n">${allDecks.length}</span> deck${allDecks.length !== 1 ? 's' : ''}`;
  }

  const list = $('fc-deck-list');
  if (!decks.length) {
    list.innerHTML = `
      <div class="fc-empty">
        <div class="fc-empty-icon">🃏</div>
        <div class="fc-empty-msg">${filterSubject ? 'No decks match this subject filter.' : 'No decks yet — create your first deck and start spaced repetition.'}</div>
      </div>`;
    return;
  }

  list.innerHTML = decks.map(deck => {
    const due   = SRS.dueCount(deck);
    const total = deck.cards.length;
    const learned = deck.cards.filter(c => (c.reps || 0) > 0).length;
    const pct   = total ? Math.round((learned / total) * 100) : 0;
    const subj  = deck.subject ? GCSE_SUBJECTS[deck.subject] : null;
    const color = subj ? subj.color : 'var(--accent)';
    const daysToExam = deck.examDate
      ? Math.max(0, Math.ceil((parseLocalDate(deck.examDate) - parseLocalDate(todayLocalKey())) / 86400000))
      : null;
    const examSt = deck.examMode && deck.examDate ? SRS.examStats(deck) : null;
    const hasSubdecks = Array.isArray(deck.subdecks) && deck.subdecks.length > 0;

    // Build inline subdeck grid (shown below progress bar when deck has multiple subdecks)
    const subdeckSectionHtml = hasSubdecks ? `
      <div class="fc-subdeck-section">
        <button class="fc-sdt-toggle" data-id="${deck.id}">
          <span>${deck.subdecks.length} part${deck.subdecks.length !== 1 ? 's' : ''}</span>
          <span class="fc-sdt-arrow">▾</span>
        </button>
        <div class="fc-sd-grid fc-hidden">
          <button class="fc-sd-tile" data-id="${deck.id}" data-subdeck="">
            <span class="fc-sd-tile-name">All sections</span>
            ${due > 0 ? `<span class="fc-sd-tile-badge">${due} due</span>` : `<span class="fc-sd-tile-ok">✓ up to date</span>`}
          </button>
          ${deck.subdecks.map(sd => {
            const sdDue = subdeckDueCount(deck, sd);
            return `<button class="fc-sd-tile${sdDue === 0 ? ' fc-sd-tile-done' : ''}"
              data-id="${deck.id}" data-subdeck="${escFc(sd)}"
              ${sdDue === 0 ? 'disabled' : ''}>
              <span class="fc-sd-tile-name">${escFc(sd)}</span>
              ${sdDue > 0 ? `<span class="fc-sd-tile-badge">${sdDue} due</span>` : `<span class="fc-sd-tile-ok">✓</span>`}
            </button>`;
          }).join('')}
        </div>
      </div>` : '';

    return `
    <div class="fc-deck-card" style="border-left-color:${color}">
      <div class="fc-deck-head">
        <div>
          <div class="fc-deck-name">${escFc(deck.name)}</div>
          <div class="fc-deck-meta">
            <span class="fc-dm-stat">${total} card${total !== 1 ? 's' : ''}</span>
            ${hasSubdecks ? `<span class="fc-dm-stat">${deck.subdecks.length} part${deck.subdecks.length !== 1 ? 's' : ''}</span>` : ''}
            ${due > 0
              ? `<span class="fc-dm-due">${due} due</span>`
              : `<span class="fc-dm-ok">✓ up to date</span>`}
            ${deck.lastStudiedDate === todayLocalKey()
              ? `<span class="fc-dm-done-today">✓ Done Today</span>`
              : ''}
            ${(deck.streak || 0) > 0
              ? `<span class="fc-dm-streak">🔥 ${deck.streak}d streak</span>`
              : ''}
            <span class="fc-dm-target">🎯 ${deck.dailyTarget || 20}/day</span>
            ${daysToExam !== null
              ? `<span class="fc-dm-exam">${deck.examMode ? '📅 ' : ''}${daysToExam}d to exam</span>`
              : ''}
            ${examSt
              ? `<span class="fc-dm-req${examSt.behindSchedule ? ' fc-dm-warn' : ''}">${examSt.behindSchedule ? '⚠ ' : ''}${examSt.requiredPerDay}/day needed</span>`
              : ''}
          </div>
        </div>
        <div class="fc-deck-actions">
          <button class="btn-primary fc-ds-btn" data-id="${deck.id}"
            ${due === 0 ? 'disabled title="No cards due"' : ''}>
            ${due > 0 ? `▶ Study (${due})` : '✓ Done'}
          </button>
          <button class="fb fc-dm-btn" data-id="${deck.id}" title="Manage cards">⚙ Manage</button>
          <button class="ti-del fc-dd-btn" data-id="${deck.id}" title="Delete deck">✕</button>
        </div>
      </div>
      <div class="fc-deck-bar">
        <div class="fc-deck-bar-fill" style="width:${pct}%;background:${color}"></div>
      </div>
      <div class="fc-deck-bar-lbl">
        <span>${pct}% learned</span>
        <span>${learned} / ${total}</span>
      </div>
      ${subdeckSectionHtml}
    </div>`;
  }).join('');

  list.querySelectorAll('.fc-ds-btn').forEach(btn => {
    btn.addEventListener('click', () => startStudySession(btn.dataset.id));
  });
  list.querySelectorAll('.fc-sdt-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const section = btn.closest('.fc-subdeck-section');
      const grid = section ? section.querySelector('.fc-sd-grid') : null;
      if (grid) {
        grid.classList.toggle('fc-hidden');
        btn.classList.toggle('fc-sdt-open', !grid.classList.contains('fc-hidden'));
      }
    });
  });
  list.querySelectorAll('.fc-sd-tile').forEach(btn => {
    btn.addEventListener('click', () => {
      startStudySession(btn.dataset.id, btn.dataset.subdeck || null);
    });
  });
  list.querySelectorAll('.fc-dm-btn').forEach(btn =>
    btn.addEventListener('click', () => openDeckManage(btn.dataset.id)));
  list.querySelectorAll('.fc-dd-btn').forEach(btn =>
    btn.addEventListener('click', () => deleteDeck(btn.dataset.id)));
}

let _fcPendingDeleteDeckId = null;

function openDeleteDeckModal(deck) {
  const modal = $('fc-delete-deck-modal');
  if (!modal || !deck) return;
  _fcPendingDeleteDeckId = deck.id;
  const nameEl = $('fc-delete-deck-name');
  if (nameEl) nameEl.textContent = deck.name;
  modal.classList.add('open');
}

function closeDeleteDeckModal() {
  const modal = $('fc-delete-deck-modal');
  if (modal) modal.classList.remove('open');
  _fcPendingDeleteDeckId = null;
}

function performDeleteDeck(id, { keepSession = false, discardSession = false } = {}) {
  const deck = (S.flashcardDecks || []).find(d => d.id === id);
  if (!deck) return;
  if (discardSession) {
    fcDiscardSession('deck-deleted', { skipSave: true });
  } else if (keepSession) {
    markSessionDeckDeleted(deck.id, deck.name);
  }
  S.flashcardDecks = (S.flashcardDecks || []).filter(d => d.id !== id);
  MediaDB.delete(id).catch(e => console.warn('[media IDB delete]', e));
  save({ immediate: true });
  renderFCDecks();
  toast(keepSession ? 'Deck deleted — session preserved' : 'Deck deleted');
}

function deleteDeck(id) {
  const deck = (S.flashcardDecks || []).find(d => d.id === id);
  if (!deck) return;
  if (fcSessionReferencesDeck(id)) {
    openDeleteDeckModal(deck);
    return;
  }
  if (!confirm('Delete this deck and all its cards?')) return;
  performDeleteDeck(id);
}

// ─── NEW DECK MODAL ───────────────────────────────────────
function openNewDeckModal() {
  $('fc-nd-name').value = '';
  $('fc-nd-subject').value = '';
  $('fc-nd-exam').value = '';
  $('fc-nd-target').value = '20';
  $('fc-nd-exam-mode').checked = false;
  $('fc-new-deck-modal').classList.add('open');
  $('fc-nd-name').focus();
}
function closeNewDeckModal() {
  $('fc-new-deck-modal').classList.remove('open');
}
function saveNewDeck() {
  const name = $('fc-nd-name').value.trim();
  if (!name) { toast('Enter a deck name', 'err'); return; }
  const deck = {
    id: uid(),
    name,
    subject:         $('fc-nd-subject').value,
    examDate:        $('fc-nd-exam').value,
    dailyTarget:     Math.max(1, parseInt($('fc-nd-target').value) || 20),
    examMode:        $('fc-nd-exam-mode').checked,
    cards:           [],
    streak:          0,
    lastStudiedDate: null,
  };
  if (!S.flashcardDecks) S.flashcardDecks = [];
  S.flashcardDecks.push(deck);
  save();
  closeNewDeckModal();
  renderFCDecks();
  toast(`Deck "${name}" created ✓`);
}

// ─── DECK MANAGEMENT ──────────────────────────────────────
function saveDeckSettings() {
  const deck = fcCurrentDeck();
  if (!deck) return;
  deck.dailyTarget = Math.min(200, Math.max(1, parseInt($('fc-settings-target').value) || 20));
  deck.examMode    = $('fc-settings-exam-mode').checked;
  save();
  openDeckManage(_fcCurrentDeckId);
  toast('Settings saved ✓');
}

function openDeckManage(id) {
  _fcCurrentDeckId = id;
  const deck = fcCurrentDeck();
  if (!deck) return;

  $('fc-manage-title').textContent = deck.name;
  const subj = deck.subject ? GCSE_SUBJECTS[deck.subject] : null;
  const color = subj ? subj.color : 'var(--accent)';
  $('fc-manage-title').style.color = color;

  const lbl = deck.examDate
    ? (() => {
        const examD  = parseLocalDate(deck.examDate);
        const todayD = parseLocalDate(todayLocalKey());
        const days   = Math.max(0, Math.ceil((examD - todayD) / 86400000));
        let s = `Exam: ${deck.examDate} · ${days}d away`;
        if (deck.examMode) {
          const stats = SRS.examStats(deck);
          if (stats) {
            s += ` · ${stats.requiredPerDay}/day needed`;
            if (stats.behindSchedule) s += ' ⚠';
          }
        }
        return s;
      })()
    : '';
  $('fc-manage-exam-lbl').textContent = lbl;

  $('fc-bulk-input').value = '';
  $('fc-card-front').value = '';
  $('fc-card-back').value  = '';

  // Populate deck settings fields
  $('fc-settings-target').value    = deck.dailyTarget || 20;
  $('fc-settings-exam-mode').checked = deck.examMode || false;

  renderFCCardsList();
  fcShowPanel('manage');
}

function renderFCCardsList() {
  const deck = fcCurrentDeck();
  if (!deck) return;
  const el = $('fc-cards-list');
  if (!deck.cards.length) {
    el.innerHTML = '<div class="empty-s" style="padding:20px 0">No cards yet. Add some above ↑</div>';
    return;
  }

  el.innerHTML = `
    <div class="fc-cards-hdr">
      <span>${deck.cards.length} card${deck.cards.length !== 1 ? 's' : ''}</span>
      <span class="fc-dm-due">${SRS.dueCount(deck)} due today</span>
    </div>
    ${deck.cards.map(c => `
    <div class="fc-card-row">
      <div class="fc-cr-body">
        <div class="fc-cr-front">${cardTextPreview(c.front)}</div>
        <div class="fc-cr-back">${cardTextPreview(c.back)}</div>
      </div>
      <div class="fc-cr-meta">
        <span title="Interval">${c.interval || 0}d</span>
        ${SRS.isDue(c) ? '<span class="fc-dm-due">DUE</span>' : ''}
        ${(c.lapses || 0) > 0 ? `<span class="fc-cr-lapse">⚠ ${c.lapses}</span>` : ''}
      </div>
      <button class="ti-del fc-cr-del" data-id="${c.id}" title="Delete card">✕</button>
    </div>`).join('')}`;

  el.querySelectorAll('.fc-cr-del').forEach(btn =>
    btn.addEventListener('click', () => deleteCard(btn.dataset.id)));
}

function deleteCard(cardId) {
  const deck = fcCurrentDeck();
  if (!deck) return;
  deck.cards = deck.cards.filter(c => c.id !== cardId);
  save();
  renderFCCardsList();
}

function addSingleCard() {
  const front = $('fc-card-front').value.trim();
  const back  = $('fc-card-back').value.trim();
  if (!front || !back) { toast('Fill in both question and answer', 'err'); return; }
  const deck = fcCurrentDeck();
  if (!deck) return;
  deck.cards.push(makeFlashcard(front, back));
  save();
  $('fc-card-front').value = '';
  $('fc-card-back').value  = '';
  $('fc-card-front').focus();
  renderFCCardsList();
  toast('Card added ✓');
}

function addBulkCards() {
  const raw = $('fc-bulk-input').value.trim();
  if (!raw) { toast('Paste some Q == A pairs first', 'err'); return; }
  const deck = fcCurrentDeck();
  if (!deck) return;

  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
  let added = 0;
  lines.forEach(line => {
    // Support both "Q == A" and "Q==A"
    const sepIdx = line.indexOf('==');
    if (sepIdx !== -1) {
      const front = line.slice(0, sepIdx).replace(/\s+$/, '');
      const back  = line.slice(sepIdx + 2).replace(/^\s+/, '');
      if (front && back) { deck.cards.push(makeFlashcard(front, back)); added++; }
    }
  });

  if (!added) { toast('No valid Q == A pairs found. Use "question == answer" format.', 'err'); return; }
  save();
  $('fc-bulk-input').value = '';
  renderFCCardsList();
  toast(`${added} card${added !== 1 ? 's' : ''} added ✓`);
}

function makeFlashcard(front, back) {
  return {
    id: uid(),
    front,
    back,
    interval:   1,
    reps:       0,
    ef:         2.5,
    lapses:     0,
    nextReview: todayKey(),
    created:    todayKey(),
  };
}

// ─── STUDY SESSION ────────────────────────────────────────
function _fcStartFresh(deck, due, options = {}) {
  let queue;
  if (deck.examMode && deck.examDate) {
    queue = [...due]; // preserve priority order for exam mode
  } else {
    // If cards span multiple subdecks, interleave by subdeck so consecutive
    // cards come from different topics — prevents context-clue exploitation.
    const subdeckSet = new Set(due.map(c => c.subdeck || ''));
    queue = subdeckSet.size > 1
      ? _interleaveByKey(due, c => c.subdeck || '')
      : [...due].sort(() => Math.random() - 0.5);
  }
  _fcStudyQueue         = queue;
  _fcStudyIdx           = 0;
  _fcFlipped            = false;
  _fcSessionStats       = { again: 0, hard: 0, good: 0, easy: 0 };
  _fcSessionAgainCounts = {};
  _fcDeckLookup = null;
  if (options.clearSession !== false) {
    fcClearSavedSession('start-fresh');
  }
}

async function startStudySession(deckId, subdeckName) {
  _fcInterleaveMode = false;
  _fcDeckLookup = null;
  _fcCurrentDeckId  = deckId;
  _fcCurrentSubdeck = subdeckName || null;
  const deck = fcCurrentDeck();
  if (!deck) return;

  // If the deck has no media (e.g. the initial IDB restore at startup missed it,
  // or the user is studying a deck imported in a previous session where the IDB
  // write was not yet committed), try a targeted reload from IndexedDB now.
  if (!deck.media) {
    try {
      const allMedia = await MediaDB.loadAll();
      const media = allMedia[deckId];
      if (media && Object.keys(media).length) {
        deck.media = media; // mutate the live deck reference in S.flashcardDecks
      }
    } catch (e) {
      console.warn('[media IDB lazy restore]', e);
    }
  }

  // When studying a specific subdeck, restrict the card pool to that subdeck.
  const deckForStudy = _fcCurrentSubdeck
    ? { ...deck, cards: deck.cards.filter(c => c.subdeck === _fcCurrentSubdeck) }
    : deck;

  const due = SRS.dueToday(deckForStudy);
  if (!due.length) { toast('No cards due — well done!'); return; }

  // Display name: show subdeck context when studying a specific part
  const displayName = _fcCurrentSubdeck
    ? `${deck.name} → ${_fcCurrentSubdeck}`
    : deck.name;

  // Check for saved mid-session progress (matched by both deck id and subdeck)
  let skipClearForMissing = false;
  const savedSess = fcLoadSavedSession(deckId, _fcCurrentSubdeck);
  if (savedSess) {
    const cardMap = Object.fromEntries(deckForStudy.cards.map(c => [c.id, c]));
    const rebuiltQueue = savedSess.queueIds.map(id => cardMap[id]).filter(Boolean);
    const totalQueued  = Array.isArray(savedSess.queueIds) ? savedSess.queueIds.length : 0;
    const missingCardCount = Math.max(0, totalQueued - rebuiltQueue.length);
    const rawIdx      = Number.isFinite(savedSess.idx) ? savedSess.idx : 0;
    const progressIdx = Math.min(Math.max(0, rawIdx), rebuiltQueue.length);
    const resumeIdx   = clampToLastValidIndex(rawIdx, rebuiltQueue.length);
    const remaining   = Math.max(0, rebuiltQueue.length - progressIdx);
    if (remaining > 0) {
      $('fc-study-deck-name').textContent = displayName;
      $('fc-card-wrap').classList.add('fc-hidden');
      $('fc-session-complete').classList.add('fc-hidden');
      $('fc-resume-sub').textContent =
        `You reviewed ${progressIdx} of ${rebuiltQueue.length} card${rebuiltQueue.length !== 1 ? 's' : ''} — ${remaining} left to go.` +
        (missingCardCount ? ' Some cards were missing (deck deleted).' : '');
      $('fc-resume-prompt').classList.remove('fc-hidden');
      $('fc-back-to-manage').textContent = '← DECK';
      fcShowPanel('study');

      const onResume = () => {
        cleanup();
        _fcStudyQueue         = rebuiltQueue;
        _fcStudyIdx           = resumeIdx;
        _fcFlipped            = false;
        _fcSessionStats       = { ...(savedSess.stats || { again: 0, hard: 0, good: 0, easy: 0 }) };
        _fcSessionAgainCounts = { ...(savedSess.againCounts || {}) };
        $('fc-resume-prompt').classList.add('fc-hidden');
        $('fc-card-wrap').classList.remove('fc-hidden');
        if (missingCardCount) {
          toast(`Some cards missing (deck deleted). Resumed with ${remaining} remaining.`, 'info');
        }
        renderStudyCard();
      };
      const onFresh = () => {
        cleanup();
        $('fc-resume-prompt').classList.add('fc-hidden');
        _fcStartFresh(deckForStudy, due);
        $('fc-card-wrap').classList.remove('fc-hidden');
        renderStudyCard();
      };
      const cleanup = () => {
        $('fc-resume-yes').removeEventListener('click', onResume);
        $('fc-resume-no').removeEventListener('click', onFresh);
      };
      $('fc-resume-yes').addEventListener('click', onResume);
      $('fc-resume-no').addEventListener('click', onFresh);
      return;
    }
    if (missingCardCount) {
      toast('Some cards missing from your previous session. Starting fresh.', 'info');
      skipClearForMissing = true;
    } else {
      fcClearSavedSession('resume-empty');
    }
  }

  // Fresh start
  _fcInterleaveMode = false;
  _fcStartFresh(deckForStudy, due, { clearSession: !skipClearForMissing });
  $('fc-study-deck-name').textContent = displayName;
  $('fc-back-to-manage').textContent  = '← DECK';
  $('fc-session-complete').classList.add('fc-hidden');
  $('fc-resume-prompt').classList.add('fc-hidden');
  $('fc-card-wrap').classList.remove('fc-hidden');
  fcShowPanel('study');
  renderStudyCard();
}

// ─── INTERLEAVED CROSS-DECK SESSION ──────────────────────
// Collects due cards from every deck, shuffles within each deck, then
// interleaves them round-robin so consecutive cards come from different decks.
async function startInterleavedSession() {
  const allDecks = S.flashcardDecks || [];
  if (!allDecks.length) { toast('No decks yet — create one first!', 'err'); return; }
  _fcDeckLookup = new Map(allDecks.map(d => [d.id, d]));

  // Load all media in a single IDB pass so card images render correctly
  try {
    const allMedia = await MediaDB.loadAll();
    for (const deck of allDecks) {
      if (!deck.media) {
        const media = allMedia[deck.id];
        if (media && Object.keys(media).length) deck.media = media;
      }
    }
  } catch (e) { console.warn('[interleave media IDB]', e); }

  // Check for a saved interleaved session from today and offer to resume it
  let skipClearForMissing = false;
  const savedSess = fcLoadSavedInterleavedSession();
  if (savedSess) {
    // Rebuild the queue from saved {id, _deckId} pairs, looking up each card in
    // its origin deck so we have the latest SRS data.
    // Build a composite key map for O(1) lookups instead of O(n*m) nested finds.
    const cardByKey = {};
    for (const deck of allDecks) {
      for (const card of deck.cards) {
        cardByKey[`${deck.id}:${card.id}`] = { ...card, _deckId: deck.id, _deckName: deck.name };
      }
    }
    const rebuiltQueue = savedSess.queueIds
      .map(entry => cardByKey[`${entry._deckId}:${entry.id}`] || null)
      .filter(Boolean);
    const totalQueued  = Array.isArray(savedSess.queueIds) ? savedSess.queueIds.length : 0;
    const missingCardCount = Math.max(0, totalQueued - rebuiltQueue.length);
    const rawIdx      = Number.isFinite(savedSess.idx) ? savedSess.idx : 0;
    const progressIdx = Math.min(Math.max(0, rawIdx), rebuiltQueue.length);
    const resumeIdx   = clampToLastValidIndex(rawIdx, rebuiltQueue.length);
    const remaining   = Math.max(0, rebuiltQueue.length - progressIdx);
    if (remaining > 0) {
      _fcInterleaveMode = true;
      _fcCurrentDeckId  = null;
      _fcCurrentSubdeck = null;
      $('fc-study-deck-name').textContent = '⇌ Interleaved Study';
      $('fc-back-to-manage').textContent  = '← DECKS';
      $('fc-card-wrap').classList.add('fc-hidden');
      $('fc-session-complete').classList.add('fc-hidden');
      $('fc-resume-sub').textContent =
        `You reviewed ${progressIdx} of ${rebuiltQueue.length} card${rebuiltQueue.length !== 1 ? 's' : ''} — ${remaining} left to go.` +
        (missingCardCount ? ' Some cards were missing (deck deleted).' : '');
      $('fc-resume-prompt').classList.remove('fc-hidden');
      fcShowPanel('study');

      const cleanup = () => {
        $('fc-resume-yes').removeEventListener('click', onResume);
        $('fc-resume-no').removeEventListener('click', onFresh);
      };
      const onResume = () => {
        cleanup();
        _fcStudyQueue         = rebuiltQueue;
        _fcStudyIdx           = resumeIdx;
        _fcFlipped            = false;
        _fcSessionStats       = { ...(savedSess.stats || { again: 0, hard: 0, good: 0, easy: 0 }) };
        _fcSessionAgainCounts = { ...(savedSess.againCounts || {}) };
        $('fc-resume-prompt').classList.add('fc-hidden');
        $('fc-card-wrap').classList.remove('fc-hidden');
        if (missingCardCount) {
          toast(`Some cards missing (deck deleted). Resumed with ${remaining} remaining.`, 'info');
        }
        renderStudyCard();
      };
      const onFresh = () => {
        cleanup();
        $('fc-resume-prompt').classList.add('fc-hidden');
        fcClearSavedSession('start-fresh');
        _launchFreshInterleavedSession(allDecks);
      };
      $('fc-resume-yes').addEventListener('click', onResume);
      $('fc-resume-no').addEventListener('click', onFresh);
      return;
    }
    if (missingCardCount) {
      toast('Some cards missing from your previous session. Starting fresh.', 'info');
      skipClearForMissing = true;
    } else {
      fcClearSavedSession('resume-empty');
    }
  }

  if (!skipClearForMissing) {
    fcClearSavedSession('start-fresh');
  }
  _launchFreshInterleavedSession(allDecks);
}

// Builds and starts a brand-new interleaved queue from all due cards.
function _launchFreshInterleavedSession(allDecks) {
  // Gather due cards from every deck, tagging each with its source deck info
  const grouped   = {};
  const deckOrder = [];
  for (const deck of allDecks) {
    const due = SRS.dueToday(deck);
    if (!due.length) continue;
    grouped[deck.id] = due.map(c => ({ ...c, _deckId: deck.id, _deckName: deck.name }));
    deckOrder.push(deck.id);
  }

  if (!deckOrder.length) { toast("No cards due across any deck — you're all caught up! 🎉"); return; }

  // Shuffle within each deck, then interleave across decks round-robin
  for (const id of deckOrder) grouped[id].sort(() => Math.random() - 0.5);

  const queue = [];
  let active = [...deckOrder];
  while (active.length > 0) {
    const nextActive = [];
    for (const id of active) {
      if (grouped[id].length > 0) {
        queue.push(grouped[id].shift());
        if (grouped[id].length > 0) nextActive.push(id);
      }
    }
    active = nextActive;
  }

  _fcInterleaveMode     = true;
  _fcDeckLookup         = new Map(allDecks.map(d => [d.id, d]));
  _fcCurrentDeckId      = null;
  _fcCurrentSubdeck     = null;
  _fcStudyQueue         = queue;
  _fcStudyIdx           = 0;
  _fcFlipped            = false;
  _fcSessionStats       = { again: 0, hard: 0, good: 0, easy: 0 };
  _fcSessionAgainCounts = {};

  $('fc-study-deck-name').textContent = '⇌ Interleaved Study';
  $('fc-back-to-manage').textContent  = '← DECKS';
  $('fc-session-complete').classList.add('fc-hidden');
  $('fc-resume-prompt').classList.add('fc-hidden');
  $('fc-card-wrap').classList.remove('fc-hidden');
  fcShowPanel('study');
  renderStudyCard();
}

function renderStudyCard() {
  if (_fcStudyIdx >= _fcStudyQueue.length) {
    showSessionComplete();
    return;
  }

  const card = _fcStudyQueue[_fcStudyIdx];
  const wasFlipped = _fcFlipped;
  _fcFlipped  = false;

  const done  = _fcStudyIdx;
  const total = _fcStudyQueue.length;
  $('fc-progress-fill').style.width  = (total ? (done / total) * 100 : 0) + '%';
  $('fc-progress-text').textContent  = `${done} / ${total}`;

  // In interleave mode show which deck the current card belongs to
  const deck = _fcDeckForCard(card);
  if (_fcInterleaveMode) {
    $('fc-study-deck-name').textContent = `⇌ ${card._deckName || 'Interleaved'}`;
  }
  setCardContent($('fc-front-text'), card.front, deck);
  setCardContent($('fc-front-text-back'), card.front, deck);

  $('fc-card-inner').classList.remove('fc-flipped');
  $('fc-flip-btn').classList.remove('fc-hidden');
  $('fc-grade-btns').classList.add('fc-hidden');
  fcPrepareAiTutor(card, deck);

  if (wasFlipped) {
    // The card was showing the answer side.  Delay updating the back-face
    // text until the flip animation completes (~450 ms) so the new card's
    // answer is not briefly visible while the card rotates back to front.
    setTimeout(() => {
      setCardContent($('fc-back-text'), card.back, deck);
      updateGradeHints(card);
    }, FC_FLIP_DURATION_MS);
  } else {
    // Card was not flipped — safe to update immediately.
    setCardContent($('fc-back-text'), card.back, deck);
    updateGradeHints(card);
  }
}

  function updateGradeHints(card) {
    const deck = _fcDeckForCard(card);
    [0, 1, 2, 3].forEach(g => {
      const btn  = _fcGradeBtnsByGrade ? _fcGradeBtnsByGrade[g] : document.querySelector(`.fc-grade[data-grade="${g}"]`);
      if (!btn) return;
      const sim  = SRS.gradeExamAware({ ...card }, g, deck);
      const span = btn.querySelector('.fc-grade-interval');
      if (span) {
        if (sim.interval === 0) span.textContent = 'now';
        else if (sim.interval === 1) span.textContent = '1 day';
        else span.textContent = `${sim.interval}d`;
      }
    });
  }

function flipCard() {
  _fcFlipped = true;
  $('fc-card-inner').classList.add('fc-flipped');
  $('fc-flip-btn').classList.add('fc-hidden');
  $('fc-grade-btns').classList.remove('fc-hidden');
}

function gradeCard(g) {
  const card = _fcStudyQueue[_fcStudyIdx];
  if (!card) return;
  const deck = _fcDeckForCard(card);
  if (!deck) return;

  const updated = SRS.gradeExamAware({ ...card }, g, deck);
  const idx = deck.cards.findIndex(c => c.id === card.id);
  if (idx !== -1) deck.cards[idx] = updated;

  const labels = ['again', 'hard', 'good', 'easy'];
  _fcSessionStats[labels[g]]++;

  // XP: Again=0, Hard=1, Good=2, Easy=3
  if (g > 0) addXP(g);

  // On "Again", re-insert the card near the end of the queue.
  // Cap per-card re-queues (not total queue length) to avoid runaway.
  // Preserve interleave-mode deck tags on the re-queued card copy.
  if (g === 0) {
    const timesRequeued = _fcSessionAgainCounts[card.id] || 0;
    if (timesRequeued < 5) {
      const insertAt = Math.min(_fcStudyIdx + 3, _fcStudyQueue.length);
      const requeued = { ...updated };
      if (_fcInterleaveMode) { requeued._deckId = card._deckId; requeued._deckName = card._deckName; }
      _fcStudyQueue.splice(insertAt, 0, requeued);
      _fcSessionAgainCounts[card.id] = timesRequeued + 1;
    }
  }

  save();
  _fcStudyIdx++;
  fcSaveSessionProgress();
  renderStudyCard();
}

function showSessionComplete() {
  fcClearSavedSession('completed');
  if (_fcAiTutorAbort) {
    try { _fcAiTutorAbort.abort(); } catch(e) {}
    _fcAiTutorAbort = null;
  }
  // Update streak for the current deck
  const deck = fcCurrentDeck();
  if (deck) {
    const today = todayLocalKey();
    const yest = new Date();
    yest.setDate(yest.getDate() - 1);
    const yesterday = dateToKey(yest);
    if (deck.lastStudiedDate === today) {
      // Already counted today — no change
    } else if (deck.lastStudiedDate === yesterday) {
      deck.streak = (deck.streak || 0) + 1;
      deck.lastStudiedDate = today;
    } else {
      deck.streak = 1;
      deck.lastStudiedDate = today;
    }
    save();
  }

  $('fc-card-wrap').classList.add('fc-hidden');
  fcSetAiOutput('');
  fcSetAiStatus('Need help? Ask AI Tutor for a beginner-friendly explanation.');
  const { again, hard, good, easy } = _fcSessionStats;
  const total = again + hard + good + easy;
  const pass  = hard + good + easy;
  const rate  = total ? Math.round((pass / total) * 100) : 0;

  $('fc-session-complete').classList.remove('fc-hidden');
  const streakHTML = deck && (deck.streak || 0) > 0
    ? `<div class="fc-done-streak">🔥 ${deck.streak}-day streak${deck.streak > 1 ? '!' : ''}</div>`
    : '';
  $('fc-session-complete').innerHTML = `
    <div class="fc-done-icon">🎉</div>
    <div class="fc-done-title">Session Complete!</div>
    <div class="fc-done-subtitle">${rate}% retention rate</div>
    ${streakHTML}
    <div class="fc-done-stats">
      <div class="fc-ds"><span class="fc-ds-n">${total}</span><span class="fc-ds-l">reviewed</span></div>
      <div class="fc-ds fc-again-c"><span class="fc-ds-n">${again}</span><span class="fc-ds-l">again</span></div>
      <div class="fc-ds fc-hard-c"><span class="fc-ds-n">${hard}</span><span class="fc-ds-l">hard</span></div>
      <div class="fc-ds fc-good-c"><span class="fc-ds-n">${good}</span><span class="fc-ds-l">good</span></div>
      <div class="fc-ds fc-easy-c"><span class="fc-ds-n">${easy}</span><span class="fc-ds-l">easy</span></div>
    </div>
    <div class="fc-done-tip">💡 ${ATOMIC_TIPS[Math.floor(Math.random() * ATOMIC_TIPS.length)]}</div>
    <button class="btn-primary" id="fc-done-back-btn">${_fcInterleaveMode ? '← Back to Decks' : '← Back to Deck'}</button>`;

  if (_fcInterleaveMode) {
    $('fc-done-back-btn').addEventListener('click', () => {
      _fcInterleaveMode = false;
      _fcDeckLookup = null;
      fcShowPanel('decks');
      renderFCDecks();
    });
  } else {
    $('fc-done-back-btn').addEventListener('click', () => openDeckManage(_fcCurrentDeckId));
  }
}

// ─── DASHBOARD WIDGET ─────────────────────────────────────
function renderDashFlashcards() {
  const el = $('dash-flashcards');
  if (!el) return;
  const decks = S.flashcardDecks || [];
  let totalDue = 0;
  decks.forEach(d => { totalDue += SRS.dueCount(d); });

  if (!decks.length) {
    el.innerHTML = `<div class="dtp-empty">
      <span class="dtp-msg">No decks —
        <button class="dtp-link" data-view="flashcards">create your first deck →</button>
      </span></div>`;
    el.querySelectorAll('.dtp-link').forEach(btn =>
      btn.addEventListener('click', () => {
        switchView(btn.dataset.view);
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        document.querySelector('[data-view="flashcards"]')?.classList.add('active');
      }));
    return;
  }

  const dueDecks = decks.filter(d => SRS.dueCount(d) > 0);
  el.innerHTML = `
    <div class="dtp-date-row">
      <span class="fc-today-n">${totalDue}</span>
      <span class="dtp-count"> card${totalDue !== 1 ? 's' : ''} due · ${decks.length} deck${decks.length !== 1 ? 's' : ''}</span>
    </div>
    ${dueDecks.slice(0, 3).map(d => {
      const subj  = d.subject ? GCSE_SUBJECTS[d.subject] : null;
      const color = subj ? subj.color : 'var(--accent)';
      return `<div class="dtp-block" style="border-left-color:${color}">
        <span class="dtp-time">${SRS.dueCount(d)} due</span>
        <span class="dtp-task">${escFc(d.name)}</span>
      </div>`;
    }).join('')}
    ${totalDue > 0 ? `<button class="dtp-link" data-view="flashcards" style="margin-top:8px;display:block">Review all →</button>` : ''}`;

  el.querySelectorAll('.dtp-link').forEach(btn =>
    btn.addEventListener('click', () => {
      switchView(btn.dataset.view);
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      document.querySelector('[data-view="flashcards"]')?.classList.add('active');
    }));
}

// ─── HELPERS ─────────────────────────────────────────────
function escFc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Returns a plain-text preview of card content for the card list view.
 * Image markers ({{img:filename}}) are shown as [image] and the result
 * is HTML-escaped, so it is safe to inject into innerHTML.
 */
function cardTextPreview(text) {
  return escFc(String(text || '').replace(/\{\{img:[^}]+\}\}/g, '[image]'));
}

/**
 * Renders card content (possibly containing {{img:filename}} markers) directly
 * into a DOM element, replacing markers with <img> elements sourced from the
 * deck's media map.  Uses only safe DOM APIs — no innerHTML is set on untrusted
 * content, so there is no XSS risk.
 * @param {HTMLElement}  el   Target element (its children are replaced)
 * @param {string}       text Card front or back text
 * @param {object|null}  deck Current deck object (for deck.media map)
 */
function setCardContent(el, text, deck) {
  while (el.firstChild) el.removeChild(el.firstChild);
  const parts = String(text || '').split(/(\{\{img:[^}]+\}\})/);
  parts.forEach(part => {
    const m = part.match(/^\{\{img:(.+)\}\}$/);
    if (m) {
      const filename = m[1];
      const src = deck && deck.media && deck.media[filename];
      if (src) {
        const img = document.createElement('img');
        img.src = src;
        img.alt = filename;
        img.style.cssText = 'max-width:100%;max-height:300px;display:block;margin:4px auto';
        el.appendChild(img);
      } else {
        el.appendChild(document.createTextNode(`[image: ${filename}]`));
      }
    } else {
      // Plain text — preserve newlines
      const lines = part.split('\n');
      lines.forEach((line, i) => {
        if (i > 0) el.appendChild(document.createElement('br'));
        el.appendChild(document.createTextNode(line));
      });
    }
  });
}

/**
 * Returns the image MIME type for a given filename based on its extension,
 * or null if the extension is not a supported image type (e.g. audio/video).
 * @param {string} filename
 * @returns {string|null}
 */
function apkgImageMime(filename) {
  const ext = (String(filename).split('.').pop() || '').toLowerCase();
  const types = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png:  'image/png',
    gif: 'image/gif',  webp: 'image/webp', svg:  'image/svg+xml',
    bmp: 'image/bmp',  ico:  'image/x-icon',
  };
  return types[ext] || null;
}

// ─── ANKI .APKG IMPORT ─────────────────────────────────────

/**
 * Strips Anki HTML markup and decodes HTML entities from a field string.
 * Uses the browser's DOM parser instead of regex to handle all edge cases
 * correctly (avoids incomplete sanitization and double-escaping issues).
 *
 * <img> tags are converted to {{img:filename}} markers so that the card
 * renderer can later replace them with actual <img> elements sourced from
 * the deck's media map.  The markers survive textContent extraction because
 * they contain no HTML characters.
 */
function stripAnkiHtml(str) {
  // Pre-process tags that should become newlines, since textContent ignores them
  const withNewlines = String(str)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<img[^>]*>/gi, imgTag => {
      // Extract src attribute (handles both quoted and unquoted values)
      const m = imgTag.match(/\bsrc=["']?([^"'\s>]+)["']?/i);
      const filename = m ? m[1] : null;
      // {{img:filename}} is plain text — survives the textContent pass below
      return filename ? `{{img:${filename}}}` : '[image]';
    });
  // Let the browser's HTML parser strip all remaining tags and decode entities.
  // {{img:...}} markers contain no HTML so they pass through unchanged.
  const div = document.createElement('div');
  div.innerHTML = withNewlines;
  return (div.textContent || '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Dynamically injects an external script tag once, returning a Promise that
 * resolves when the script has loaded.
 * @param {string} src       Script URL
 * @param {string} [integrity] Optional SRI hash for Subresource Integrity check
 */
function loadScript(src, integrity) {
  return new Promise((resolve, reject) => {
    // Use strict src equality (not CSS selector) to avoid injection issues
    if (Array.from(document.scripts).some(s => s.src === src)) { resolve(); return; }
    const s = document.createElement('script');
    s.src  = src;
    if (integrity) {
      s.integrity   = integrity;
      s.crossOrigin = 'anonymous';
    }
    s.onload  = resolve;
    s.onerror = () => reject(new Error(`Failed to load: ${src}`));
    document.head.appendChild(s);
  });
}

/**
 * Imports an Anki .apkg file and creates flashcard decks from its contents.
 *
 * An .apkg is a ZIP archive containing:
 *   - collection.anki21 or collection.anki2 — a SQLite database
 *   - media                                 — JSON map of key → filename
 *   - 0, 1, 2, …                            — the actual media files
 *
 * Subdeck grouping: when multiple Anki decks share the same root name (e.g.
 * "Spanish::Vocabulary" and "Spanish::Grammar") they are merged into a single
 * HabitForge deck named after the root ("Spanish").  Each card is tagged with
 * its subdeck name via a `subdeck` property so the user can choose which part
 * to study from an in-deck dropdown menu.  A .apkg that contains only one
 * (sub)deck under a given root is stored with its full Anki name — no dropdown
 * is shown and behaviour is identical to the original single-deck import.
 *
 * Images: image files inside the ZIP are extracted and stored as base-64
 * data URLs in a `media` map on the deck object.  Card text retains
 * {{img:filename}} markers which `setCardContent()` replaces with real
 * <img> elements when rendering.
 *
 * Libraries loaded lazily from CDN:
 *   - JSZip  3.10.1  (zip extraction, pure JS)
 *   - sql.js 1.10.2  (WebAssembly SQLite reader)
 */
async function importApkg(file) {
  if (!file) return;

  const JSZIP_CDN   = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
  const JSZIP_SRI   = 'sha384-+mbV2IY1Zk/X1p/nWllGySJSUN8uMs+gUAN10Or95UBH0fpj6GfKgPmgC5EXieXG';
  const SQLJS_CDN   = 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.2/sql-wasm.js';
  const SQLJS_SRI   = 'sha384-/2HxK3kObxd3+ww+DG94zYpLU1yodAI1+vAauuriYyEXkQ+zBvXYvJPL9Ey87/lN';
  const SQLJS_BASE  = 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.2/';

  toast('Importing .apkg — loading libraries…', 'info');

  try {
    // ── Step 1: Read the file as a raw byte array ──────────────────────────
    const arrayBuffer = await file.arrayBuffer();

    // ── Step 2: Load JSZip and unzip the .apkg ─────────────────────────────
    await loadScript(JSZIP_CDN, JSZIP_SRI);
    const zip = await JSZip.loadAsync(arrayBuffer);

    // .apkg may use either the newer .anki21 or the legacy .anki2 filename.
    // Anki 23.10+ can also produce .anki21b (zstd-compressed) — we can't
    // read that format yet so we surface a clear message instead.
    const dbEntry = zip.file('collection.anki21') || zip.file('collection.anki2');
    if (!dbEntry) {
      if (zip.file('collection.anki21b')) {
        toast(
          'This .apkg uses a newer Anki format (anki21b) that is not yet supported. ' +
          'Re-export the deck from Anki using File → Export → "Anki Deck Package (.apkg)" ' +
          'and make sure "Legacy support" is enabled.',
          'err'
        );
      } else {
        toast('Invalid .apkg — no Anki collection found inside', 'err');
      }
      return;
    }

    const dbBytes = await dbEntry.async('uint8array');
    toast('Importing .apkg — reading cards…', 'info');

    // ── Step 3: Extract images from the .apkg ─────────────────────────────
    // The `media` ZIP entry is a JSON object mapping numeric string keys
    // (the actual ZIP entry names) to the real media filenames.
    // Example: {"0": "cat.jpg", "1": "sound.mp3"}
    // We convert each image file to a base-64 data URL and store it by
    // its real filename so card text (which references filenames, not keys)
    // can look it up at render time.
    /** @type {Object.<string, string>} filename → data: URL */
    const mediaMap = {};
    try {
      const mediaEntry = zip.file('media');
      if (mediaEntry) {
        const mediaJson = JSON.parse(await mediaEntry.async('string'));
        await Promise.all(
          Object.entries(mediaJson).map(async ([key, filename]) => {
            try {
              const mime = apkgImageMime(filename);
              if (!mime) return; // skip audio, video, etc.
              const mediaFile = zip.file(key);
              if (!mediaFile) return;
              const bytes = await mediaFile.async('uint8array');
              // Use FileReader to convert to a base64 data URL efficiently
              const dataUrl = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload  = () => resolve(reader.result);
                reader.onerror = () => reject(reader.error);
                reader.readAsDataURL(new Blob([bytes], { type: mime }));
              });
              mediaMap[filename] = dataUrl;
            } catch (imgErr) {
              console.warn(`[apkg media] skipping ${filename}:`, imgErr);
            }
          })
        );
      }
    } catch (err) { console.warn('[apkg media]', err); }

    // ── Step 4: Load sql.js (WebAssembly SQLite) ───────────────────────────
    await loadScript(SQLJS_CDN, SQLJS_SRI);
    const SQL = await window.initSqlJs({
      locateFile: f => SQLJS_BASE + f,
    });

    // ── Step 5: Open the SQLite database ──────────────────────────────────
    const db = new SQL.Database(dbBytes);

    // ── Step 6: Parse all decks, including subdecks ────────────────────────
    // The `col` table's `decks` column is a JSON object where each value has
    // an `id` (numeric) and a `name` (e.g. "Spanish::Vocabulary" for subdecks).
    const fallbackName = file.name.replace(/\.apkg$/i, '');
    /** @type {Object.<string, string>} deckId (string) → deck name */
    const deckIdToName = {};
    try {
      const colRes = db.exec('SELECT decks FROM col LIMIT 1');
      if (colRes.length && colRes[0].values.length) {
        const decksJson = JSON.parse(colRes[0].values[0][0]);
        Object.values(decksJson).forEach(d => {
          if (d.id !== null && d.id !== undefined && d.name && d.name !== 'Default') {
            deckIdToName[String(d.id)] = d.name;
          }
        });
      }
    } catch (err) { console.warn('[apkg decks]', err); }

    // ── Step 7: Read notes with their deck IDs ────────────────────────────
    // Join notes with cards to determine which deck each note belongs to.
    // A note may produce multiple card templates (e.g. Basic + Reversed),
    // all in the same deck; MIN(did) selects one representative deck id.
    const notesRes = db.exec(
      'SELECT n.flds, MIN(c.did) AS did ' +
      'FROM notes n JOIN cards c ON c.nid = n.id ' +
      'GROUP BY n.id'
    );
    db.close();

    if (!notesRes.length || !notesRes[0].values.length) {
      toast('No cards found inside the .apkg file', 'err');
      return;
    }

    // ── Step 8: Parse each note and group cards by deck ───────────────────
    // Fields are separated by \x1f; the first field is always the front.
    // The back (second field) may be empty for cloze notes — still imported.
    const FIELD_SEP = '\x1f';
    /** @type {Map<string, Array>} deckId → flashcard array */
    const deckCards = new Map();

    notesRes[0].values.forEach(row => {
      let rawFlds = row[0];
      const did   = String(row[1] || '');
      if (rawFlds == null) return;
      if (rawFlds instanceof Uint8Array) {
        try {
          rawFlds = new TextDecoder('utf-8', { fatal: true }).decode(rawFlds);
        } catch {
          console.warn('[apkg] flds contained invalid UTF-8; falling back to lossy decode');
          rawFlds = new TextDecoder('utf-8', { fatal: false }).decode(rawFlds);
        }
      }
      const fields = String(rawFlds).split(FIELD_SEP);
      const front  = stripAnkiHtml(fields[0] || '');
      const back   = stripAnkiHtml(fields[1] || '');
      if (!front) return;
      if (!deckCards.has(did)) deckCards.set(did, []);
      deckCards.get(did).push(makeFlashcard(front, back));
    });

    if (!deckCards.size || [...deckCards.values()].every(arr => !arr.length)) {
      toast('No valid Q&A pairs found in the .apkg file', 'err');
      return;
    }

    // ── Step 9: Create HabitForge decks, grouping subdecks under their root deck ──
    // Anki uses '::' to express hierarchy (e.g. "Spanish::Vocabulary").  When an
    // .apkg contains multiple subdecks under the same root we create ONE HabitForge
    // deck named after the root ("Spanish") and tag each card with its subdeck name
    // so the user can later choose which part to study.  Single-level decks (no '::')
    // or .apkg files that contain only one subdeck under a given root are stored with
    // the full Anki name, matching the original behaviour.
    if (!S.flashcardDecks) S.flashcardDecks = [];
    let totalCards = 0;
    let decksAdded = 0;

    /**
     * Builds a usedMedia subset for an array of cards, reading from the global
     * mediaMap extracted from the .apkg archive.
     * @param {Array} cards
     * @returns {Object} filename → data URL
     */
    function buildUsedMedia(cards) {
      const usedMedia = {};
      if (!Object.keys(mediaMap).length) return usedMedia;
      const imgRe = /\{\{img:([^}]+)\}\}/g;
      cards.forEach(card => {
        [card.front, card.back].forEach(text => {
          let m;
          imgRe.lastIndex = 0;
          while ((m = imgRe.exec(text)) !== null) {
            const fn = m[1];
            if (mediaMap[fn]) usedMedia[fn] = mediaMap[fn];
          }
        });
      });
      return usedMedia;
    }

    // ── 9a: Collect per-Anki-deck info (cards + media) ───────────────────────
    /** @type {Array<{fullName:string, cards:Array, media:Object}>} */
    const ankiDecks = [];
    deckCards.forEach((cards, did) => {
      if (!cards.length) return;
      ankiDecks.push({
        fullName: deckIdToName[did] || fallbackName,
        cards,
        media: buildUsedMedia(cards),
      });
    });

    // ── 9b: Group by root name (first segment before '::') ───────────────────
    const ANKI_SEP = '::'; // Anki hierarchy delimiter
    /** @type {Map<string, Array<{subName:string, cards:Array, media:Object}>>} */
    const rootGroups = new Map();
    ankiDecks.forEach(({ fullName, cards, media }) => {
      const colonIdx = fullName.indexOf(ANKI_SEP);
      const rootName = colonIdx === -1 ? fullName : fullName.slice(0, colonIdx);
      const subName  = colonIdx === -1 ? ''        : fullName.slice(colonIdx + ANKI_SEP.length);
      if (!rootGroups.has(rootName)) rootGroups.set(rootName, []);
      rootGroups.get(rootName).push({ subName, cards, media });
    });

    // ── 9c: Create one HabitForge deck per root group ────────────────────────
    // Collect IDB save promises so we can await them all before finishing.
    const idbSavePromises = [];

    rootGroups.forEach((groups, rootName) => {
      if (groups.length === 1 && groups[0].subName === '') {
        // Plain deck — no subdeck hierarchy, store as-is (original behaviour)
        const { cards, media } = groups[0];
        const deckId = uid();
        S.flashcardDecks.push({
          id:              deckId,
          name:            rootName,
          subject:         '',
          examDate:        '',
          dailyTarget:     20,
          examMode:        false,
          cards,
          ...(Object.keys(media).length ? { media } : {}),
          streak:          0,
          lastStudiedDate: null,
        });
        if (Object.keys(media).length) {
          idbSavePromises.push(MediaDB.save(deckId, media));
        }
        totalCards += cards.length;
        decksAdded++;
      } else if (groups.length === 1) {
        // Only one subdeck exported under this root — keep the full Anki name
        // so no information is lost (no dropdown needed for a single part).
        const { subName, cards, media } = groups[0];
        const deckId = uid();
        S.flashcardDecks.push({
          id:              deckId,
          name:            `${rootName}${ANKI_SEP}${subName}`,
          subject:         '',
          examDate:        '',
          dailyTarget:     20,
          examMode:        false,
          cards,
          ...(Object.keys(media).length ? { media } : {}),
          streak:          0,
          lastStudiedDate: null,
        });
        if (Object.keys(media).length) {
          idbSavePromises.push(MediaDB.save(deckId, media));
        }
        totalCards += cards.length;
        decksAdded++;
      } else {
        // Multiple Anki decks share this root → merge into one HabitForge deck.
        // Each card gets a `subdeck` tag (the short name after '::') so the study
        // picker can filter to a specific part.  Cards from a root-level Anki deck
        // (subName === '') receive no tag and always appear in "All".
        const allCards = [];
        const allMedia = {};
        const subdeckNames = [];

        groups.forEach(({ subName, cards, media }) => {
          if (subName) subdeckNames.push(subName);
          cards.forEach(card => {
            allCards.push(subName ? { ...card, subdeck: subName } : card);
          });
          Object.assign(allMedia, media);
        });

        const deckId = uid();
        S.flashcardDecks.push({
          id:              deckId,
          name:            rootName,
          subject:         '',
          examDate:        '',
          dailyTarget:     20,
          examMode:        false,
          cards:           allCards,
          ...(Object.keys(allMedia).length ? { media: allMedia } : {}),
          subdecks:        subdeckNames,
          streak:          0,
          lastStudiedDate: null,
        });
        if (Object.keys(allMedia).length) {
          idbSavePromises.push(MediaDB.save(deckId, allMedia));
        }
        totalCards += allCards.length;
        decksAdded++;
      }
    });

    // Await all IndexedDB saves so that images are persisted before we return.
    // If any save fails, warn the user that images may disappear after reload.
    if (idbSavePromises.length) {
      const idbResults = await Promise.allSettled(idbSavePromises);
      const failures   = idbResults.filter(r => r.status === 'rejected').map(r => r.reason);
      if (failures.length) {
        console.warn('[media IDB] one or more saves failed:', failures);
        toast('⚠️ Images saved for now but may not survive a page reload — try re-importing if they disappear.', 'err');
      }
    }

    save();
    renderFCDecks();

    const deckWord = decksAdded === 1 ? 'deck' : 'decks';
    const cardWord = totalCards !== 1 ? 'cards' : 'card';
    toast(`✓ Imported ${decksAdded} ${deckWord} — ${totalCards} ${cardWord}`);

  } catch (err) {
    console.error('[apkg import]', err);
    toast('Import failed — see browser console for details', 'err');
  }
}

// ─── INIT ─────────────────────────────────────────────────
function initFlashcards() {
  if (!S.flashcardDecks) S.flashcardDecks = [];

  // New deck modal
  $('fc-new-deck-btn').addEventListener('click', openNewDeckModal);
  $('fc-nd-cancel').addEventListener('click', closeNewDeckModal);
  document.getElementById('fc-nd-cancel-2').addEventListener('click', closeNewDeckModal);
  $('fc-nd-save').addEventListener('click', saveNewDeck);
  $('fc-new-deck-modal').addEventListener('click', e => {
    if (e.target === $('fc-new-deck-modal')) closeNewDeckModal();
  });
  $('fc-nd-name').addEventListener('keydown', e => { if (e.key === 'Enter') saveNewDeck(); });

  // .apkg import
  $('fc-import-apkg-btn').addEventListener('click', () => $('fc-apkg-input').click());
  $('fc-apkg-input').addEventListener('change', e => {
    const file = e.target.files[0];
    if (file) importApkg(file);
    e.target.value = ''; // reset so the same file can be re-imported if needed
  });

  // Subject filter
  const filterEl = $('fc-subject-filter');
  if (filterEl) filterEl.addEventListener('change', renderFCDecks);

  // Restore last session
  const restoreBtn = $('fc-restore-session-btn');
  if (restoreBtn) restoreBtn.addEventListener('click', fcRestoreLastSession);
  updateRestoreSessionBtn();

  // Delete deck modal
  const deleteModal = $('fc-delete-deck-modal');
  if (deleteModal) {
    deleteModal.addEventListener('click', e => {
      if (e.target === deleteModal) closeDeleteDeckModal();
    });
  }
  $('fc-delete-deck-close')?.addEventListener('click', closeDeleteDeckModal);
  $('fc-delete-deck-cancel')?.addEventListener('click', closeDeleteDeckModal);
  $('fc-delete-deck-keep')?.addEventListener('click', () => {
    const deckId = _fcPendingDeleteDeckId;
    closeDeleteDeckModal();
    if (deckId) performDeleteDeck(deckId, { keepSession: true });
  });
  $('fc-delete-deck-discard')?.addEventListener('click', () => {
    const deckId = _fcPendingDeleteDeckId;
    closeDeleteDeckModal();
    if (deckId) performDeleteDeck(deckId, { discardSession: true });
  });

  // Manage panel
  $('fc-back-to-decks').addEventListener('click', () => {
    fcShowPanel('decks');
    renderFCDecks();
  });
  $('fc-study-btn').addEventListener('click', () => startStudySession(_fcCurrentDeckId));
  $('fc-interleave-deck-btn').addEventListener('click', () => startInterleavedSession());
  $('fc-settings-save-btn').addEventListener('click', saveDeckSettings);
  $('fc-add-single-btn').addEventListener('click', addSingleCard);
  $('fc-bulk-add-btn').addEventListener('click', addBulkCards);
  $('fc-card-back').addEventListener('keydown', e => { if (e.key === 'Enter') addSingleCard(); });

  // Study panel
  $('fc-back-to-manage').addEventListener('click', () => {
    if (_fcInterleaveMode) {
      if (_fcAiTutorAbort) {
        try { _fcAiTutorAbort.abort(); } catch(e) {}
        _fcAiTutorAbort = null;
      }
      _fcInterleaveMode = false;
      _fcDeckLookup = null;
      fcShowPanel('decks');
      renderFCDecks();
    } else {
      openDeckManage(_fcCurrentDeckId);
    }
  });
  $('fc-flip-btn').addEventListener('click', flipCard);
  _fcGradeBtnsByGrade = {};
  document.querySelectorAll('.fc-grade').forEach(btn => {
    const grade = parseInt(btn.dataset.grade);
    _fcGradeBtnsByGrade[grade] = btn;
    btn.addEventListener('click', () => gradeCard(grade));
  });
  $('fc-ai-tutor-btn')?.addEventListener('click', () => {
    explainCurrentCardWithAi();
  });

  // Interleave all decks button (deck list toolbar)
  const interleaveAllBtn = $('fc-interleave-all-btn');
  if (interleaveAllBtn) interleaveAllBtn.addEventListener('click', () => startInterleavedSession());

  // Fullscreen
  $('fc-fs-btn').addEventListener('click', toggleFCFullscreen);
  document.addEventListener('fullscreenchange', updateFCFullscreenBtn);
  document.addEventListener('webkitfullscreenchange', updateFCFullscreenBtn);

  // Keyboard shortcuts during study
  document.addEventListener('keydown', e => {
    if ($('fc-study-panel').classList.contains('fc-hidden')) return;
    if (e.key === ' ' && !_fcFlipped) { e.preventDefault(); flipCard(); return; }
    if (_fcFlipped) {
      if (e.key === '1') gradeCard(0);
      if (e.key === '2') gradeCard(1);
      if (e.key === '3') gradeCard(2);
      if (e.key === '4') gradeCard(3);
    }
  });
}

// ─── FULLSCREEN ───────────────────────────────────────────
function toggleFCFullscreen() {
  const el = $('view-flashcards');
  if (!document.fullscreenElement && !document.webkitFullscreenElement) {
    const req = el.requestFullscreen || el.webkitRequestFullscreen;
    if (req) req.call(el).catch(err => console.warn('Fullscreen error:', err));
  } else {
    const exit = document.exitFullscreen || document.webkitExitFullscreen;
    if (exit) exit.call(document);
  }
}

function updateFCFullscreenBtn() {
  const btn = $('fc-fs-btn');
  if (!btn) return;
  const active = !!(document.fullscreenElement || document.webkitFullscreenElement);
  btn.textContent = active ? '✕ Exit' : '⛶';
  btn.title = active ? 'Exit fullscreen (Esc)' : 'Enter fullscreen';
}
