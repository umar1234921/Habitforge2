// ============================================================
// GCSE SPEC DATA — RAM'S EXAM COMMAND CENTER (SPEC-ACCURATE)
// Aligned to 2026 GCSE timetable and official specifications
// Boards: AQA, Edexcel, OCR
// ============================================================

const GCSE_SUBJECTS = {

  // ─────────────────────────────────
  // MATHEMATICS — Edexcel
  // ─────────────────────────────────
  maths: {
    name: "Mathematics",
    board: "Edexcel",
    color: "#3b82f6",
    icon: "📐",
    exams: [
      { paper: "Paper 1 (Non-Calculator)", date: "2026-05-14", time: "AM" },
      { paper: "Paper 2 (Calculator)", date: "2026-06-03", time: "AM" },
      { paper: "Paper 3 (Calculator)", date: "2026-06-10", time: "AM" },
    ],

    topics: [

      {
        id: "m1",
        topic: "Number",
        points: [
          "Integers, decimals and fractions",
          "Powers, roots and indices",
          "Standard form",
          "HCF and LCM",
          "Prime factorisation",
          "Percentages — increase, decrease, reverse",
          "Compound interest",
          "Ratio and proportion",
          "Bounds and error intervals"
        ]
      },

      {
        id: "m2",
        topic: "Algebra",
        points: [
          "Simplifying algebraic expressions",
          "Expanding and factorising",
          "Quadratic equations",
          "Solving linear equations and inequalities",
          "Simultaneous equations",
          "Sequences — nth term",
          "Functions — notation and inverse",
          "Algebraic proof"
        ]
      },

      {
        id: "m3",
        topic: "Graphs",
        points: [
          "Coordinates and straight line graphs",
          "Parallel and perpendicular gradients",
          "Quadratic graphs",
          "Cubic and reciprocal graphs",
          "Graph transformations"
        ]
      },

      {
        id: "m4",
        topic: "Ratio and Rates",
        points: [
          "Direct and inverse proportion",
          "Speed distance time",
          "Density mass volume",
          "Exchange rates"
        ]
      },

      {
        id: "m5",
        topic: "Geometry and Measures",
        points: [
          "Angles in polygons",
          "Bearings",
          "Circle theorems",
          "Area and perimeter",
          "Volume and surface area",
          "Pythagoras theorem",
          "Trigonometry",
          "Sine rule and cosine rule",
          "Vectors",
          "Transformations"
        ]
      },

      {
        id: "m6",
        topic: "Probability",
        points: [
          "Probability scale",
          "Sample space diagrams",
          "Tree diagrams",
          "Venn diagrams",
          "Conditional probability"
        ]
      },

      {
        id: "m7",
        topic: "Statistics",
        points: [
          "Averages — mean median mode",
          "Range",
          "Frequency tables",
          "Cumulative frequency graphs",
          "Box plots",
          "Histograms",
          "Scatter graphs"
        ]
      }

    ]
  },

  // ─────────────────────────────────
  // BIOLOGY — AQA Separate Science
  // ─────────────────────────────────
  biology: {
    name: "Biology",
    board: "AQA GCSE (Separate Science)",
    color: "#84cc16",
    icon: "🧬",

    exams: [
      { paper: "Paper 1", date: "2026-05-12", time: "PM" },
      { paper: "Paper 2", date: "2026-06-08", time: "AM" },
    ],

    topics: [

      {
        id: "bio1",
        topic: "Cell Biology",
        points: [
          "Animal and plant cells",
          "Cell specialisation",
          "Microscopy and magnification",
          "Mitosis",
          "Stem cells",
          "Diffusion",
          "Osmosis",
          "Active transport",
          "Required practical — osmosis"
        ]
      },

      {
        id: "bio2",
        topic: "Organisation",
        points: [
          "Digestive system",
          "Enzymes",
          "Heart structure",
          "Blood vessels",
          "Blood components",
          "Plant tissues",
          "Transpiration",
          "Translocation"
        ]
      },

      {
        id: "bio3",
        topic: "Infection and Response",
        points: [
          "Pathogens",
          "Communicable diseases",
          "Human defence systems",
          "Vaccination",
          "Antibiotics",
          "Drug testing"
        ]
      },

      {
        id: "bio4",
        topic: "Bioenergetics",
        points: [
          "Photosynthesis",
          "Limiting factors",
          "Required practical — photosynthesis rate",
          "Aerobic respiration",
          "Anaerobic respiration"
        ]
      },

      {
        id: "bio5",
        topic: "Homeostasis",
        points: [
          "Nervous system",
          "Hormonal coordination",
          "Blood glucose regulation",
          "Diabetes",
          "Kidney function",
          "Thermoregulation"
        ]
      },

      {
        id: "bio6",
        topic: "Inheritance Evolution",
        points: [
          "DNA structure",
          "Genes and chromosomes",
          "Meiosis",
          "Punnett squares",
          "Genetic disorders",
          "Natural selection",
          "Speciation"
        ]
      },

      {
        id: "bio7",
        topic: "Ecology",
        points: [
          "Ecosystems",
          "Food chains and webs",
          "Pyramids of biomass",
          "Biodiversity",
          "Human impact",
          "Required practical — quadrat sampling"
        ]
      }

    ]
  },

  // ─────────────────────────────────
  // CHEMISTRY — AQA Separate Science
  // ─────────────────────────────────
  chemistry: {
    name: "Chemistry",
    board: "AQA GCSE (Separate Science)",
    color: "#10b981",
    icon: "🧪",

    exams: [
      { paper: "Paper 1", date: "2026-05-18", time: "AM" },
      { paper: "Paper 2", date: "2026-06-12", time: "AM" },
    ],

    topics: [

      {
        id: "ch1",
        topic: "Atomic Structure",
        points: [
          "Atomic structure",
          "Isotopes",
          "Electronic configuration",
          "Periodic table development",
          "Group trends"
        ]
      },

      {
        id: "ch2",
        topic: "Bonding",
        points: [
          "Ionic bonding",
          "Covalent bonding",
          "Metallic bonding",
          "Giant covalent structures",
          "Properties of bonding"
        ]
      },

      {
        id: "ch3",
        topic: "Quantitative Chemistry",
        points: [
          "Relative formula mass",
          "Moles calculations",
          "Concentration",
          "Percentage yield",
          "Atom economy",
          "Limiting reactants"
        ]
      },

      {
        id: "ch4",
        topic: "Chemical Changes",
        points: [
          "Reactivity series",
          "Extraction of metals",
          "Electrolysis",
          "Acids bases and salts"
        ]
      },

      {
        id: "ch5",
        topic: "Energy Changes",
        points: [
          "Exothermic reactions",
          "Endothermic reactions",
          "Reaction profiles",
          "Bond energies"
        ]
      },

      {
        id: "ch6",
        topic: "Rates and Equilibrium",
        points: [
          "Rate of reaction",
          "Collision theory",
          "Catalysts",
          "Reversible reactions",
          "Le Chatelier principle"
        ]
      }

    ]
  }

};


