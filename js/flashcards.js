/* ================================================================
   FLASHCARDS — Anki SM-2 Spaced Repetition
   ================================================================ */

// ─── SM-2 ALGORITHM ──────────────────────────────────────
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
      // Again — reset to 1 day, count lapse
      interval = 1;
      reps     = 0;
      lapses++;
    } else {
      // Hard / Good / Easy: advance interval
      if (reps === 0)      interval = 1;
      else if (reps === 1) interval = 6;
      else                 interval = Math.round(interval * ef);

      if (g === 3) interval = Math.round(interval * 1.3); // Easy bonus
      if (g === 1) interval = Math.max(1, Math.round(interval * 0.8)); // Hard penalty

      ef = Math.max(1.3, ef + (g === 3 ? 0.15 : g === 1 ? -0.15 : 0));
      reps++;
    }

    interval = Math.max(1, interval);
    const d = new Date();
    d.setDate(d.getDate() + interval);
    const nextReview = d.toISOString().split('T')[0];
    return { ...card, interval, reps, ef, lapses, nextReview };
  },

  isDue(card) {
    return !card.nextReview || card.nextReview <= todayKey();
  },

  /** Cards due today, capped at deck.dailyTarget */
  dueToday(deck) {
    const due = deck.cards.filter(c => this.isDue(c));
    return due.slice(0, deck.dailyTarget || 20);
  },

  dueCount(deck) {
    return Math.min(
      deck.cards.filter(c => this.isDue(c)).length,
      deck.dailyTarget || 20
    );
  },
};

// ─── UI STATE ─────────────────────────────────────────────
let _fcCurrentDeckId = null;
let _fcStudyQueue    = [];
let _fcStudyIdx      = 0;
let _fcFlipped       = false;
let _fcSessionStats  = { again: 0, hard: 0, good: 0, easy: 0 };

