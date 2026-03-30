/* ================================================================
   HABITFORGE GCSE — MAIN APP
   ================================================================ */

// ─── STATE ────────────────────────────────────────────────
const S = {
  mastered: {},        // { "subjectKey:topicId:pointIdx": true }
  specAmber: {},       // { "subjectKey:topicId:pointIdx": true } — amber/learning state
  habits: [],
  todos: [],
  calEvents: {},
  pomoLog: [],
  focusLog: [],        // [ { task, time, date, dur } ] — free-focus stopwatch sessions
  habits_done: {},     // { habitId: true } — resets daily
  habitHistory: {},    // { habitId: { 'YYYY-MM-DD': true } }
  xp: 0,
  streak: 0,
  _lastStreakDay: null,
  pomoSessions: 0,
  deepWorkMins: 0,
  pomoSettings: { work: 25, short: 5, long: 15 },
  timetable: {},       // { 'YYYY-MM-DD': [ { id, startTime, endTime, subject, task, notes } ] }
  sleepLog: [],        // [ { id, date, preSleep, duration, grogginess, postSleep, notes } ]
  flashcardDecks: [],  // [ { id, name, subject, examDate, dailyTarget, cards:[] } ]
  fcSession: null,     // saved mid-session progress (synced to cloud for cross-device resume)
  errorLog: [],        // [ { id, date, subject, paper, mistakes: [{ id, desc, marks, topicId, topicName, fixed }] } ]
  quickLinks: [
    { emoji: '🔗', label: '', url: '' },
    { emoji: '🔗', label: '', url: '' },
    { emoji: '🔗', label: '', url: '' },
    { emoji: '🔗', label: '', url: '' },
  ],
};



// ─── UTIL ────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const todayKey = () => new Date().toISOString().split('T')[0];
const uid = () => Math.random().toString(36).slice(2, 9);

function save() {
  try {
    // Media (base64 images) is stored in IndexedDB, not localStorage, to avoid
    // the 5 MB quota limit.  Always strip it before writing to localStorage.
    const slim = { ...S };
    if (Array.isArray(S.flashcardDecks)) {
      slim.flashcardDecks = S.flashcardDecks.map(({ media, ...rest }) => rest);
    }
    localStorage.setItem('hf_gcse', JSON.stringify(slim));
  } catch(e) {
    toast('Could not save — browser storage is full', 'err');
  }
}

/**
 * Restores deck media from IndexedDB into the in-memory state after a page
 * load (localStorage never persists media due to its 5 MB quota limit).
 * Called once during init() and again after each cloud sync to ensure images
 * are always available for rendering.
 */
async function restoreMediaFromIDB() {
  try {
    const allMedia = await MediaDB.loadAll();
    if (!Array.isArray(S.flashcardDecks)) return;
    S.flashcardDecks = S.flashcardDecks.map(deck => {
      const media = allMedia[deck.id];
      return (media && Object.keys(media).length) ? { ...deck, media } : deck;
    });
  } catch(e) {
    console.warn('[media IDB restore]', e);
  }
}

function load() {
  try {
    const raw = localStorage.getItem('hf_gcse');
    if (raw) Object.assign(S, JSON.parse(raw));
  } catch(e) {}
  // Safety: ensure new fields exist even when loading old saved data
  if (!S.specAmber || typeof S.specAmber !== 'object') S.specAmber = {};
  if (!Array.isArray(S.focusLog)) S.focusLog = [];
  if (!Array.isArray(S.errorLog)) S.errorLog = [];
}
function fmt(sec) {
  return `${String(Math.floor(sec/60)).padStart(2,'0')}:${String(sec%60).padStart(2,'0')}`;
}
function toast(msg, type='') {
  const el = $('toast');
  el.textContent = msg;
  el.className = `toast show ${type}`;
  setTimeout(() => { el.className = 'toast'; }, 2800);
}
function addXP(n) {
  S.xp += n;
  updateXPDisplay();
  save();
}

// ─── QUOTES ───────────────────────────────────────────────
const QUOTES = [
  // Atomic Habits — James Clear
  ["You do not rise to the level of your goals. You fall to the level of your systems.", "James Clear — Atomic Habits"],
  ["Every action you take is a vote for the type of person you want to become.", "James Clear — Atomic Habits"],
  ["Habits are the compound interest of self-improvement.", "James Clear — Atomic Habits"],
  ["The 2-minute rule: make it easy enough to start. Always.", "James Clear — Atomic Habits"],
  ["Identity is the real behaviour change. Become the student. Act like the student.", "James Clear — Atomic Habits"],
  // Deep Work — Cal Newport
  ["Deep work is the ability to focus without distraction on a cognitively demanding task.", "Cal Newport — Deep Work"],
  ["Clarity about what matters provides clarity about what does not.", "Cal Newport — Deep Work"],
  ["Professionals stick to the schedule. Amateurs let life get in the way.", "Cal Newport — Deep Work"],
  ["Shallow work is an addiction. Deep work is a superpower.", "Cal Newport — Deep Work"],
  ["Schedule every minute of your day. What gets scheduled, gets done.", "Cal Newport — Deep Work"],
  // The One Thing — Gary Keller
  ["The extraordinary results are directly determined by how narrow you make your focus.", "Gary Keller — The One Thing"],
  ["Until my most important task is done, everything else is a distraction.", "Gary Keller — The One Thing"],
  ["Success is built sequentially. One thing at a time.", "Gary Keller — The One Thing"],
  // Getting Things Done — David Allen
  ["Your mind is for having ideas, not holding them.", "David Allen — Getting Things Done"],
  ["Anything that does not belong where it is costs you time, energy and attention.", "David Allen — Getting Things Done"],
  // Eat That Frog — Brian Tracy
  ["Eat the biggest, ugliest frog first thing every morning.", "Brian Tracy — Eat That Frog"],
  ["There is never enough time to do everything, but always time to do the most important thing.", "Brian Tracy — Eat That Frog"],
  // Ultralearning — Scott Young
  ["To learn hard things quickly, you must focus intensely without distraction.", "Scott Young — Ultralearning"],
  ["Directness: study the subject the way it will be tested. Past papers are king.", "Scott Young — Ultralearning"],
  // Make It Stick — Brown, Roediger & McDaniel
  ["Retrieval practice is the single most powerful study strategy.", "Brown, Roediger & McDaniel — Make It Stick"],
  ["Spaced practice: review material before you feel ready. The struggle is the learning.", "Brown, Roediger & McDaniel — Make It Stick"],
  ["Interleaving subjects builds durable knowledge. Mix up your revision sessions.", "Brown, Roediger & McDaniel — Make It Stick"],
  // The War of Art — Steven Pressfield
  ["The resistance will always be there. You do the work anyway.", "Steven Pressfield — The War of Art"],
  ["Turning pro means doing the work whether you feel like it or not.", "Steven Pressfield — The War of Art"],
  // Miscellaneous
  ["What we do in life echoes in eternity.", ""],
  ["A good plan today is better than a perfect plan tomorrow.", "General George S. Patton"],
];
const ATOMIC_TIPS = [
  // Atomic Habits
  "Implementation intentions: I will study [subject] at [time] in [place].",
  "Never miss twice. One bad day doesn't make a bad student.",
  "Make revision obvious: textbook open on desk before you sleep.",
  "Make it satisfying: tick the spec point. See the progress bar fill.",
  "2-minute rule: 'I'll just do 2 questions.' You'll always do more.",
  "Habit stack: after dinner → 30 min flashcards. Non-negotiable.",
  "Identity: you're not 'trying to revise' — you ARE a student who studies daily.",
  "Environment design: phone in another room during deep work. Every time.",
  "Progress over perfection. One spec point ticked > zero spec points ticked.",
  "Reward yourself immediately after a good session. The brain needs it.",
  // Deep Work
  "Time-block your study sessions. Decide in advance what you will work on and when.",
  "Quit social media during revision. Every notification breaks flow state.",
  "End each session with a shutdown ritual: close books, review tomorrow's plan.",
  // The One Thing
  "Identify your ONE most important exam task each morning. Do it first.",
  "Multitasking is a myth. Single-task every revision session.",
  // Ultralearning
  "Test yourself with past papers — don't just re-read notes.",
  "Feedback is instant. Mark your own work. Fix gaps immediately.",
  // Make It Stick
  "Spaced repetition: review a topic after 1 day, then 3 days, then 1 week.",
  "Interleave subjects: switch between Maths and Biology in one session.",
  "Write a brief summary of what you learned after every session.",
  // Eat That Frog
  "Tackle your hardest subject first each day. Everything after is easier.",
  "Set a deadline for every task. Parkinson's Law: work expands to fill the time you allow.",
];

// ─── NAV ─────────────────────────────────────────────────
function initNav() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      switchView(btn.dataset.view);
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      if (window.innerWidth <= 960) $('sidebar').classList.remove('open');
    });
  });
  $('hamburger').addEventListener('click', () => $('sidebar').classList.toggle('open'));
  $('sidebar-close').addEventListener('click', () => $('sidebar').classList.remove('open'));
}
function switchView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  $(`view-${name}`).classList.add('active');
  if (name === 'dashboard')   renderDashboard();
  if (name === 'specs')       renderSpecsView();
  if (name === 'calendar')    renderCalendar();
  if (name === 'todos')       renderTodos();
  if (name === 'habits')      renderHabits();
  if (name === 'sleep')       renderSleepJournal();
  if (name === 'timetable')   renderTimetable();
  if (name === 'flashcards')  renderFlashcards();
  if (name === 'errorlog')    renderErrorLog();
}

// ─── TOPBAR / COUNTDOWN ───────────────────────────────────
function initTopbar() {
  const now = new Date();
  $('tb-date').textContent = now.toLocaleDateString('en-GB', {
    weekday:'long', day:'numeric', month:'long', year:'numeric'
  }).toUpperCase();

  // Countdown to first exam
  const firstExam = ALL_EXAM_DATES.filter(e => e.date >= todayKey())
    .sort((a,b) => a.date.localeCompare(b.date))[0];
  if (firstExam) {
    const days = Math.ceil((new Date(firstExam.date) - now) / 86400000);
    $('cd-days').textContent = days;
    $('cd-label').textContent = `days to ${firstExam.subject}`;
  }
}
function updateXPDisplay() {
  const xp = S.xp;
  const level = Math.floor(xp / 100) + 1;
  const pct = xp % 100;
  $('sb-xp').textContent = xp;
  $('sb-level').textContent = `LVL ${level}`;
  $('sb-xp-fill').style.width = pct + '%';
}
function updateStreakDisplay() {
  $('streak-num').textContent = S.streak;
}

// ─── DASHBOARD ────────────────────────────────────────────
function renderDashboard() {
  renderDashPlan();
  renderDashUpcoming();
  renderMasteryRing();
  renderSubjBars();
  renderDashStats();
  renderExamAlert();
  renderDashFlashcards();
  renderDashSleepPreview();
}

