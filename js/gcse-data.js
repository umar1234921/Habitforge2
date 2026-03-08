// ============================================================
// GCSE SPEC DATA — RAM'S EXAM COMMAND CENTER (FINAL 2026)
// Dates & Spec verified against official AQA/Edexcel/OCR 2026 Timetables.
// ============================================================

const GCSE_SUBJECTS = {

  // ── MATHS (Edexcel) ───────────────────────────────────────
  maths: {
    name: "Mathematics",
    board: "Edexcel",
    color: "#3b82f6",
    icon: "📐",
    exams: [
      { paper: "Paper 1 (Non-Calc)", date: "2026-05-14", time: "AM" },
      { paper: "Paper 2 (Calc)",     date: "2026-06-03", time: "AM" },
      { paper: "Paper 3 (Calc)",     date: "2026-06-10", time: "AM" },
    ],
    topics: [
      { id: "m1", topic: "Number", points: ["HCF/LCM", "Surds", "Standard Form", "Upper/Lower Bounds"]},
      { id: "m2", topic: "Algebra", points: ["Quadratic Formula", "Functions (Inverse/Composite)", "Sequences", "Algebraic Proof"]},
      { id: "m5", topic: "Geometry", points: ["Circle Theorems", "Sine/Cosine Rules", "Vectors", "Volume/Surface Area of Frustums"]},
    ],
  },

  // ── ENGLISH LITERATURE (Edexcel) ──────────────────────────
  englishLit: {
    name: "English Literature",
    board: "Edexcel",
    color: "#ec4899",
    icon: "📖",
    exams: [
      { paper: "Paper 1 (Shakespeare/Drama)", date: "2026-05-11", time: "AM" },
      { paper: "Paper 2 (Novel/Poetry)",     date: "2026-05-19", time: "AM" },
    ],
    topics: [
      { id: "lit4", topic: "Conflict Poetry (Edexcel Cluster)", points: [
        "'A Poison Tree' (Blake)",
        "'The Destruction of Sennacherib' (Byron)",
        "'Extract from The Prelude' (Wordsworth)",
        "'The Man He Killed' (Hardy)",
        "'Cousin Kate' (Rossetti)",
        "'Half-caste' (Agard)",
        "'Exposure' (Owen)",
        "'The Charge of the Light Brigade' (Tennyson)",
        "'Catrin' (Clarke)",
        "'War Photographer' (Satyamurti)",
        "'Belfast Confetti' (Carson)",
        "'The Class Game' (Casey)",
        "'Poppies' (Weir)",
        "'No Problem' (Zephaniah)",
        "'What Were They Like?' (Levertov)",
      ]},
    ],
  },

  // ── ENGLISH LANGUAGE (AQA) ────────────────────────────────
  englishLang: {
    name: "English Language",
    board: "AQA",
    color: "#f43f5e",
    icon: "✍",
    exams: [
      { paper: "Paper 1 (Fiction)",     date: "2026-05-21", time: "AM" },
      { paper: "Paper 2 (Non-Fiction)", date: "2026-06-05", time: "AM" },
    ],
  },

  // ── BIOLOGY (AQA Triple) ──────────────────────────────────
  biology: {
    name: "Biology",
    board: "AQA Triple",
    color: "#84cc16",
    icon: "🧬",
    exams: [
      { paper: "Paper 1", date: "2026-05-12", time: "PM" },
      { paper: "Paper 2", date: "2026-06-08", time: "AM" },
    ],
  },

  // ── CHEMISTRY (AQA Triple) ────────────────────────────────
  chemistry: {
    name: "Chemistry",
    board: "AQA Triple",
    color: "#10b981",
    icon: "🧪",
    exams: [
      { paper: "Paper 1", date: "2026-05-18", time: "AM" },
      { paper: "Paper 2", date: "2026-06-12", time: "AM" },
    ],
  },

  // ── PHYSICS (AQA Triple) ──────────────────────────────────
  physics: {
    name: "Physics",
    board: "AQA Triple",
    color: "#f59e0b",
    icon: "⚛",
    exams: [
      { paper: "Paper 1", date: "2026-06-02", time: "AM" },
      { paper: "Paper 2", date: "2026-06-15", time: "AM" },
    ],
  },

  // ── COMPUTER SCIENCE (OCR J277) ───────────────────────────
  computerScience: {
    name: "Computer Science",
    board: "OCR J277",
    color: "#06b6d4",
    icon: "💻",
    exams: [
      { paper: "Paper 1 (Systems)",  date: "2026-05-13", time: "PM" },
      { paper: "Paper 2 (Thinking)", date: "2026-05-19", time: "PM" },
    ],
  },

  // ── HISTORY (Edexcel) ─────────────────────────────────────
  history: {
    name: "History",
    board: "Edexcel",
    color: "#a78bfa",
    icon: "🏛",
    exams: [
      { paper: "Paper 1 (Medicine)",   date: "2026-05-15", time: "AM" },
      { paper: "Paper 2 (Cold War)",   date: "2026-06-04", time: "AM" },
      { paper: "Paper 3 (Germany)",    date: "2026-06-11", time: "AM" },
    ],
  },
  
  // ── GERMAN (AQA) ──────────────────────────────────────────
  german: {
    name: "German",
    board: "AQA",
    color: "#f97316",
    icon: "🇩🇪",
    exams: [
      { paper: "Listening & Reading", date: "2026-05-07", time: "PM" },
      { paper: "Writing",             date: "2026-05-14", time: "PM" },
    ],
  },

  // ── FURTHER MATHS (AQA L2) ────────────────────────────────
  furtherMaths: {
    name: "Further Maths (L2)",
    board: "AQA",
    color: "#8b5cf6",
    icon: "∑",
    exams: [
      { paper: "Paper 1", date: "2026-06-08", time: "PM" },
      { paper: "Paper 2", date: "2026-06-15", time: "PM" },
    ],
  },
};

// ── DATA PROCESSING LOGIC (Calendar & Sorting) ────────
const ALL_EXAM_DATES = [];
Object.entries(GCSE_SUBJECTS).forEach(([key, subj]) => {
  subj.exams.forEach(exam => {
    ALL_EXAM_DATES.push({
      ...exam,
      subject: subj.name,
      subjectKey: key,
      color: subj.color,
      icon: subj.icon
    });
  });
});
ALL_EXAM_DATES.sort((a, b) => new Date(a.date) - new Date(b.date));

// ── UTILITIES (Daily Planner Logic) ───────────────
function getDailyRecommendation() {
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const upcoming = ALL_EXAM_DATES.filter(e => e.date >= todayStr);
  const next = upcoming[0] || null;

  return {
    nextExam: next,
    daysUntil: next ? Math.ceil((new Date(next.date) - today) / 86400000) : 0,
    upcomingCount: upcoming.length
  };
}