// ─────────────────────────────
// FLATTEN EXAM LIST
// ─────────────────────────────

const ALL_EXAM_DATES = [];

Object.entries(GCSE_SUBJECTS).forEach(([key, subj]) => {

  subj.exams.forEach(exam => {

    ALL_EXAM_DATES.push({

      subject: subj.name,
      subjectKey: key,
      paper: exam.paper,
      date: exam.date,
      time: exam.time,
      color: subj.color,
      icon: subj.icon

    });

  });

});


// Correct chronological sorting
ALL_EXAM_DATES.sort((a,b)=> new Date(a.date) - new Date(b.date));
// ============================================================
// STUDY PHASES
// ============================================================

const STUDY_PHASES = [

  {
    name: "PHASE 1 — FOUNDATION",
    range: ["2026-03-01", "2026-04-03"],
    description: "Build core knowledge across subjects.",
    color: "#3b82f6",
    dailyHours: 3,
    focus: "Learn content + first retrieval",
    subjects: Object.keys(GCSE_SUBJECTS),
    atomicHabit: "Start with 2 minutes of work."
  },

  {
    name: "PHASE 2 — CONSOLIDATION",
    range: ["2026-04-04", "2026-04-24"],
    description: "Active recall and topic questions.",
    color: "#f59e0b",
    dailyHours: 5,
    focus: "Flashcards + exam questions",
    subjects: Object.keys(GCSE_SUBJECTS),
    atomicHabit: "Never miss twice."
  },

  {
    name: "PHASE 3 — PAST PAPERS",
    range: ["2026-04-25", "2026-05-10"],
    description: "Timed past papers and mark scheme review.",
    color: "#ef4444",
    dailyHours: 4,
    focus: "Exam practice",
    subjects: Object.keys(GCSE_SUBJECTS),
    atomicHabit: "Simulate real exam conditions."
  },

  {
    name: "PHASE 4 — EXAM PERIOD",
    range: ["2026-05-11", "2026-06-15"],
    description: "Light revision focused on upcoming exam.",
    color: "#10b981",
    dailyHours: 2,
    focus: "Review only next subject",
    subjects: [],
    atomicHabit: "Rest and sleep properly."
  }

];


// ============================================================
// DAILY RECOMMENDATION ENGINE
// ============================================================
// Returns:
// { phase, schedule, upcoming, daysUntilNext, next }
// ============================================================

function getDailyRecommendation() {

  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];

  const phase =
    STUDY_PHASES.find(p => todayStr >= p.range[0] && todayStr <= p.range[1]) ||
    STUDY_PHASES[STUDY_PHASES.length - 1];

  const upcoming = ALL_EXAM_DATES
    .filter(e => e.date >= todayStr)
    .sort((a,b)=> new Date(a.date) - new Date(b.date));

  const next = upcoming[0] || null;

  const daysUntilNext = next
    ? Math.ceil((new Date(next.date) - today) / 86400000)
    : null;

  const schedule = [];

  // ── If exam soon: focus only that subject ──
  if (daysUntilNext !== null && daysUntilNext <= 3) {

    schedule.push({

      time: "Morning (90 min)",
      task: `FINAL REVIEW — ${next.subject} (${next.paper})`,
      type: "exam-prep",
      tip: "Practice questions only. No new content."

    });

  }

  // ── Otherwise rotate subjects ──
  else {

    const keys = Object.keys(GCSE_SUBJECTS);

    const todayIndex = today.getDay() % keys.length;

    const subject1 = GCSE_SUBJECTS[keys[todayIndex]];
    const subject2 = GCSE_SUBJECTS[keys[(todayIndex + 1) % keys.length]];

    if (subject1) {

      schedule.push({

        time: "Morning (90 min deep work)",
        task: `${subject1.icon} ${subject1.name}`,
        type: keys[todayIndex],
        tip: phase.focus,
        subject: subject1

      });

    }

    if (subject2) {

      schedule.push({

        time: "Afternoon (90 min deep work)",
        task: `${subject2.icon} ${subject2.name}`,
        type: keys[(todayIndex + 1) % keys.length],
        tip: phase.focus,
        subject: subject2

      });

    }

  }

  return {

    phase,
    schedule,
    upcoming: upcoming.slice(0,5),
    daysUntilNext,
    next

  };

}