function renderExamAlert() {
  const today = todayKey();
  const upcoming = ALL_EXAM_DATES.filter(e => e.date >= today)
    .sort((a,b) => a.date.localeCompare(b.date));
  const next = upcoming[0];
  const el = $('exam-alert');
  if (!next) { el.classList.remove('show'); return; }
  const days = Math.ceil((new Date(next.date) - new Date()) / 86400000);
  if (days > 30) { el.classList.remove('show'); return; }
  el.classList.add('show');
  el.innerHTML = `
    <div class="ea-icon">${next.icon}</div>
    <div class="ea-text">
      <div class="ea-title">${next.subject} — ${next.paper}</div>
      <div class="ea-sub">${next.date} · ${next.time} · ${next.board || ''}</div>
    </div>
    <div class="ea-days">${days}d</div>`;
}

function renderDashPlan() {
  const { phase, schedule } = getDailyRecommendation();

  // Phase tag
  const phaseTagEl = $('dash-phase-tag');
  const phaseDescEl = $('dash-phase-desc');
  if (phaseTagEl) {
    phaseTagEl.textContent = phase.name.split('—')[0].trim();
    phaseTagEl.style.borderColor = phase.color + '55';
    phaseTagEl.style.color = phase.color;
    phaseTagEl.style.background = phase.color + '18';
  }
  if (phaseDescEl) phaseDescEl.textContent = `${phase.description} · ${phase.dailyHours}h/day target`;

  const list = $('today-plan-list');
  list.innerHTML = schedule.map((s, i) => `
    <div class="plan-item" style="border-left-color: ${i === 0 ? 'var(--accent)' : 'var(--accent-2)'}">
      <div class="plan-time">${s.time}</div>
      <div>
        <div class="plan-task">${s.task || (s.subject ? s.subject.icon + ' ' + s.subject.name : '')}</div>
        <div class="plan-tip">${s.tip}</div>
      </div>
    </div>`).join('');

  const tip = ATOMIC_TIPS[new Date().getDay() % ATOMIC_TIPS.length];
  $('atomic-banner').textContent = `💡 ${phase.atomicHabit || tip}`;
}

function renderDashUpcoming() {
  const today = todayKey();
  const upcoming = ALL_EXAM_DATES.filter(e => e.date >= today)
    .sort((a,b) => a.date.localeCompare(b.date)).slice(0,5);
  const list = $('upcoming-exams-list');
  if (!upcoming.length) { list.innerHTML = '<p class="empty-s">All exams complete!</p>'; return; }
  list.innerHTML = upcoming.map(e => {
    const days = Math.ceil((new Date(e.date) - new Date()) / 86400000);
    const col = days <= 7 ? 'var(--accent-5)' : days <= 14 ? 'var(--accent-6)' : 'var(--accent-3)';
    return `
    <div class="ue-item">
      <span class="ue-icon">${e.icon}</span>
      <div class="ue-body">
        <div class="ue-name">${e.subject}</div>
        <div class="ue-paper">${e.paper}</div>
      </div>
      <div class="ue-date">${e.date}</div>
      <div class="ue-days" style="color:${col}">${days}d</div>
    </div>`; }).join('');
}

function renderMasteryRing() {
  let total = 0, done = 0;
  Object.values(GCSE_SUBJECTS).forEach(subj => {
    subj.topics.forEach(t => {
      t.points.forEach((p, i) => {
        total++;
        if (S.mastered[`${getSubjKey(subj)}:${t.id}:${i}`]) done++;
      });
    });
  });
  const pct = total ? Math.round((done/total)*100) : 0;
  const circ = 314;
  $('mastery-ring').style.strokeDashoffset = circ - (circ * pct / 100);
  $('mastery-pct').textContent = pct + '%';
  $('rs-done').textContent = done;
  $('rs-total').textContent = total;
}

function getSubjKey(subj) {
  return Object.entries(GCSE_SUBJECTS).find(([k,v]) => v === subj)?.[0] || '';
}

function renderSubjBars() {
  const container = $('subj-bars');
  container.innerHTML = Object.entries(GCSE_SUBJECTS).map(([key, subj]) => {
    let total = 0, done = 0;
    subj.topics.forEach(t => {
      t.points.forEach((p, i) => {
        total++;
        if (S.mastered[`${key}:${t.id}:${i}`]) done++;
      });
    });
    const pct = total ? Math.round((done/total)*100) : 0;
    return `
    <div class="subj-bar-item">
      <div class="subj-bar-header">
        <span class="sbi-name">${subj.icon} ${subj.name.split(' ')[0]}</span>
        <span class="sbi-pct" style="color:${subj.color}">${pct}%</span>
      </div>
      <div class="sbi-track">
        <div class="sbi-fill" style="width:${pct}%;background:${subj.color}"></div>
      </div>
    </div>`; }).join('');
}

function getTodayFocusMins() {
  const today = todayKey();
  let mins = 0;
  (S.pomoLog || []).forEach(l => { if (l.date === today) mins += (l.dur || 0); });
  (S.focusLog || []).forEach(l => { if (l.date === today) mins += (l.dur || 0); });
  return mins;
}

function renderDashStats() {
  const habitsDone = S.habits.filter(h => S.habits_done[h.id]).length;
  $('st-habits').textContent = habitsDone;
  $('st-pomo').textContent = S.pomoSessions;
  let specDone = 0;
  Object.keys(S.mastered).forEach(k => { if (S.mastered[k]) specDone++; });
  $('st-spec').textContent = specDone;

  // Today focus time
  const focusEl = $('st-focus');
  if (focusEl) focusEl.textContent = getTodayFocusMins() + 'm';

  // Today score for topbar
  const totalHabits = S.habits.length;
  const pct = totalHabits ? Math.round((habitsDone/totalHabits)*100) : 0;
  $('score-val').textContent = pct + '%';
}

function renderDashSleepPreview() {
  const el = $('dash-sleep-preview');
  if (!el) return;
  if (!Array.isArray(S.sleepLog)) S.sleepLog = [];
  const last = S.sleepLog.slice().sort((a,b) => b.date.localeCompare(a.date))[0];
  if (!last) {
    el.innerHTML = `<div class="dtp-empty"><span class="dtp-msg">No sleep logged yet — <button class="dtp-link" data-view="sleep">log tonight →</button></span></div>`;
  } else {
    el.innerHTML = `
      <div class="dsp-entry">
        <div class="dsp-date">${last.date}</div>
        <div class="dsp-row"><span class="dsp-tag">PRE</span><span class="dsp-lbl">Before sleep</span><span class="dsp-val">${last.preSleep}/5</span></div>
        <div class="dsp-row"><span class="dsp-tag">DUR</span><span class="dsp-lbl">Duration</span><span class="dsp-val">${last.duration}h${last.bedtime && last.wakeTime ? ` (${last.bedtime}–${last.wakeTime})` : ''}</span></div>
        <div class="dsp-row"><span class="dsp-tag dsp-tag--grog">GRG</span><span class="dsp-lbl">Grogginess</span><span class="dsp-val">${SLEEP_GROG_LABELS[last.grogginess] ?? last.grogginess}</span></div>
        <div class="dsp-row"><span class="dsp-tag dsp-tag--post">PST</span><span class="dsp-lbl">After sleep</span><span class="dsp-val">${last.postSleep}/5</span></div>
      </div>`;
  }
  el.querySelectorAll('.dtp-link').forEach(btn => {
    btn.addEventListener('click', () => {
      switchView(btn.dataset.view);
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      document.querySelector(`[data-view="${btn.dataset.view}"]`)?.classList.add('active');
    });
  });
}

// ─── SPECS VIEW ───────────────────────────────────────────
let currentSpecSubj = 'maths';
let openTopics = {};

function renderSpecsView() {
  renderSpecTabs();
  renderSpecBody();
}

function renderSpecTabs() {
  const container = $('spec-subject-tabs');
  container.innerHTML = Object.entries(GCSE_SUBJECTS).map(([key, subj]) => {
    let total = 0, done = 0;
    subj.topics.forEach(t => t.points.forEach((p,i) => {
      total++;
      if (S.mastered[`${key}:${t.id}:${i}`]) done++;
    }));
    const pct = total ? Math.round((done/total)*100) : 0;
    return `
    <button class="spec-tab ${key === currentSpecSubj ? 'active' : ''}" data-sk="${key}"
      style="${key === currentSpecSubj ? `border-color:${subj.color};background:${subj.color}18` : ''}">
      <div class="spec-tab-dot" style="background:${subj.color}"></div>
      ${subj.icon} ${subj.name}
      <span class="spec-tab-pct">${pct}%</span>
    </button>`; }).join('');

  container.querySelectorAll('.spec-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      currentSpecSubj = btn.dataset.sk;
      renderSpecTabs();
      renderSpecBody();
    });
  });
}

function renderSpecBody() {
  const subj = GCSE_SUBJECTS[currentSpecSubj];
  if (!subj) return;
  const container = $('spec-body');

  container.innerHTML = subj.topics.map(t => {
    const done = t.points.filter((p,i) => S.mastered[`${currentSpecSubj}:${t.id}:${i}`]).length;
    const pct = Math.round((done/t.points.length)*100);
    const isOpen = openTopics[t.id] !== false; // default open

    return `
    <div class="spec-topic-card">
      <div class="spec-topic-header" data-tid="${t.id}">
        <div class="sth-title">${t.topic}</div>
        <div class="sth-mini-bar">
          <div class="sth-mini-fill" style="width:${pct}%;background:${subj.color}"></div>
        </div>
        <div class="sth-progress">${done}/${t.points.length}</div>
        <div class="sth-pct" style="color:${subj.color}">${pct}%</div>
        <div class="sth-chevron ${isOpen ? 'open' : ''}">▼</div>
      </div>
      <div class="spec-points-list" style="display:${isOpen ? 'block' : 'none'}">
        ${t.points.map((p, i) => {
          const mKey = `${currentSpecSubj}:${t.id}:${i}`;
          const isGreen = !!S.mastered[mKey];
          const isAmber = !isGreen && !!S.specAmber[mKey];
          const statusClass = isGreen ? 'mastered' : isAmber ? 'amber' : 'red-status';
          const xpText = isGreen ? 'DONE' : isAmber ? 'REVIEW' : '+2xp';
          return `
          <div class="spec-point ${statusClass}" data-mkey="${mKey}">
            <div class="sp-tl">
              <div class="sp-tl-dot sp-tl-red"></div>
              <div class="sp-tl-dot sp-tl-amber"></div>
              <div class="sp-tl-dot sp-tl-green"></div>
            </div>
            <div class="sp-text">${p}</div>
            <div class="sp-xp">${xpText}</div>
          </div>`;
        }).join('')}
      </div>
    </div>`; }).join('');

  // Topic header collapse
  container.querySelectorAll('.spec-topic-header').forEach(hd => {
    hd.addEventListener('click', () => {
      const tid = hd.dataset.tid;
      const card = hd.parentElement;
      const list = card.querySelector('.spec-points-list');
      const chev = hd.querySelector('.sth-chevron');
      const isOpen = list.style.display !== 'none';
      list.style.display = isOpen ? 'none' : 'block';
      chev.classList.toggle('open', !isOpen);
      openTopics[tid] = !isOpen;
    });
  });

  // Spec point toggle
  container.querySelectorAll('.spec-point').forEach(pt => {
    pt.addEventListener('click', () => toggleSpecPoint(pt.dataset.mkey, pt));
  });
}