function fcCurrentDeck() {
  return (S.flashcardDecks || []).find(d => d.id === _fcCurrentDeckId) || null;
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

function renderFCDecks() {
  const decks = S.flashcardDecks || [];

  // Header summary
  let totalDue = 0;
  decks.forEach(d => { totalDue += SRS.dueCount(d); });
  const infoEl = $('fc-today-info');
  if (infoEl) {
    infoEl.innerHTML =
      `<span class="fc-today-n">${totalDue}</span> card${totalDue !== 1 ? 's' : ''} due today` +
      ` across <span class="fc-today-n">${decks.length}</span> deck${decks.length !== 1 ? 's' : ''}`;
  }

  const list = $('fc-deck-list');
  if (!decks.length) {
    list.innerHTML = `
      <div class="fc-empty">
        <div class="fc-empty-icon">🃏</div>
        <div class="fc-empty-msg">No decks yet — create your first deck and start spaced repetition.</div>
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
      ? Math.max(0, Math.ceil((new Date(deck.examDate) - new Date()) / 86400000))
      : null;

    return `
    <div class="fc-deck-card" style="border-left-color:${color}">
      <div class="fc-deck-head">
        <div>
          <div class="fc-deck-name">${escFc(deck.name)}</div>
          <div class="fc-deck-meta">
            <span class="fc-dm-stat">${total} card${total !== 1 ? 's' : ''}</span>
            ${due > 0
              ? `<span class="fc-dm-due">${due} due</span>`
              : `<span class="fc-dm-ok">✓ up to date</span>`}
            <span class="fc-dm-target">🎯 ${deck.dailyTarget || 20}/day</span>
            ${daysToExam !== null
              ? `<span class="fc-dm-exam">${daysToExam}d to exam</span>`
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
    </div>`;
  }).join('');

  list.querySelectorAll('.fc-ds-btn').forEach(btn =>
    btn.addEventListener('click', () => startStudySession(btn.dataset.id)));
  list.querySelectorAll('.fc-dm-btn').forEach(btn =>
    btn.addEventListener('click', () => openDeckManage(btn.dataset.id)));
  list.querySelectorAll('.fc-dd-btn').forEach(btn =>
    btn.addEventListener('click', () => deleteDeck(btn.dataset.id)));
}

function deleteDeck(id) {
  if (!confirm('Delete this deck and all its cards?')) return;
  S.flashcardDecks = (S.flashcardDecks || []).filter(d => d.id !== id);
  save();
  renderFCDecks();
  toast('Deck deleted');
}

// ─── NEW DECK MODAL ───────────────────────────────────────
function openNewDeckModal() {
  $('fc-nd-name').value = '';
  $('fc-nd-subject').value = '';
  $('fc-nd-exam').value = '';
  $('fc-nd-target').value = '20';
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
    subject:     $('fc-nd-subject').value,
    examDate:    $('fc-nd-exam').value,
    dailyTarget: Math.max(1, parseInt($('fc-nd-target').value) || 20),
    cards: [],
  };
  if (!S.flashcardDecks) S.flashcardDecks = [];
  S.flashcardDecks.push(deck);
  save();
  closeNewDeckModal();
  renderFCDecks();
  toast(`Deck "${name}" created ✓`);
}

// ─── DECK MANAGEMENT ──────────────────────────────────────
function openDeckManage(id) {
  _fcCurrentDeckId = id;
  const deck = fcCurrentDeck();
  if (!deck) return;

  $('fc-manage-title').textContent = deck.name;
  const subj = deck.subject ? GCSE_SUBJECTS[deck.subject] : null;
  const color = subj ? subj.color : 'var(--accent)';
  $('fc-manage-title').style.color = color;

  const lbl = deck.examDate
    ? `Exam: ${deck.examDate} · ${Math.max(0, Math.ceil((new Date(deck.examDate) - new Date()) / 86400000))}d away`
    : '';
  $('fc-manage-exam-lbl').textContent = lbl;

  $('fc-bulk-input').value = '';
  $('fc-card-front').value = '';
  $('fc-card-back').value  = '';

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
        <div class="fc-cr-front">${escFc(c.front)}</div>
        <div class="fc-cr-back">${escFc(c.back)}</div>
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
function startStudySession(deckId) {
  _fcCurrentDeckId = deckId;
  const deck = fcCurrentDeck();
  if (!deck) return;

  const due = SRS.dueToday(deck);
  if (!due.length) { toast('No cards due — well done!'); return; }

  _fcStudyQueue   = [...due].sort(() => Math.random() - 0.5);
  _fcStudyIdx     = 0;
  _fcFlipped      = false;
  _fcSessionStats = { again: 0, hard: 0, good: 0, easy: 0 };

  $('fc-study-deck-name').textContent = deck.name;
  $('fc-session-complete').classList.add('fc-hidden');
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
  _fcFlipped  = false;

  const done  = _fcStudyIdx;
  const total = _fcStudyQueue.length;
  $('fc-progress-fill').style.width  = (total ? (done / total) * 100 : 0) + '%';
  $('fc-progress-text').textContent  = `${done} / ${total}`;

  $('fc-front-text').textContent      = card.front;
  $('fc-front-text-back').textContent = card.front;
  $('fc-back-text').textContent       = card.back;

  $('fc-card-inner').classList.remove('fc-flipped');
  $('fc-flip-btn').classList.remove('fc-hidden');
  $('fc-grade-btns').classList.add('fc-hidden');

  updateGradeHints(card);
}

function updateGradeHints(card) {
  [0, 1, 2, 3].forEach(g => {
    const btn  = document.querySelector(`.fc-grade[data-grade="${g}"]`);
    if (!btn) return;
    const sim  = SRS.grade({ ...card }, g);
    const span = btn.querySelector('.fc-grade-interval');
    if (span) span.textContent = sim.interval === 1 ? '1 day' : `${sim.interval}d`;
  });
}

function flipCard() {
  _fcFlipped = true;
  $('fc-card-inner').classList.add('fc-flipped');
  $('fc-flip-btn').classList.add('fc-hidden');
  $('fc-grade-btns').classList.remove('fc-hidden');
}

function gradeCard(g) {
  const deck = fcCurrentDeck();
  if (!deck) return;
  const card = _fcStudyQueue[_fcStudyIdx];
  if (!card) return;

  const updated = SRS.grade({ ...card }, g);
  const idx = deck.cards.findIndex(c => c.id === card.id);
  if (idx !== -1) deck.cards[idx] = updated;

  const labels = ['again', 'hard', 'good', 'easy'];
  _fcSessionStats[labels[g]]++;

  // XP: Again=0, Hard=1, Good=2, Easy=3
  if (g > 0) addXP(g);

  // On "Again", re-insert the card near the end of the queue (cap to avoid runaway)
  if (g === 0 && _fcStudyQueue.length < 80) {
    const insertAt = Math.min(_fcStudyIdx + 3, _fcStudyQueue.length);
    _fcStudyQueue.splice(insertAt, 0, { ...updated });
  }

  save();
  _fcStudyIdx++;
  renderStudyCard();
}

function showSessionComplete() {
  $('fc-card-wrap').classList.add('fc-hidden');
  const { again, hard, good, easy } = _fcSessionStats;
  const total = again + hard + good + easy;
  const pass  = hard + good + easy;
  const rate  = total ? Math.round((pass / total) * 100) : 0;

  $('fc-session-complete').classList.remove('fc-hidden');
  $('fc-session-complete').innerHTML = `
    <div class="fc-done-icon">🎉</div>
    <div class="fc-done-title">Session Complete!</div>
    <div class="fc-done-subtitle">${rate}% retention rate</div>
    <div class="fc-done-stats">
      <div class="fc-ds"><span class="fc-ds-n">${total}</span><span class="fc-ds-l">reviewed</span></div>
      <div class="fc-ds fc-again-c"><span class="fc-ds-n">${again}</span><span class="fc-ds-l">again</span></div>
      <div class="fc-ds fc-hard-c"><span class="fc-ds-n">${hard}</span><span class="fc-ds-l">hard</span></div>
      <div class="fc-ds fc-good-c"><span class="fc-ds-n">${good}</span><span class="fc-ds-l">good</span></div>
      <div class="fc-ds fc-easy-c"><span class="fc-ds-n">${easy}</span><span class="fc-ds-l">easy</span></div>
    </div>
    <div class="fc-done-tip">💡 ${ATOMIC_TIPS[Math.floor(Math.random() * ATOMIC_TIPS.length)]}</div>
    <button class="btn-primary" id="fc-done-back-btn">← Back to Deck</button>`;

  $('fc-done-back-btn').addEventListener('click', () => openDeckManage(_fcCurrentDeckId));
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

  // Manage panel
  $('fc-back-to-decks').addEventListener('click', () => {
    fcShowPanel('decks');
    renderFCDecks();
  });
  $('fc-study-btn').addEventListener('click', () => startStudySession(_fcCurrentDeckId));
  $('fc-add-single-btn').addEventListener('click', addSingleCard);
  $('fc-bulk-add-btn').addEventListener('click', addBulkCards);
  $('fc-card-back').addEventListener('keydown', e => { if (e.key === 'Enter') addSingleCard(); });

  // Study panel
  $('fc-back-to-manage').addEventListener('click', () => openDeckManage(_fcCurrentDeckId));
  $('fc-flip-btn').addEventListener('click', flipCard);
  document.querySelectorAll('.fc-grade').forEach(btn =>
    btn.addEventListener('click', () => gradeCard(parseInt(btn.dataset.grade))));

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