function updateTopicProgressBar(mKey) {
  const [subjKey, topicId] = mKey.split(':');
  const subj = GCSE_SUBJECTS[subjKey];
  if (!subj) return;
  const topic = subj.topics.find(t => t.id === topicId);
  if (!topic) return;
  const done = topic.points.filter((p, i) => S.mastered[`${subjKey}:${topicId}:${i}`]).length;
  const pct = Math.round((done / topic.points.length) * 100);
  const header = document.querySelector(`.spec-topic-header[data-tid="${topicId}"]`);
  if (!header) return;
  const fillEl     = header.querySelector('.sth-mini-fill');
  const progressEl = header.querySelector('.sth-progress');
  const pctEl      = header.querySelector('.sth-pct');
  if (fillEl)     fillEl.style.width = `${pct}%`;
  if (progressEl) progressEl.textContent = `${done}/${topic.points.length}`;
  if (pctEl)      pctEl.textContent = `${pct}%`;
}

function toggleSpecPoint(mKey, el) {
  const isGreen = !!S.mastered[mKey];
  const isAmber = !isGreen && !!S.specAmber[mKey];

  if (!isAmber && !isGreen) {
    // Red → Amber
    S.specAmber[mKey] = true;
    el.classList.remove('mastered', 'red-status');
    el.classList.add('amber');
    el.querySelector('.sp-xp').textContent = 'REVIEW';
    toast('🟡 Marked for review', 'info');
  } else if (isAmber) {
    // Amber → Green (mastered)
    delete S.specAmber[mKey];
    S.mastered[mKey] = true;
    addXP(2);
    el.classList.remove('amber', 'red-status');
    el.classList.add('mastered');
    el.querySelector('.sp-xp').textContent = 'DONE';
    toast('✓ Spec point mastered! +2 XP');
  } else {
    // Green → Red
    delete S.mastered[mKey];
    S.xp = Math.max(0, S.xp - 2);
    updateXPDisplay();
    el.classList.remove('mastered', 'amber');
    el.classList.add('red-status');
    el.querySelector('.sp-xp').textContent = '+2xp';
    toast('🔴 Needs more work', 'info');
  }
  save();
  updateTopicProgressBar(mKey);
  renderMasteryRing();
  renderSubjBars();
  renderDashStats();
  renderSpecTabs();
}

// ─── POMODORO ────────────────────────────────────────────
let pomSec = 25*60, pomRunning = false, pomTimer = null;
let pomMode = 'work', pomCount = 1;
const CIRC = 816.8;

function initPomodoro() {
  // Populate subject select
  const sel = $('pomo-subject-select');
  Object.entries(GCSE_SUBJECTS).forEach(([key, subj]) => {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = `${subj.icon} ${subj.name}`;
    sel.appendChild(opt);
  });

  $('pc-start').addEventListener('click', togglePomo);
  $('pc-reset').addEventListener('click', resetPomo);
  $('pc-skip').addEventListener('click', () => completePomo(true));
  $('si-save').addEventListener('click', savePomoSettings);

  document.querySelectorAll('.pt').forEach(tab => {
    tab.addEventListener('click', () => {
      if (pomRunning) return;
      document.querySelectorAll('.pt').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      pomMode = tab.dataset.mode;
      resetPomo();
    });
  });

  // Quick start from dashboard
  $('pq-btn').addEventListener('click', () => {
    switchView('pomodoro');
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('[data-view="pomodoro"]').classList.add('active');
    if (!pomRunning) togglePomo();
  });

  // Topbar timer pill — click to jump to Deep Work view
  $('tb-timer').addEventListener('click', () => {
    switchView('pomodoro');
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('[data-view="pomodoro"]').classList.add('active');
  });

  updatePomoDisplay();
  renderPomoLog();
  updateDWStats();
}
function savePomoSettings() {
  S.pomoSettings.work = parseInt($('si-work').value)||25;
  S.pomoSettings.short = parseInt($('si-short').value)||5;
  S.pomoSettings.long = parseInt($('si-long').value)||15;
  save(); resetPomo(); toast('Settings saved');
}
function getModeSeconds() {
  if (pomMode==='work') return S.pomoSettings.work*60;
  if (pomMode==='short') return S.pomoSettings.short*60;
  return S.pomoSettings.long*60;
}
function getModeLabel() {
  if (pomMode==='work') return 'FOCUS SESSION';
  if (pomMode==='short') return 'SHORT BREAK';
  return 'LONG BREAK';
}
function togglePomo() {
  if (pomRunning) { clearInterval(pomTimer); pomRunning=false; $('pc-start').textContent='▶'; }
  else { pomRunning=true; $('pc-start').textContent='⏸'; pomTimer=setInterval(tickPomo,1000); }
}
function tickPomo() {
  if (pomSec<=0) { completePomo(); return; }
  pomSec--;
  updatePomoDisplay();
}
function completePomo(skipped=false) {
  clearInterval(pomTimer); pomRunning=false; $('pc-start').textContent='▶';
  if (pomMode==='work' && !skipped) {
    S.pomoSessions++;
    S.deepWorkMins += S.pomoSettings.work;
    addXP(20);
    const subj = $('pomo-subject-select').value;
    const subjName = subj ? GCSE_SUBJECTS[subj]?.name : '';
    const task = $('pomo-task-in').value || (subjName ? `${subjName} revision` : 'Deep work session');
    const now = new Date();
    S.pomoLog.unshift({ task, time: now.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}), date: todayKey(), dur: S.pomoSettings.work });
    if (S.pomoLog.length>15) S.pomoLog.pop();
    save(); renderPomoLog(); updateDWStats(); renderDashStats();
    toast(`🔥 Session complete! +20 XP`);
    pomCount++;
    $('pt-count').textContent = pomCount;
    pomMode = pomCount%4===0 ? 'long' : 'short';
    document.querySelectorAll('.pt').forEach(t => t.classList.remove('active'));
    document.querySelector(`[data-mode="${pomMode}"]`)?.classList.add('active');
  } else {
    if (!skipped) toast('Break done — back to work!', 'info');
    pomMode = 'work';
    document.querySelectorAll('.pt').forEach(t => t.classList.remove('active'));
    document.querySelector('[data-mode="work"]')?.classList.add('active');
  }
  pomSec = getModeSeconds();
  $('pt-mode').textContent = getModeLabel();
  renderPomoRing(0);
  updatePomoDisplay();
}
function resetPomo() {
  clearInterval(pomTimer); pomRunning=false; pomSec=getModeSeconds();
  $('pc-start').textContent='▶';
  $('pt-mode').textContent = getModeLabel();
  renderPomoRing(0); updatePomoDisplay();
}
function updatePomoDisplay() {
  const t = fmt(pomSec);
  $('pt-time').textContent = t;
  $('pq-time').textContent = t;
  const total = getModeSeconds();
  const elapsed = total - pomSec;
  renderPomoRing(elapsed/total);
  const lbl = pomRunning ? (pomMode==='work' ? '🔥 Deep focus active' : '☕ Break time') : 'Ready to focus';
  $('pq-state').textContent = lbl;
  // Color near end
  $('pt-prog').style.stroke = pomSec < 60 && pomMode==='work' ? 'var(--accent-3)' : 'var(--accent)';
  updateTimerTopbar();
}
function renderPomoRing(prog) {
  $('pt-prog').style.strokeDashoffset = CIRC - (CIRC * prog);
}
function renderPomoLog() {
  const el = $('pomo-log');
  if (!S.pomoLog.length) { el.innerHTML = '<p class="empty-s">No sessions yet.</p>'; return; }
  el.innerHTML = S.pomoLog.slice(0,6).map(l => `
    <div class="pl-item">
      <span class="pl-time">${l.time}</span>
      <span class="pl-task">${l.task}</span>
      <span class="pl-dur">${l.dur}m</span>
    </div>`).join('');
}
function updateDWStats() {
  $('dwt-min').textContent = S.deepWorkMins;
  $('dwt-sess').textContent = S.pomoSessions;
}

// ─── FREE FOCUS STOPWATCH ─────────────────────────────────
let focusSec = 0, focusRunning = false, focusTimer = null;

function fmtHMS(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

function initFreeFocus() {
  $('ff-start').addEventListener('click', toggleFreeFocus);
  $('ff-log').addEventListener('click', logFreeFocus);
  $('ff-reset').addEventListener('click', resetFreeFocus);
  $('ff-fullscreen').addEventListener('click', toggleFreeFocusFullscreen);
  document.addEventListener('fullscreenchange', updateFreeFocusFullscreenButton);
  document.addEventListener('webkitfullscreenchange', updateFreeFocusFullscreenButton);
  updateFreeFocusFullscreenButton();
  updateFreeFocusDisplay();
}

function toggleFreeFocus() {
  if (focusRunning) {
    clearInterval(focusTimer); focusRunning = false;
    $('ff-start').textContent = '▶ Resume';
    $('ff-status').textContent = 'Paused — log or resume';
    $('ff-log').disabled = false;
  } else {
    focusRunning = true;
    $('ff-start').textContent = '⏸ Pause';
    $('ff-status').textContent = '🔥 Focus active — stay off your phone!';
    $('ff-log').disabled = true;
    focusTimer = setInterval(tickFreeFocus, 1000);
  }
}

function tickFreeFocus() {
  focusSec++;
  updateFreeFocusDisplay();
}

function logFreeFocus() {
  if (focusSec < 60) { toast('Focus for at least 1 minute before logging', 'info'); return; }
  clearInterval(focusTimer); focusRunning = false;
  const mins = Math.round(focusSec / 60);
  S.pomoSessions++;
  S.deepWorkMins += mins;
  const now = new Date();
  const task = $('ff-task-in').value || 'Free focus session';
  if (!Array.isArray(S.focusLog)) S.focusLog = [];
  S.focusLog.unshift({ task, time: now.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}), date: todayKey(), dur: mins });
  if (S.focusLog.length > 15) S.focusLog.pop();
  addXP(Math.max(1, Math.floor(mins / 5)));
  save(); renderFocusLog(); updateDWStats(); renderDashStats();
  toast(`🌲 ${mins}m logged! +${Math.max(1, Math.floor(mins/5))} XP`);
  focusSec = 0;
  $('ff-start').textContent = '▶ Start';
  $('ff-log').disabled = true;
  $('ff-status').textContent = 'Session logged ✓';
  updateFreeFocusDisplay();
}

function resetFreeFocus() {
  clearInterval(focusTimer); focusRunning = false; focusSec = 0;
  $('ff-start').textContent = '▶ Start';
  $('ff-log').disabled = true;
  $('ff-status').textContent = 'Ready to focus';
  updateFreeFocusDisplay();
}

function updateFreeFocusDisplay() {
  $('ff-time').textContent = fmtHMS(focusSec);
  updateTimerTopbar();
}

function isFreeFocusFullscreenActive() {
  return document.fullscreenElement === $('view-pomodoro')
    || document.webkitFullscreenElement === $('view-pomodoro');
}

function updateFreeFocusFullscreenButton() {
  const btn = $('ff-fullscreen');
  if (!btn) return;
  const active = isFreeFocusFullscreenActive();
  btn.textContent = active ? '🗗' : '⛶';
  btn.title = active ? 'Exit fullscreen' : 'Enter fullscreen';
  btn.setAttribute('aria-label', active ? 'Exit fullscreen' : 'Enter fullscreen');
}

async function toggleFreeFocusFullscreen() {
  const view = $('view-pomodoro');
  if (!view) return;
  try {
    if (isFreeFocusFullscreenActive()) {
      if (document.exitFullscreen) await document.exitFullscreen();
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    } else {
      if (view.requestFullscreen) await view.requestFullscreen();
      else if (view.webkitRequestFullscreen) view.webkitRequestFullscreen();
      else toast('Fullscreen is not supported in this browser', 'info');
    }
  } catch (e) {
    toast('Could not toggle fullscreen', 'err');
  }
}

// ─── TOPBAR TIMER PILL ────────────────────────────────────
function updateTimerTopbar() {
  const el = $('tb-timer');
  const timeEl = $('tb-timer-time');
  if (!el || !timeEl) return;
  if (pomRunning) {
    el.style.display = '';
    el.classList.toggle('tb-timer-break', pomMode !== 'work');
    timeEl.textContent = fmt(pomSec);
  } else if (focusRunning) {
    el.style.display = '';
    el.classList.remove('tb-timer-break');
    timeEl.textContent = fmtHMS(focusSec);
  } else {
    el.style.display = 'none';
  }
}

function renderFocusLog() {
  const el = $('ff-log-list');
  if (!el) return;
  const log = S.focusLog || [];
  if (!log.length) { el.innerHTML = '<p class="empty-s">No free focus sessions yet.</p>'; return; }
  el.innerHTML = log.slice(0, 5).map(l => `
    <div class="pl-item">
      <span class="pl-time">${l.time}</span>
      <span class="pl-task">${l.task}</span>
      <span class="pl-dur">${l.dur}m</span>
    </div>`).join('');
}


let calDate = new Date();
let calSelected = null;

function initCalendar() {
  $('cal-prev').addEventListener('click', () => { calDate.setMonth(calDate.getMonth()-1); renderCalendar(); });
  $('cal-next').addEventListener('click', () => { calDate.setMonth(calDate.getMonth()+1); renderCalendar(); });

  renderExamScheduleList();
}

function renderCalendar() {
  const months = ['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE','JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'];
  $('cal-month').textContent = `${months[calDate.getMonth()]} ${calDate.getFullYear()}`;

  const year = calDate.getFullYear(), month = calDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month+1, 0).getDate();
  const daysInPrev = new Date(year, month, 0).getDate();
  const today = new Date();

  let html = '';
  for (let i=firstDay-1; i>=0; i--)
    html += `<div class="cal-day other-m"><span class="cal-day-num">${daysInPrev-i}</span></div>`;

  for (let d=1; d<=daysInMonth; d++) {
    const dk = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const isToday = today.getFullYear()===year && today.getMonth()===month && today.getDate()===d;
    const isSel = calSelected===dk;
    const exams = ALL_EXAM_DATES.filter(e => e.date===dk);
    const hasCustom = S.calEvents[dk]?.length > 0;
    const hasHabits = S.habits.some(h => S.habitHistory[h.id]?.[dk]);

    let dots = '';
    if (exams.length) dots += `<div class="c-dot" style="background:var(--accent-5)"></div>`;
    if (hasCustom) dots += `<div class="c-dot" style="background:#6366f1"></div>`;
    if (hasHabits) dots += `<div class="c-dot" style="background:var(--accent-3)"></div>`;

    html += `
    <div class="cal-day ${isToday?'today':''} ${isSel?'selected':''} ${exams.length?'has-exam':''}" data-dk="${dk}">
      <span class="cal-day-num">${d}</span>
      ${dots ? `<div class="cal-dots">${dots}</div>` : ''}
    </div>`;
  }
  const rem = (firstDay + daysInMonth) % 7;
  if (rem) for (let i=1; i<=7-rem; i++)
    html += `<div class="cal-day other-m"><span class="cal-day-num">${i}</span></div>`;

  $('cal-grid').innerHTML = html;
  $('cal-grid').querySelectorAll('.cal-day:not(.other-m)').forEach(day => {
    day.addEventListener('click', () => selectCalDate(day.dataset.dk));
  });
}

function selectCalDate(dk) {
  calSelected = dk;
  renderCalendar();
  const d = new Date(dk + 'T12:00:00');
  $('cal-sel-label').textContent = d.toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long'}).toUpperCase();

  const exams = ALL_EXAM_DATES.filter(e => e.date===dk);
  const custom = S.calEvents[dk] || [];

  let html = '';
  if (!exams.length && !custom.length) html = '<p class="empty-s">No events. Add one below.</p>';

  exams.forEach(e => {
    html += `
    <div class="cal-event-item" style="border-left:2px solid ${e.color}">
      <span class="cei-time">${e.time}</span>
      <span class="cei-name">${e.icon} ${e.subject}</span>
      <span class="cei-exam-badge">EXAM</span>
    </div>`;
  });

  custom.forEach((ev, i) => {
    html += `
    <div class="cal-event-item">
      <span class="cei-time">${ev.time||'—'}</span>
      <span class="cei-name">${ev.name}</span>
      <button class="cei-del" data-dk="${dk}" data-i="${i}">✕</button>
    </div>`;
  });

  html += `
    <div class="cal-add-form">
      <label class="card-lbl">ADD EVENT</label>
      <input class="field-in" id="cal-ev-name" placeholder="Event name"/>
      <input type="time" class="field-in" id="cal-ev-time"/>
      <button class="btn-primary" id="cal-ev-add">+ ADD</button>
    </div>`;

  $('cal-sel-content').innerHTML = html;

  $('cal-ev-add')?.addEventListener('click', () => {
    const name = $('cal-ev-name').value.trim();
    if (!name) return;
    if (!S.calEvents[dk]) S.calEvents[dk] = [];
    S.calEvents[dk].push({ name, time: $('cal-ev-time').value });
    S.calEvents[dk].sort((a,b) => a.time.localeCompare(b.time));
    save(); selectCalDate(dk); renderCalendar(); toast('Event added');
  });

  $('cal-sel-content').querySelectorAll('.cei-del').forEach(btn => {
    btn.addEventListener('click', () => {
      S.calEvents[btn.dataset.dk].splice(parseInt(btn.dataset.i),1);
      save(); selectCalDate(dk); renderCalendar();
    });
  });
}

function renderExamScheduleList() {
  const today = todayKey();
  const upcoming = ALL_EXAM_DATES.filter(e => e.date >= today)
    .sort((a,b) => a.date.localeCompare(b.date));
  const el = $('exam-schedule-list');
  el.innerHTML = upcoming.map(e => {
    const d = new Date(e.date+'T12:00:00');
    const dateStr = d.toLocaleDateString('en-GB',{day:'numeric',month:'short'});
    return `
    <div class="esl-item" style="border-left-color:${e.color}">
      <div class="esl-date">${dateStr}</div>
      <div class="esl-info">
        <div class="esl-name">${e.icon} ${e.subject}</div>
        <div class="esl-paper">${e.paper} · ${e.time}</div>
      </div>
    </div>`; }).join('');
}

// ─── TODOS ───────────────────────────────────────────────
let todoFilter = 'all';
let todoView = 'list'; // 'list' or 'matrix'

function initTodos() {
  $('todo-add').addEventListener('click', addTodo);
  $('todo-in').addEventListener('keydown', e => { if (e.key==='Enter') addTodo(); });
  $('todo-clear').addEventListener('click', clearDoneTodos);
  $('todo-view-toggle').addEventListener('click', () => {
    todoView = todoView === 'list' ? 'matrix' : 'list';
    $('todo-view-toggle').textContent = todoView === 'list' ? '⊞ MATRIX' : '☰ LIST';
    renderTodos();
  });
  document.querySelectorAll('.fb[data-tf]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.fb[data-tf]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active'); todoFilter=btn.dataset.tf; renderTodos();
    });
  });
  const tip = ATOMIC_TIPS[Math.floor(Math.random()*ATOMIC_TIPS.length)];
  $('todo-atomic-tip').textContent = `"${tip}"`;
}

function addTodo() {
  const name = $('todo-in').value.trim();
  if (!name) {
    toast('Enter a task name first', 'err');
    $('todo-in').focus();
    return;
  }
  const dueVal = $('todo-due').value;
  S.todos.unshift({
    id:uid(), name, priority:$('todo-pri').value, category:$('todo-cat').value,
    done:false, createdAt:Date.now(),
    dueDate: dueVal || null,
    subtasks: []
  });
  $('todo-in').value = '';
  $('todo-due').value = '';
  // Reset to list view and 'all' filter so the new task is always immediately visible
  todoView = 'list';
  $('todo-view-toggle').textContent = '⊞ MATRIX';
  todoFilter = 'all';
  document.querySelectorAll('.fb[data-tf]').forEach(b => b.classList.remove('active'));
  document.querySelector('.fb[data-tf="all"]').classList.add('active');
  save(); renderTodos(); toast(`Task added`);
}

function getDueBadge(dueDate) {
  if (!dueDate) return '';
  const today = new Date(); today.setHours(0,0,0,0);
  const due = new Date(dueDate + 'T00:00:00');
  const diff = Math.ceil((due - today) / (1000*60*60*24));
  let cls = '';
  let label = '';
  if (diff < 0) { cls = 'overdue'; label = `${Math.abs(diff)}d overdue`; }
  else if (diff === 0) { cls = 'today'; label = 'Due today'; }
  else if (diff === 1) { label = 'Due tomorrow'; }
  else { label = `Due in ${diff}d`; }
  return `<span class="ti-due ${cls}">📅 ${label}</span>`;
}

function renderTodos() {
  let todos = [...S.todos];
  // Ensure subtasks array exists on older todos
  todos.forEach(t => { if (!t.subtasks) t.subtasks = []; });
  const pOrd = {critical:0,high:1,medium:2,low:3};
  todos.sort((a,b) => a.done!==b.done ? (a.done?1:-1) : pOrd[a.priority]-pOrd[b.priority]);
  if (todoFilter==='active') todos=todos.filter(t=>!t.done);
  if (todoFilter==='done') todos=todos.filter(t=>t.done);
  if (todoFilter==='critical') todos=todos.filter(t=>t.priority==='critical');

  // Toggle between list and matrix views
  const isList = todoView === 'list';
  $('todos-list').style.display = isList ? '' : 'none';
  $('eisenhower-matrix').style.display = isList ? 'none' : '';

  if (isList) {
    const el = $('todos-list');
    if (!todos.length) { el.innerHTML='<p class="empty-s">No tasks here.</p>'; }
    else {
      el.innerHTML = todos.map(t => {
        const subj = GCSE_SUBJECTS[t.category];
        const catLabel = subj ? `${subj.icon} ${subj.name.split(' ')[0]}` : (t.category || 'General').toUpperCase();
        const dueBadge = getDueBadge(t.dueDate);
        const subtasksHTML = (t.subtasks && t.subtasks.length) ? `
          <div class="ti-subtasks">
            ${t.subtasks.map(st => `
              <div class="ti-subtask ${st.done?'st-done':''}">
                <button class="st-check ${st.done?'ck':''}" data-tid="${t.id}" data-sid="${st.id}">${st.done?'✓':''}</button>
                <span class="st-name">${st.name}</span>
                <button class="st-del" data-tid="${t.id}" data-dsid="${st.id}">✕</button>
              </div>`).join('')}
          </div>` : '';
        return `
        <div class="todo-item p-${t.priority} ${t.done?'t-done':''}">
          <button class="ti-check ${t.done?'ck':''}" data-tid="${t.id}">${t.done?'✓':''}</button>
          <div class="ti-body">
            <div class="ti-name">${t.name}</div>
            <div class="ti-meta">
              <span class="ti-cat">${catLabel}</span>
              ${dueBadge}
            </div>
            ${subtasksHTML}
            <div class="ti-add-subtask">
              <input placeholder="Add subtask..." data-tid="${t.id}"/>
              <button data-tid="${t.id}">+</button>
            </div>
          </div>
          <div class="ti-actions">
            <button class="ti-del" data-dtid="${t.id}" title="Delete">✕</button>
          </div>
        </div>`;
      }).join('');
      el.querySelectorAll('.ti-check').forEach(b => b.addEventListener('click', () => toggleTodo(b.dataset.tid)));
      el.querySelectorAll('.ti-del').forEach(b => b.addEventListener('click', () => deleteTodo(b.dataset.dtid)));
      el.querySelectorAll('.st-check').forEach(b => b.addEventListener('click', () => toggleSubtask(b.dataset.tid, b.dataset.sid)));
      el.querySelectorAll('.st-del').forEach(b => b.addEventListener('click', () => deleteSubtask(b.dataset.tid, b.dataset.dsid)));
      el.querySelectorAll('.ti-add-subtask button').forEach(b => {
        b.addEventListener('click', () => addSubtask(b.dataset.tid));
      });
      el.querySelectorAll('.ti-add-subtask input').forEach(inp => {
        inp.addEventListener('keydown', e => { if (e.key==='Enter') addSubtask(inp.dataset.tid); });
      });
    }
  } else {
    renderEisenhowerMatrix(todos);
  }

  const total = S.todos.length;
  const done = S.todos.filter(t=>t.done).length;
  $('tst-total').textContent = total;
  $('tst-done').textContent = done;
  $('tst-crit').textContent = S.todos.filter(t=>t.priority==='critical'&&!t.done).length;
  $('todo-count').textContent = total > 0 ? `${done}/${total} done` : '';
  $('todo-progress-fill').style.width = total > 0 ? `${(done / total * 100).toFixed(1)}%` : '0%';
}

// Priority → Eisenhower quadrant mapping
// The four priority levels map naturally to the four quadrants:
//   critical → Q1: Urgent & Important   → DO FIRST  (must do immediately)
//   high     → Q2: Important, Schedulable → SCHEDULE (plan & protect time)
//   medium   → Q3: Low importance, time-sensitive → DELEGATE (minimise)
//   low      → Q4: Neither urgent nor important   → ELIMINATE (drop it)
function renderEisenhowerMatrix(todos) {
  const quadrants = { q1: [], q2: [], q3: [], q4: [] };
  todos.forEach(t => {
    if (t.priority === 'critical') quadrants.q1.push(t);
    else if (t.priority === 'high') quadrants.q2.push(t);
    else if (t.priority === 'medium') quadrants.q3.push(t);
    else quadrants.q4.push(t);
  });
  ['q1','q2','q3','q4'].forEach(q => {
    const el = $(`em-${q}-items`);
    const tasks = quadrants[q];
    if (!tasks.length) {
      el.innerHTML = '<div class="em-empty">No tasks here</div>';
    } else {
      el.innerHTML = tasks.map(t => `
        <div class="em-item ${t.done?'em-done':''}">
          <button class="em-item-check ${t.done?'ck':''}" data-tid="${t.id}">${t.done?'✓':''}</button>
          <span class="em-item-name">${t.name}</span>
        </div>`).join('');
      el.querySelectorAll('.em-item-check').forEach(b => b.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleTodo(b.dataset.tid);
      }));
    }
  });
}

function toggleTodo(id) {
  const t = S.todos.find(t=>t.id===id);
  if (!t) return;
  t.done=!t.done;
  if (t.done) addXP(5);
  save(); renderTodos();
}
function deleteTodo(id) {
  S.todos=S.todos.filter(t=>t.id!==id);
  save(); renderTodos();
}
function clearDoneTodos() {
  const count = S.todos.filter(t=>t.done).length;
  if (!count) { toast('No completed tasks to clear', 'info'); return; }
  S.todos = S.todos.filter(t=>!t.done);
  save(); renderTodos(); toast(`Cleared ${count} completed task${count>1?'s':''}`);
}

function addSubtask(todoId) {
  const t = S.todos.find(t=>t.id===todoId);
  if (!t) return;
  if (!t.subtasks) t.subtasks = [];
  const inp = document.querySelector(`.ti-add-subtask input[data-tid="${todoId}"]`);
  const name = inp ? inp.value.trim() : '';
  if (!name) return;
  t.subtasks.push({ id: uid(), name, done: false });
  inp.value = '';
  save(); renderTodos();
}
function toggleSubtask(todoId, subId) {
  const t = S.todos.find(t=>t.id===todoId);
  if (!t || !t.subtasks) return;
  const st = t.subtasks.find(s=>s.id===subId);
  if (!st) return;
  st.done = !st.done;
  save(); renderTodos();
}
function deleteSubtask(todoId, subId) {
  const t = S.todos.find(t=>t.id===todoId);
  if (!t || !t.subtasks) return;
  t.subtasks = t.subtasks.filter(s=>s.id!==subId);
  save(); renderTodos();
}

// ─── HABITS ──────────────────────────────────────────────
let habitFilter = 'all';

function initHabits() {
  $('add-habit-btn').addEventListener('click', () => $('habit-modal').classList.add('open'));
  $('modal-cls').addEventListener('click', closeModal);
  $('modal-cancel').addEventListener('click', closeModal);
  $('modal-save').addEventListener('click', saveHabit);
  document.querySelectorAll('.fb[data-hf]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.fb[data-hf]').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active'); habitFilter=btn.dataset.hf; renderHabits();
    });
  });
}

function closeModal() {
  $('habit-modal').classList.remove('open');
  ['h-name','h-identity','h-intention','h-cue','h-emoji'].forEach(id => { $(id).value=''; });
}
function saveHabit() {
  const name = $('h-name').value.trim();
  if (!name) { toast('Name required','err'); return; }
  S.habits.push({
    id:uid(), name,
    identity: $('h-identity').value.trim() || 'I am consistent',
    intention: $('h-intention').value.trim(),
    cue: $('h-cue').value.trim(),
    time: $('h-time').value,
    emoji: $('h-emoji').value.trim() || '📚',
    streak: 0,
  });
  save(); closeModal(); renderHabits(); renderDashStats(); toast(`Habit forged!`);
}

function renderHabits(filter=habitFilter) {
  let habits = filter==='all' ? S.habits : S.habits.filter(h=>h.time===filter);
  const el = $('habits-list');
  if (!habits.length) { el.innerHTML='<p class="empty-s">No habits yet. Forge one above.</p>'; return; }
  const tl = {morning:'🌅 Morning',afternoon:'☀️ Afternoon',evening:'🌙 Evening',anytime:'⚡ Anytime'};
  el.innerHTML = habits.map(h => {
    const done = !!S.habits_done[h.id];
    return `
    <div class="habit-card ${done?'h-done':''}">
      <div class="hc-emoji">${h.emoji}</div>
      <div class="hc-body">
        <div class="hc-name">${h.name}</div>
        <div class="hc-id">${h.identity}</div>
        ${h.cue ? `<div class="hc-cue">↳ After I ${h.cue}</div>` : ''}
      </div>
      <div class="hc-streak"><div class="hcs-n">${h.streak}</div><div class="hcs-l">STREAK</div></div>
      <div class="hc-time">${tl[h.time]||h.time}</div>
      <div class="hc-actions">
        <button class="hc-check ${done?'done':''}" data-hid="${h.id}">${done?'✓':''}</button>
        <button class="hc-del" data-dhid="${h.id}">✕</button>
      </div>
    </div>`;
  }).join('');

  el.querySelectorAll('.hc-check').forEach(b => b.addEventListener('click', () => toggleHabit(b.dataset.hid)));
  el.querySelectorAll('.hc-del').forEach(b => b.addEventListener('click', () => deleteHabit(b.dataset.dhid)));
}

function toggleHabit(id) {
  const h = S.habits.find(h=>h.id===id);
  if (!h) return;
  const was = !!S.habits_done[id];
  const today = todayKey();
  if (!was) {
    S.habits_done[id]=true;
    if (!S.habitHistory[id]) S.habitHistory[id]={};
    S.habitHistory[id][today]=true;
    h.streak = calcStreak(id);
    addXP(10);
    toast(`✓ ${h.name} — identity reinforced! +10 XP`);
  } else {
    S.habits_done[id]=false;
    if (S.habitHistory[id]) delete S.habitHistory[id][today];
    h.streak = calcStreak(id);
    S.xp = Math.max(0, S.xp-10);
    updateXPDisplay();
  }
  updateStreak();
  save(); renderHabits(); renderDashStats();
}

function calcStreak(id) {
  const hist = S.habitHistory[id] || {};
  let s=0; const d=new Date();
  while(true) { const k=d.toISOString().split('T')[0]; if(hist[k]){s++;d.setDate(d.getDate()-1);}else break; }
  return s;
}
function updateStreak() {
  const today = todayKey();
  if (S.habits.length && S.habits.every(h=>S.habits_done[h.id])) {
    if (S._lastStreakDay !== today) { S._lastStreakDay=today; S.streak++; }
  }
  updateStreakDisplay();
}
function deleteHabit(id) {
  S.habits = S.habits.filter(h=>h.id!==id);
  delete S.habits_done[id]; delete S.habitHistory[id];
  save(); renderHabits(); toast('Habit removed','info');
}

// ─── TIMETABLE ────────────────────────────────────────────
const TIMETABLE_WISDOM = [
  { quote: "Schedule every minute of your day. What gets scheduled, gets done.", author: "Cal Newport — Deep Work" },
  { quote: "Time-blocking is the practice of dedicating specific hours to specific work.", author: "Cal Newport — Deep Work" },
  { quote: "Until your most important task is done, everything else is a distraction.", author: "Gary Keller — The One Thing" },
  { quote: "The key is not to prioritise what's on your schedule, but to schedule your priorities.", author: "Stephen Covey — 7 Habits" },
  { quote: "Eat the biggest, ugliest frog first thing in the morning — get the hard subject done.", author: "Brian Tracy — Eat That Frog" },
  { quote: "Protect the morning. The first 2 hours of the day determine everything.", author: "Cal Newport — Deep Work" },
  { quote: "A plan is useless until it meets reality — but having no plan is worse.", author: "General Dwight D. Eisenhower" },
];

function getTomorrowKey() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0];
}

function calcDurationMins(start, end) {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  return Math.max(0, (eh * 60 + em) - (sh * 60 + sm));
}

function calcDuration(start, end) {
  const mins = calcDurationMins(start, end);
  if (mins <= 0) return '';
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function initTimetable() {
  $('tmbl-add-btn').addEventListener('click', addTimetableBlock);
  $('tmbl-task').addEventListener('keydown', e => { if (e.key === 'Enter') addTimetableBlock(); });
  renderTimetableWisdom();
}

function addTimetableBlock() {
  const start = $('tmbl-start').value;
  const end = $('tmbl-end').value;
  const task = $('tmbl-task').value.trim();
  if (!start || !task) { toast('Fill in start time and task name', 'err'); return; }
  if (end && start >= end) { toast('End time must be after start time', 'err'); return; }
  const key = getTomorrowKey();
  if (!S.timetable[key]) S.timetable[key] = [];
  S.timetable[key].push({
    id: uid(),
    startTime: start,
    endTime: end || '',
    subject: $('tmbl-subject').value,
    task,
    notes: $('tmbl-notes').value.trim(),
  });
  S.timetable[key].sort((a, b) => a.startTime.localeCompare(b.startTime));
  $('tmbl-task').value = '';
  $('tmbl-notes').value = '';
  $('tmbl-end').value = '';
  save();
  renderTimetable();
  toast('Time block added ✓');
}

function deleteTimetableBlock(key, id) {
  if (!S.timetable[key]) return;
  S.timetable[key] = S.timetable[key].filter(b => b.id !== id);
  save();
  renderTimetable();
}

function renderTimetable() {
  const tomorrow = getTomorrowKey();
  const [ty, tm, td] = tomorrow.split('-').map(Number);
  const d = new Date(ty, tm - 1, td);
  const dateStr = d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).toUpperCase();
  $('timetable-date-label').textContent = dateStr;

  const blocks = (S.timetable[tomorrow] || []);

  // Stats
  let totalMins = 0;
  blocks.forEach(b => { if (b.endTime) totalMins += calcDurationMins(b.startTime, b.endTime); });
  const hrs = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  $('tmbl-total').textContent = totalMins > 0 ? (hrs > 0 ? `${hrs}h${mins > 0 ? ' ' + mins + 'm' : ''}` : `${mins}m`) : '—';
  $('tmbl-blocks-count').textContent = blocks.length;

  const timeline = $('timetable-timeline');
  if (!blocks.length) {
    timeline.innerHTML = '<p class="empty-s">No blocks yet. Add your first time block above.</p>';
    return;
  }
  timeline.innerHTML = blocks.map(b => {
    const subj = GCSE_SUBJECTS[b.subject];
    const color = subj ? subj.color : 'var(--accent)';
    const subjLabel = subj ? `${subj.icon} ${subj.name.split(' ')[0]}` : (b.subject ? b.subject : 'General');
    const dur = b.endTime ? calcDuration(b.startTime, b.endTime) : '';
    return `
    <div class="tmbl-block" style="border-left-color:${color}">
      <div class="tmbl-time-col">
        <div class="tmbl-t-start">${b.startTime}</div>
        ${b.endTime ? `<div class="tmbl-t-arrow">↓</div><div class="tmbl-t-end">${b.endTime}</div>` : ''}
        ${dur ? `<div class="tmbl-dur">${dur}</div>` : ''}
      </div>
      <div class="tmbl-body">
        <div class="tmbl-task-name">${b.task}</div>
        <div class="tmbl-meta">
          <span class="ti-cat">${subjLabel}</span>
          ${b.notes ? `<span class="tmbl-notes-text">${b.notes}</span>` : ''}
        </div>
      </div>
      <button class="ti-del tmbl-del-btn" data-key="${tomorrow}" data-id="${b.id}" title="Delete block">✕</button>
    </div>`;
  }).join('');

  timeline.querySelectorAll('.tmbl-del-btn').forEach(btn => {
    btn.addEventListener('click', () => deleteTimetableBlock(btn.dataset.key, btn.dataset.id));
  });
}

function renderTimetableWisdom() {
  const el = $('tmbl-wisdom-list');
  if (!el) return;
  el.innerHTML = TIMETABLE_WISDOM.map(w => `
    <div class="tmbl-wisdom-item">
      <div class="tmbl-wisdom-quote">"${w.quote}"</div>
      <div class="tmbl-wisdom-author">— ${w.author}</div>
    </div>`).join('');
}

// ─── SLEEP JOURNAL ────────────────────────────────────────
const SLEEP_MOOD_LABELS  = ['','Anxious','Uneasy','Neutral','Peaceful','Blissful'];
const SLEEP_POST_LABELS  = ['','Drained','Low','OK','Good','Energised'];
const SLEEP_GROG_LABELS  = ['','Wide awake','Slight','Moderate','Heavy','Zombie'];
const SLEEP_MOOD_EMOJIS  = ['','😣','😕','😐','🙂','😄'];
const SLEEP_GROG_EMOJIS  = ['','⚡','😑','😪','😵','🧟'];

// Nap quality thresholds (minutes)
const NAP_LONG_MINS  = 90; // full sleep cycle — yellow accent
const NAP_SHORT_MINS = 20; // power nap — green accent

function initSleepJournal() {
  if (!Array.isArray(S.sleepLog)) S.sleepLog = [];
  if (!Array.isArray(S.napLog))   S.napLog   = [];

  // Set date to today by default
  const dateIn = $('sleep-date');
  if (dateIn) dateIn.value = todayKey();
  const napDateIn = $('nap-date');
  if (napDateIn) napDateIn.value = todayKey();

  // Wire up sliders to show live values
  function wireSlider(id, valId, formatter) {
    const sl = $(id), vl = $(valId);
    if (!sl || !vl) return;
    const update = () => {
      vl.textContent = formatter(sl.value);
      const min = parseFloat(sl.min) || 0;
      const max = parseFloat(sl.max) || 100;
      const pct = ((parseFloat(sl.value) - min) / (max - min)) * 100;
      sl.style.setProperty('--val', pct + '%');
    };
    sl.addEventListener('input', update);
    update();
  }
  wireSlider('pre-sleep',   'pre-sleep-val',  v => `${v}/5`);
  wireSlider('sleep-dur',   'sleep-dur-val',  v => `${parseFloat(v)}h`);
  wireSlider('grogginess',  'grogginess-val', v => `${v}/5`);
  wireSlider('post-sleep',  'post-sleep-val', v => `${v}/5`);

  // Auto-calculate duration from bed/wake times
  function autoCalcDuration() {
    const bed  = $('sleep-bedtime')?.value;
    const wake = $('sleep-waketime')?.value;
    if (!bed || !wake) return;
    const [bh, bm] = bed.split(':').map(Number);
    let   [wh, wm] = wake.split(':').map(Number);
    let totalMins = (wh * 60 + wm) - (bh * 60 + bm);
    if (totalMins <= 0) totalMins += 24 * 60; // crossed midnight
    const hours = Math.round(totalMins / 30) * 0.5; // round to nearest 0.5 h (30-min blocks)
    const sl = $('sleep-dur');
    const vl = $('sleep-dur-val');
    if (!sl || !vl) return;
    const clamped = Math.min(12, Math.max(2, hours));
    sl.value = clamped;
    vl.textContent = `${clamped}h`;
    const pct = ((clamped - 2) / (12 - 2)) * 100;
    sl.style.setProperty('--val', pct + '%');
  }
  $('sleep-bedtime')?.addEventListener('change', autoCalcDuration);
  $('sleep-waketime')?.addEventListener('change', autoCalcDuration);

  $('sleep-log-btn').addEventListener('click', logSleep);
  $('nap-log-btn').addEventListener('click', logNap);
  renderSleepJournal();
}

function logSleep() {
  if (!Array.isArray(S.sleepLog)) S.sleepLog = [];
  const date = $('sleep-date').value || todayKey();
  const preSleep   = parseInt($('pre-sleep').value);
  const duration   = parseFloat($('sleep-dur').value);
  const grogginess = parseInt($('grogginess').value);
  const postSleep  = parseInt($('post-sleep').value);
  const notes      = $('sleep-notes').value.trim();
  const bedtime    = $('sleep-bedtime')?.value || '';
  const wakeTime   = $('sleep-waketime')?.value || '';

  // Prevent duplicate for same date — update existing
  const existing = S.sleepLog.find(e => e.date === date);
  if (existing) {
    Object.assign(existing, { preSleep, duration, grogginess, postSleep, notes, bedtime, wakeTime });
    toast('Sleep entry updated ✓');
  } else {
    S.sleepLog.unshift({ id: uid(), date, preSleep, duration, grogginess, postSleep, notes, bedtime, wakeTime });
    toast('Sleep logged 💤');
  }
  save();
  renderSleepJournal();
  renderDashSleepPreview();
}

function deleteSleepEntry(id) {
  S.sleepLog = S.sleepLog.filter(e => e.id !== id);
  save();
  renderSleepJournal();
  renderDashSleepPreview();
}

// ─── NAP TRACKER ──────────────────────────────────────────
function logNap() {
  if (!Array.isArray(S.napLog)) S.napLog = [];
  const date        = $('nap-date')?.value || todayKey();
  const startTime   = $('nap-start')?.value || '';
  const durationMins = parseInt($('nap-dur')?.value);
  const note        = $('nap-note')?.value.trim() || '';

  if (!durationMins || durationMins < 1) {
    toast('Enter a nap duration in minutes', 'err');
    $('nap-dur')?.focus();
    return;
  }

  S.napLog.unshift({ id: uid(), date, startTime, durationMins, note });
  $('nap-dur').value  = '';
  $('nap-start').value = '';
  $('nap-note').value  = '';
  save();
  renderNapLog();
  toast(`Nap logged 😴`);
}

function deleteNap(id) {
  S.napLog = S.napLog.filter(n => n.id !== id);
  save();
  renderNapLog();
}

function renderNapLog() {
  const el = $('nap-history-list');
  if (!el) return;
  if (!Array.isArray(S.napLog) || !S.napLog.length) {
    el.innerHTML = '<p class="empty-s">No naps logged yet.</p>';
    return;
  }
  const entries = S.napLog.slice().sort((a, b) => {
    const dc = b.date.localeCompare(a.date);
    if (dc !== 0) return dc;
    return (b.startTime || '').localeCompare(a.startTime || '');
  });
  el.innerHTML = entries.map(n => {
    const d = new Date(n.date + 'T12:00:00');
    const dateStr = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).toUpperCase();
    const timeStr = n.startTime ? ` @ ${n.startTime}` : '';
    const qualColor = n.durationMins >= NAP_LONG_MINS ? 'var(--accent-4)' : n.durationMins >= NAP_SHORT_MINS ? 'var(--accent-3)' : 'var(--text-3)';
    return `
    <div class="nap-entry">
      <div class="nap-entry-top">
        <span class="nap-entry-date">${dateStr}${timeStr}</span>
        <span class="nap-entry-dur" style="color:${qualColor}">${n.durationMins} min</span>
      </div>
      ${n.note ? `<div class="sj-notes">${n.note}</div>` : ''}
      <button class="ti-del sj-del" data-nid="${n.id}" title="Delete">✕</button>
    </div>`;
  }).join('');
  el.querySelectorAll('.sj-del').forEach(btn => {
    btn.addEventListener('click', () => deleteNap(btn.dataset.nid));
  });
}

function renderSleepJournal() {
  if (!Array.isArray(S.sleepLog)) S.sleepLog = [];
  if (!Array.isArray(S.napLog))   S.napLog   = [];
  renderSleepHistory();
  renderSleepAverages();
  renderNapLog();
}

function renderSleepHistory() {
  const el = $('sleep-history-list');
  if (!el) return;
  const entries = S.sleepLog.slice().sort((a,b) => b.date.localeCompare(a.date));
  if (!entries.length) {
    el.innerHTML = '<p class="empty-s">No sleep entries yet. Log your first night above.</p>';
    return;
  }
  el.innerHTML = entries.map(e => {
    const durColor = e.duration >= 7 ? 'var(--accent-3)' : e.duration >= 6 ? 'var(--accent-4)' : 'var(--accent-5)';
    const stars = n => '★'.repeat(n) + '☆'.repeat(5 - n);
    const d = new Date(e.date + 'T12:00:00');
    const dateStr = d.toLocaleDateString('en-GB', { weekday:'short', day:'numeric', month:'short' }).toUpperCase();
    const sleepTimes = (e.bedtime || e.wakeTime)
      ? `<div class="sj-sleep-times">${e.bedtime ? `<span class="sj-time-badge">🌙 ${e.bedtime}</span>` : ''}${e.wakeTime ? `<span class="sj-time-badge">☀️ ${e.wakeTime}</span>` : ''}</div>`
      : '';
    // Total sleep = night sleep + any naps that day
    const dayNaps = (S.napLog || []).filter(n => n.date === e.date);
    const napMins = dayNaps.reduce((sum, n) => sum + (n.durationMins || 0), 0);
    const totalHours = parseFloat((e.duration + napMins / 60).toFixed(1));
    const totalColor = totalHours >= 7 ? 'var(--accent-3)' : totalHours >= 6 ? 'var(--accent-4)' : 'var(--accent-5)';
    const totalSleepRow = napMins > 0
      ? `<div class="sj-total-sleep">
          <span class="sj-tag sj-tag--total">TOTAL</span>
          <span class="sj-total-val" style="color:${totalColor}">${totalHours}h</span>
          <span class="sj-total-detail">${e.duration}h night + ${napMins}min nap</span>
        </div>`
      : '';
    return `
    <div class="sj-entry">
      <div class="sj-entry-date">${dateStr}</div>
      ${sleepTimes}
      <div class="sj-entry-metrics">
        <div class="sj-metric-col">
          <span class="sj-tag">PRE</span>
          <span class="sj-stars" title="Pre-sleep mood">${stars(e.preSleep)}</span>
          <span class="sj-label">before</span>
        </div>
        <div class="sj-metric-col sj-dur-col">
          <span class="sj-dur-num" style="color:${durColor}">${e.duration}h</span>
          <span class="sj-label">sleep</span>
        </div>
        <div class="sj-metric-col">
          <span class="sj-tag sj-tag--grog">GRG</span>
          <span class="sj-grog-val">${SLEEP_GROG_LABELS[e.grogginess]}</span>
          <span class="sj-label">grog</span>
        </div>
        <div class="sj-metric-col">
          <span class="sj-tag sj-tag--post">PST</span>
          <span class="sj-stars" title="Post-sleep mood">${stars(e.postSleep)}</span>
          <span class="sj-label">after</span>
        </div>
      </div>
      ${totalSleepRow}
      ${e.notes ? `<div class="sj-notes">${e.notes}</div>` : ''}
      <button class="ti-del sj-del" data-sid="${e.id}" title="Delete">✕</button>
    </div>`;
  }).join('');
  el.querySelectorAll('.sj-del').forEach(btn => {
    btn.addEventListener('click', () => deleteSleepEntry(btn.dataset.sid));
  });
}

function renderSleepAverages() {
  if (!Array.isArray(S.sleepLog) || !S.sleepLog.length) {
    ['avg-duration','avg-pre','avg-grog','avg-post'].forEach(id => {
      const el = $(id); if (el) el.textContent = '—';
    });
    return;
  }
  const recent = S.sleepLog.slice().sort((a,b) => b.date.localeCompare(a.date)).slice(0, 7);
  const avg = key => (recent.reduce((s,e) => s + e[key], 0) / recent.length).toFixed(1);
  const durEl = $('avg-duration'); if (durEl) durEl.textContent = avg('duration') + 'h';
  const preEl = $('avg-pre');      if (preEl) preEl.textContent = avg('preSleep') + '/5';
  const grEl  = $('avg-grog');     if (grEl)  grEl.textContent  = avg('grogginess') + '/5';
  const poEl  = $('avg-post');     if (poEl)  poEl.textContent  = avg('postSleep') + '/5';
}

// ─── DAILY RESET ─────────────────────────────────────────
function checkDailyReset() {
  const lastRun = localStorage.getItem('hf_gcse_lastrun');
  const today = todayKey();
  if (lastRun && lastRun !== today) {
    S.habits_done = {};
    S.pomoSessions = 0;
    S.deepWorkMins = 0;
    S.pomoLog = [];
    save();
  }
  localStorage.setItem('hf_gcse_lastrun', today);
}

// ─── ERROR LOG ────────────────────────────────────────────
let _elMistakes = []; // temp list of mistakes for the current form
let elFilter = 'all';

function _elBuildPaperDatalist(subjectKey) {
  const datalist = $('el-paper-suggestions');
  if (!datalist) return;
  const exams = (GCSE_SUBJECTS[subjectKey] && GCSE_SUBJECTS[subjectKey].exams) || [];
  datalist.innerHTML = exams.map(e => `<option value="${_escAttr(e.paper)}">`).join('');
}

function _elTopicOptions(subjectKey) {
  const topics = (GCSE_SUBJECTS[subjectKey] && GCSE_SUBJECTS[subjectKey].topics) || [];
  if (!topics.length) return '<option value="">-- Select Subject First --</option>';
  return '<option value="">-- Select Topic --</option>' +
    topics.map(t => `<option value="${_escAttr(t.id)}">${_escHtml(t.topic)}</option>`).join('');
}

function _elRenderFormMistakes() {
  const container = $('el-mistakes-container');
  if (!container) return;
  if (!_elMistakes.length) {
    container.innerHTML = '<p class="empty-s">No mistakes added yet. Click &ldquo;+ ADD MISTAKE&rdquo; above.</p>';
    return;
  }
  const subjectKey = ($('el-subject') && $('el-subject').value) || '';
  const topicOptions = _elTopicOptions(subjectKey);
  container.innerHTML = _elMistakes.map((m, i) => `
    <div class="el-mistake-row" data-mid="${m.id}">
      <span class="el-mistake-num">${i + 1}</span>
      <div class="el-mistake-fields">
        <input class="field-in el-m-desc" id="el-m-desc-${m.id}"
               placeholder="What went wrong? e.g. Forgot to simplify, sign error"/>
        <div class="el-mistake-meta">
          <div class="el-m-field">
            <label class="el-m-lbl">MARKS LOST</label>
            <input type="number" class="field-in el-m-marks" id="el-m-marks-${m.id}"
                   min="0" max="99" step="0.5" placeholder="0"/>
          </div>
          <div class="el-m-field el-m-field--grow">
            <label class="el-m-lbl">TOPIC</label>
            <select class="field-sel el-topic-sel el-m-topic" id="el-m-topic-${m.id}">
              ${topicOptions}
            </select>
          </div>
          <div class="el-m-field">
            <label class="el-m-lbl">FIXED?</label>
            <button class="el-fixed-form-btn ${m.fixed ? 'el-fixed-form-btn--done' : ''}"
                    data-mid="${m.id}">${m.fixed ? '✓ Fixed' : '○ Not yet'}</button>
          </div>
        </div>
      </div>
      <button class="ti-del el-m-remove" data-mid="${m.id}" title="Remove">✕</button>
    </div>
  `).join('');

  container.querySelectorAll('.el-m-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      _elMistakes = _elMistakes.filter(m => m.id !== btn.dataset.mid);
      _elRenderFormMistakes();
    });
  });

  container.querySelectorAll('.el-fixed-form-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const m = _elMistakes.find(x => x.id === btn.dataset.mid);
      if (!m) return;
      m.fixed = !m.fixed;
      btn.classList.toggle('el-fixed-form-btn--done', m.fixed);
      btn.textContent = m.fixed ? '✓ Fixed' : '○ Not yet';
    });
  });
}

function initErrorLog() {
  if (!Array.isArray(S.errorLog)) S.errorLog = [];

  const dateIn = $('el-date');
  if (dateIn) dateIn.value = todayKey();

  // Populate subject dropdown dynamically from GCSE_SUBJECTS
  const subjSel = $('el-subject');
  if (subjSel) {
    Object.entries(GCSE_SUBJECTS).forEach(([key, subj]) => {
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = `${subj.icon} ${subj.name}`;
      subjSel.appendChild(opt);
    });
    subjSel.addEventListener('change', () => {
      _elBuildPaperDatalist(subjSel.value);
      _elRenderFormMistakes(); // refresh topic dropdowns with new subject
    });
  }

  const addBtn = $('el-add-mistake-btn');
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      const mid = uid();
      _elMistakes.push({ id: mid, fixed: false });
      _elRenderFormMistakes();
      // Brief delay lets the DOM settle after innerHTML update before focusing
      setTimeout(() => { const el = $(`el-m-desc-${mid}`); if (el) el.focus(); }, 50);
    });
  }

  const logBtn = $('el-log-btn');
  if (logBtn) logBtn.addEventListener('click', logErrorSession);

  document.querySelectorAll('.fb[data-ef]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.fb[data-ef]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      elFilter = btn.dataset.ef;
      renderErrorHistory();
    });
  });

  renderErrorLog();
}

function logErrorSession() {
  if (!Array.isArray(S.errorLog)) S.errorLog = [];
  const date    = ($('el-date') && $('el-date').value)    || todayKey();
  const subject = ($('el-subject') && $('el-subject').value) || '';
  const paper   = ($('el-paper') && $('el-paper').value.trim()) || '';

  if (!subject) { toast('Select a subject', 'err'); if ($('el-subject')) $('el-subject').focus(); return; }
  if (!paper)   { toast('Enter the paper / exam name', 'err'); if ($('el-paper')) $('el-paper').focus(); return; }
  if (!_elMistakes.length) { toast('Add at least one mistake', 'err'); return; }

  const subjectTopics = (GCSE_SUBJECTS[subject] && GCSE_SUBJECTS[subject].topics) || [];
  const mistakes = _elMistakes.map(m => {
    const desc    = ($(`el-m-desc-${m.id}`) && $(`el-m-desc-${m.id}`).value.trim())    || '';
    const marks   = parseFloat(($(`el-m-marks-${m.id}`) && $(`el-m-marks-${m.id}`).value)) || 0;
    const topicId = ($(`el-m-topic-${m.id}`) && $(`el-m-topic-${m.id}`).value)            || '';
    const topicObj = subjectTopics.find(t => t.id === topicId);
    return { id: uid(), desc, marks, topicId, topicName: (topicObj && topicObj.topic) || '', fixed: m.fixed || false };
  }).filter(m => m.desc);

  if (!mistakes.length) { toast('Enter a description for at least one mistake', 'err'); return; }

  S.errorLog.unshift({ id: uid(), date, subject, paper, mistakes });

  // Reset form
  if ($('el-paper')) $('el-paper').value = '';
  if ($('el-date'))  $('el-date').value  = todayKey();
  _elMistakes = [];
  _elRenderFormMistakes();

  save();
  addXP(5);
  renderErrorLog();
  toast('Error session logged ✓');
}

function deleteErrorSession(sid) {
  S.errorLog = S.errorLog.filter(s => s.id !== sid);
  save();
  renderErrorLog();
}

function toggleMistakeFixed(sid, mid) {
  const session = S.errorLog.find(s => s.id === sid);
  if (!session) return;
  const mistake = session.mistakes.find(m => m.id === mid);
  if (!mistake) return;
  mistake.fixed = !mistake.fixed;
  if (mistake.fixed) addXP(2);
  save();
  renderErrorHistory();
  renderErrorStats();
}

function renderErrorLog() {
  if (!Array.isArray(S.errorLog)) S.errorLog = [];
  renderErrorHistory();
  renderErrorStats();
}

function renderErrorHistory() {
  const el = $('el-history-list');
  if (!el) return;
  if (!Array.isArray(S.errorLog)) S.errorLog = [];

  let entries = S.errorLog.slice().sort((a, b) => b.date.localeCompare(a.date));

  if (elFilter === 'unfixed') {
    entries = entries
      .map(s => Object.assign({}, s, { mistakes: (s.mistakes || []).filter(m => !m.fixed) }))
      .filter(s => s.mistakes.length);
  } else if (elFilter === 'fixed') {
    entries = entries
      .map(s => Object.assign({}, s, { mistakes: (s.mistakes || []).filter(m => m.fixed) }))
      .filter(s => s.mistakes.length);
  }

  if (!entries.length) {
    el.innerHTML = '<p class="empty-s">No error sessions logged yet. Log a past paper above.</p>';
    return;
  }

  el.innerHTML = entries.map(session => {
    const subj      = GCSE_SUBJECTS[session.subject] || {};
    const icon      = subj.icon || '📝';
    const subjName  = subj.name || session.subject || 'Unknown';
    const d         = new Date(session.date + 'T12:00:00');
    const dateStr   = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).toUpperCase();
    const mistakes  = session.mistakes || [];
    const totalMarks = mistakes.reduce((s, m) => s + (m.marks || 0), 0);
    const fixedCount = mistakes.filter(m => m.fixed).length;
    const allFixed   = mistakes.length > 0 && fixedCount === mistakes.length;

    return `
    <div class="el-entry ${allFixed ? 'el-entry--all-fixed' : ''}">
      <div class="el-entry-hdr">
        <div class="el-entry-hdr-left">
          <span class="el-entry-date">${dateStr}</span>
          <span class="el-entry-subj">${icon} ${_escHtml(subjName)}</span>
          <span class="el-entry-paper">${_escHtml(session.paper)}</span>
        </div>
        <div class="el-entry-hdr-right">
          ${totalMarks > 0 ? `<span class="el-marks-lost">&#8722;${totalMarks} marks</span>` : ''}
          <span class="el-fixed-count ${allFixed ? 'el-fixed-count--all' : ''}">${fixedCount}/${mistakes.length} fixed</span>
          <button class="ti-del el-session-del" data-sid="${session.id}" title="Delete session">&#10005;</button>
        </div>
      </div>
      <div class="el-mistakes-list">
        ${mistakes.map(m => `
          <div class="el-m-item ${m.fixed ? 'el-m-item--fixed' : ''}">
            <button class="el-toggle-fixed ${m.fixed ? 'el-toggle-fixed--done' : ''}"
                    data-sid="${session.id}" data-mid="${m.id}"
                    title="${m.fixed ? 'Mark as unfixed' : 'Mark as fixed'}">${m.fixed ? '&#10003;' : '&#9711;'}</button>
            <div class="el-m-body">
              <span class="el-m-desc">${_escHtml(m.desc)}</span>
              ${m.topicName ? `<span class="el-m-topic">${_escHtml(m.topicName)}</span>` : ''}
            </div>
            ${m.marks ? `<span class="el-m-marks">&#8722;${m.marks}m</span>` : ''}
          </div>`).join('')}
      </div>
    </div>`;
  }).join('');

  el.querySelectorAll('.el-session-del').forEach(btn => {
    btn.addEventListener('click', () => deleteErrorSession(btn.dataset.sid));
  });
  el.querySelectorAll('.el-toggle-fixed').forEach(btn => {
    btn.addEventListener('click', () => toggleMistakeFixed(btn.dataset.sid, btn.dataset.mid));
  });
}

function renderErrorStats() {
  if (!Array.isArray(S.errorLog)) return;
  const sessions    = S.errorLog;
  const allMistakes = sessions.reduce((acc, s) => acc.concat(s.mistakes || []), []);
  const totalMarks  = allMistakes.reduce((s, m) => s + (m.marks || 0), 0);
  const unfixed     = allMistakes.filter(m => !m.fixed).length;

  const ssEl = $('el-stat-sessions'); if (ssEl) ssEl.textContent = sessions.length;
  const tmEl = $('el-stat-total');    if (tmEl) tmEl.textContent = allMistakes.length;
  const mkEl = $('el-stat-marks');    if (mkEl) mkEl.textContent = totalMarks;
  const ufEl = $('el-stat-unfixed');  if (ufEl) ufEl.textContent = unfixed;

  const breakEl = $('el-subject-breakdown');
  if (!breakEl) return;
  if (!sessions.length) { breakEl.innerHTML = '<p class="empty-s">No data yet.</p>'; return; }

  const bySubject = {};
  sessions.forEach(s => {
    if (!bySubject[s.subject]) bySubject[s.subject] = { mistakes: 0, marks: 0, unfixed: 0 };
    (s.mistakes || []).forEach(m => {
      bySubject[s.subject].mistakes++;
      bySubject[s.subject].marks += (m.marks || 0);
      if (!m.fixed) bySubject[s.subject].unfixed++;
    });
  });

  breakEl.innerHTML = Object.entries(bySubject)
    .sort((a, b) => b[1].unfixed - a[1].unfixed)
    .map(([key, stats]) => {
      const subj = GCSE_SUBJECTS[key];
      if (!subj) return '';
      const fixedLabel = stats.unfixed > 0
        ? `<span class="el-subj-unfixed">${stats.unfixed} unfixed</span>`
        : `<span class="el-subj-done">&#10003; all fixed</span>`;
      return `
      <div class="el-subj-row">
        <span class="el-subj-icon">${subj.icon}</span>
        <div class="el-subj-info">
          <span class="el-subj-name">${_escHtml(subj.name)}</span>
          <div class="el-subj-stats">
            <span>${stats.mistakes} mistake${stats.mistakes !== 1 ? 's' : ''}</span>
            ${stats.marks > 0 ? `<span class="el-subj-marks">&#8722;${stats.marks}m</span>` : ''}
            ${fixedLabel}
          </div>
        </div>
      </div>`;
    }).join('');
}



// ─── QUICK LINKS ──────────────────────────────────────────
function _qlEnsure() {
  if (!Array.isArray(S.quickLinks)) S.quickLinks = [];
  while (S.quickLinks.length < 4) S.quickLinks.push({ emoji: '🔗', label: '', url: '' });
}
function _escHtml(s) {
  return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function _escAttr(s) {
  return (s || '').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function _shortenUrl(u) {
  try { return new URL(u).hostname.replace(/^www\./, ''); } catch(e) { return u.slice(0, 18); }
}

function renderQuickLinks() {
  const grid = $('ql-grid');
  if (!grid) return;
  _qlEnsure();
  grid.innerHTML = S.quickLinks.slice(0, 4).map((lk, i) =>
    lk.url
      ? `<a class="ql-link" href="${_escAttr(lk.url)}" target="_blank" rel="noopener noreferrer"
            title="${_escAttr(lk.label || lk.url)}">
           <span class="ql-emoji">${_escHtml(lk.emoji || '🔗')}</span>
           <span class="ql-lbl">${_escHtml(lk.label || _shortenUrl(lk.url))}</span>
         </a>`
      : `<button class="ql-empty" data-qi="${i}" aria-label="Add link ${i + 1}">+</button>`
  ).join('');
  grid.querySelectorAll('.ql-empty').forEach(btn => {
    btn.addEventListener('click', () => openQLModal(+btn.dataset.qi));
  });
}

function openQLModal(focusIdx) {
  _qlEnsure();
  $('ql-modal-body').innerHTML = S.quickLinks.slice(0, 4).map((lk, i) => `
    <div class="ql-row">
      <span class="ql-row-n">${i + 1}</span>
      <input class="field-in ql-e" id="ql-e-${i}" value="${_escAttr(lk.emoji || '🔗')}"
             maxlength="2" placeholder="🔗"/>
      <input class="field-in ql-l" id="ql-l-${i}" value="${_escAttr(lk.label)}"
             placeholder="Label"/>
      <input class="field-in ql-u" id="ql-u-${i}" value="${_escAttr(lk.url)}"
             placeholder="https://..." type="url"/>
    </div>`).join('');
  $('ql-modal').classList.add('open');
  if (focusIdx >= 0) setTimeout(() => { const el = $(`ql-u-${focusIdx}`); if (el) el.focus(); }, 40);
}

function closeQLModal() {
  $('ql-modal').classList.remove('open');
}

function saveQLModal() {
  _qlEnsure();
  for (let i = 0; i < 4; i++) {
    const emoji = ($(`ql-e-${i}`) ? $(`ql-e-${i}`).value.trim() : '') || '🔗';
    const label = $(`ql-l-${i}`) ? $(`ql-l-${i}`).value.trim() : '';
    let url = $(`ql-u-${i}`) ? $(`ql-u-${i}`).value.trim() : '';
    if (url && !/^https?:\/\//i.test(url)) url = 'https://' + url;
    S.quickLinks[i] = { emoji, label, url };
  }
  save();
  closeQLModal();
  renderQuickLinks();
  toast('Quick Links saved ✓');
}

function initQuickLinks() {
  $('ql-edit-btn').addEventListener('click', () => openQLModal(-1));
  $('ql-modal-cls').addEventListener('click', closeQLModal);
  $('ql-modal-cancel').addEventListener('click', closeQLModal);
  $('ql-modal-save').addEventListener('click', saveQLModal);
  renderQuickLinks();
}

// ─── INIT ─────────────────────────────────────────────────
// ─── THEME ──────────────────────────────────────────────
function initTheme() {
  const saved = localStorage.getItem('hf-theme') || 'dark';
  applyTheme(saved);
  document.querySelectorAll('.theme-swatch').forEach(sw => {
    sw.addEventListener('click', () => applyTheme(sw.dataset.theme));
  });
}

function applyTheme(name) {
  if (name === 'dark') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', name);
  }
  localStorage.setItem('hf-theme', name);
  document.querySelectorAll('.theme-swatch').forEach(s => {
    s.classList.toggle('active', s.dataset.theme === name);
  });
}

async function init() {
  load();
  await restoreMediaFromIDB(); // populate deck.media from IndexedDB before any rendering
  checkDailyReset();
  initTheme();

  // Random quote
  const [qt, qa] = QUOTES[Math.floor(Math.random()*QUOTES.length)];
  $('sb-quote').querySelector('.sq-text').textContent = `"${qt}"`;
  $('sb-quote').querySelector('.sq-auth').textContent = qa ? `— ${qa}` : '';

  initNav();
  initTopbar();
  initPomodoro();
  initFreeFocus();
  initCalendar();
  initTodos();
  initHabits();
  initQuickLinks();
  initFlashcards();
  initTimetable();
  initSleepJournal();
  initErrorLog();

  updateXPDisplay();
  updateStreakDisplay();
  renderDashboard();
  renderCalendar();
  renderHabits();
  renderTimetable();

  // Notifications
  if ('Notification' in window && Notification.permission==='default') {
    Notification.requestPermission();
  }

  // Refresh topbar date every minute
  setInterval(initTopbar, 60000);
}

document.addEventListener('DOMContentLoaded', init);
