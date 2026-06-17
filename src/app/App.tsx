import { useState, useEffect, useRef, useCallback } from "react";
import analyserImg from "@/imports/hero-bottom-img-1.png";
import fletcherImg from "@/imports/image.png";
import gretaImg from "@/imports/image-1.png";
import logoMedicine from "@/imports/logo-medicine.png";
import { ImageWithFallback } from "@/app/components/figma/ImageWithFallback";
import { motion, AnimatePresence } from "motion/react";
import {
  CheckCircle,
  XCircle,
  ChevronRight,
  ChevronLeft,
  Award,
  BookOpen,
  Activity,
  FlaskConical,
  Layers,
  ClipboardList,
  Download,
  RotateCcw,
  Clock,
  Target,
  TrendingUp,
  AlertTriangle,
  LogOut,
  MessageSquare,
  Lock,
  LockOpen,
} from "lucide-react";
import jsPDF from "jspdf";

// ─── SCORM API Wrapper ────────────────────────────────────────────────────────
function initSCORM() {
  const win = window as any;
  let api = win.API || win.API_1484_11 || null;
  if (!api) {
    try {
      api = (win.parent?.API) || (win.parent?.API_1484_11) || null;
    } catch {
      api = null;
    }
  }
  if (!api) return null;
  try {
    api.LMSInitialize?.("") || api.Initialize?.("");
    return api;
  } catch {
    return null;
  }
}

function scormSet(api: any, key: string, value: string) {
  if (!api) return;
  try {
    api.LMSSetValue?.(key, value) || api.SetValue?.(key, value);
    api.LMSCommit?.("") || api.Commit?.("");
  } catch {}
}

function scormGet(api: any, key: string): string {
  if (!api) return "";
  try {
    return api.LMSGetValue?.(key) || api.GetValue?.(key) || "";
  } catch {
    return "";
  }
}

function scormInteraction(
  api: any,
  n: number,
  id: string,
  type: string,
  response: string,
  correctPattern?: string,
  result?: string
) {
  if (!api) return;
  const base = `cmi.interactions.${n}`;
  scormSet(api, `${base}.id`, id);
  scormSet(api, `${base}.type`, type);
  scormSet(api, `${base}.student_response`, response);
  if (correctPattern !== undefined)
    scormSet(api, `${base}.correct_responses.0.pattern`, correctPattern);
  scormSet(api, `${base}.result`, result ?? "neutral");
}

function finishSCORM(api: any) {
  if (!api) return;
  try {
    api.LMSFinish?.("") || api.Terminate?.("");
  } catch {}
}

// ─── Types ────────────────────────────────────────────────────────────────────
type QuizOption = { text: string; correct: boolean; explanation: string };
type QuizQuestion = {
  question: string;
  options: QuizOption[];
  abgPanel?: ABGValues;
};
type ABGValues = {
  pH: string;
  paCO2: string;
  hco3: string;
  paO2: string;
  saO2: string;
};
type ScenarioChoice = {
  text: string;
  isCorrect: boolean;
  consequence: string;
};
type Scenario = {
  patientInfo: string;
  abg: ABGValues;
  choices: ScenarioChoice[];
};

// ─── Course Data ──────────────────────────────────────────────────────────────
const MODULES = [
  {
    id: "pre-survey",
    title: "Pre-Course Survey",
    icon: "MessageSquare",
    estimatedMinutes: 2,
    type: "survey",
  },
  {
    id: "intro",
    title: "Introduction to Blood Gas Analysis",
    icon: "BookOpen",
    estimatedMinutes: 10,
    type: "content",
  },
  {
    id: "normal-values",
    title: "Normal Values & Reference Ranges",
    icon: "Activity",
    estimatedMinutes: 12,
    type: "content",
  },
  {
    id: "systematic",
    title: "The Systematic Approach",
    icon: "Layers",
    estimatedMinutes: 8,
    type: "content",
  },
  {
    id: "disorders",
    title: "The Four Primary Disorders",
    icon: "FlaskConical",
    estimatedMinutes: 12,
    type: "content",
  },
  {
    id: "mixed",
    title: "Mixed Disorders",
    icon: "TrendingUp",
    estimatedMinutes: 8,
    type: "content",
  },
  {
    id: "scenarios",
    title: "Clinical Scenarios",
    icon: "ClipboardList",
    estimatedMinutes: 15,
    type: "scenarios",
  },
  {
    id: "assessment",
    title: "Final Assessment",
    icon: "Target",
    estimatedMinutes: 15,
    type: "quiz",
  },
  {
    id: "post-survey",
    title: "Post-Course Survey",
    icon: "MessageSquare",
    estimatedMinutes: 2,
    type: "survey",
  },
  {
    id: "certificate",
    title: "Certificate",
    icon: "Award",
    estimatedMinutes: 2,
    type: "certificate",
  },
];

const ICON_MAP: Record<string, any> = {
  BookOpen,
  Activity,
  Layers,
  FlaskConical,
  TrendingUp,
  ClipboardList,
  Target,
  MessageSquare,
  Award,
};

const SCENARIOS: Scenario[] = [
  {
    patientInfo:
      "67-year-old male with severe COPD, presenting with increased dyspnoea and confusion. RR 28, SpO₂ 84% on air.",
    abg: { pH: "7.28", paCO2: "9.6", hco3: "33", paO2: "6.4", saO2: "84%" },
    choices: [
      {
        text: "Respiratory acidosis with metabolic compensation - acute-on-chronic",
        isCorrect: true,
        consequence:
          "Correct. The elevated PaCO₂ drives the acidosis. The raised HCO₃⁻ (33 mmol/L) confirms chronic metabolic compensation - this patient retains bicarbonate over time. The degree of compensation is expected for chronic CO₂ retention. Treat with controlled oxygen therapy and NIV.",
      },
      {
        text: "Metabolic acidosis - likely lactic acidosis from hypoxia",
        isCorrect: false,
        consequence:
          "Not quite. While hypoxia is present, the primary driver here is CO₂ retention (PaCO₂ 9.6 kPa), not a metabolic process. The elevated HCO₃⁻ argues against primary metabolic acidosis. Reconsider the PaCO₂.",
      },
      {
        text: "Mixed respiratory and metabolic acidosis - needs urgent intubation",
        isCorrect: false,
        consequence:
          "Caution - premature. The HCO₃⁻ is elevated (not low), indicating compensation rather than a second acidotic process. Intubating COPD patients carries significant risk; NIV is first-line here.",
      },
    ],
  },
  {
    patientInfo:
      "22-year-old female presenting with palpitations, light-headedness, and tingling in hands. Anxious, RR 32.",
    abg: { pH: "7.54", paCO2: "3.5", hco3: "22", paO2: "13.1", saO2: "99%" },
    choices: [
      {
        text: "Respiratory alkalosis - acute hyperventilation",
        isCorrect: true,
        consequence:
          "Correct. Low PaCO₂ (3.5 kPa) from hyperventilation drives the alkalosis. Normal HCO₃⁻ indicates no metabolic compensation yet - this is acute. The clinical picture (anxiety, tingling) is classic for hyperventilation syndrome. Reassurance and controlled breathing are first-line.",
      },
      {
        text: "Metabolic alkalosis - possible vomiting history",
        isCorrect: false,
        consequence:
          "Incorrect. The PaCO₂ is low (3.5 kPa), not high. In metabolic alkalosis, the respiratory compensation would be hypoventilation (high PaCO₂) to retain CO₂. The primary driver here is the low PaCO₂.",
      },
      {
        text: "Respiratory alkalosis with metabolic compensation - chronic process",
        isCorrect: false,
        consequence:
          "Partially correct direction, but the HCO₃⁻ is normal (22 mmol/L), not reduced - indicating this is acute, not chronic. Chronic respiratory alkalosis would show HCO₃⁻ around 18–20 mmol/L.",
      },
    ],
  },
  {
    patientInfo:
      "19-year-old with type 1 diabetes, 2-day history of vomiting, polyuria, Kussmaul breathing. Blood glucose 28 mmol/L.",
    abg: { pH: "7.09", paCO2: "2.4", hco3: "5", paO2: "12.8", saO2: "97%" },
    choices: [
      {
        text: "Metabolic acidosis with respiratory compensation - likely DKA",
        isCorrect: true,
        consequence:
          "Excellent. Severely low HCO₃⁻ (5 mmol/L) drives the profound acidosis. The low PaCO₂ (2.4 kPa) reflects Kussmaul breathing - respiratory compensation. Using the UK equivalent of Winter's formula: expected PaCO₂ = 1.5 × 5 + 8 ± 2 = 15–17 mmHg (2.0–2.3 kPa). The PaCO₂ of 2.4 kPa is appropriate. Start IV fluids, insulin infusion, and electrolyte replacement.",
      },
      {
        text: "Respiratory acidosis - the Kussmaul breathing is the primary problem",
        isCorrect: false,
        consequence:
          "Incorrect. Kussmaul breathing is the compensation, not the cause. The PaCO₂ is low (2.4 kPa), indicating hyperventilation. A respiratory acidosis would show high PaCO₂. The HCO₃⁻ of 5 mmol/L is the primary abnormality.",
      },
      {
        text: "Mixed metabolic and respiratory acidosis",
        isCorrect: false,
        consequence:
          "Not in this case. The low PaCO₂ represents appropriate respiratory compensation, not a second respiratory acidosis. A mixed disorder would show a higher PaCO₂ than expected by Winter's formula.",
      },
    ],
  },
];

const QUIZ_QUESTIONS: QuizQuestion[] = [
  {
    question:
      "A patient has pH 7.32, PaCO₂ 6.9 kPa, HCO₃⁻ 26 mmol/L. What is the primary acid-base disorder?",
    abgPanel: {
      pH: "7.32",
      paCO2: "6.9",
      hco3: "26",
      paO2: "10.4",
      saO2: "95%",
    },
    options: [
      {
        text: "Respiratory acidosis",
        correct: true,
        explanation:
          "pH is low (acidosis) and PaCO₂ is elevated - the primary disorder is respiratory acidosis. HCO₃⁻ is slightly elevated, suggesting early/partial metabolic compensation.",
      },
      {
        text: "Metabolic acidosis",
        correct: false,
        explanation:
          "Metabolic acidosis is characterised by low HCO₃⁻, which is not the case here (HCO₃⁻ 26 mmol/L). The elevated PaCO₂ points to respiratory cause.",
      },
      {
        text: "Respiratory alkalosis",
        correct: false,
        explanation:
          "Alkalosis requires pH > 7.45. This pH of 7.32 is acidotic.",
      },
      {
        text: "Metabolic alkalosis",
        correct: false,
        explanation:
          "Metabolic alkalosis requires high HCO₃⁻ and pH > 7.45. Neither is present here.",
      },
    ],
  },
  {
    question:
      "A 45-year-old with known type 1 diabetes is brought in confused and tachypnoeic. Interpret this ABG and identify the most likely diagnosis.",
    abgPanel: { pH: "7.18", paCO2: "3.1", hco3: "8", paO2: "12.8", saO2: "97%" },
    options: [
      {
        text: "Metabolic acidosis with respiratory compensation - likely DKA",
        correct: true,
        explanation:
          "pH is low (acidosis). HCO₃⁻ is severely reduced (8 mmol/L), making this a metabolic acidosis. The PaCO₂ is also low (3.1 kPa) - the lungs are compensating by blowing off CO₂ (Kussmaul breathing). In a known type 1 diabetic this pattern strongly suggests DKA.",
      },
      {
        text: "Respiratory acidosis - hypoventilation from confusion",
        correct: false,
        explanation:
          "Respiratory acidosis requires a high PaCO₂. Here PaCO₂ is low (3.1 kPa), meaning the patient is hyperventilating, not hypoventilating. The low HCO₃⁻ is the primary abnormality.",
      },
      {
        text: "Mixed respiratory and metabolic alkalosis",
        correct: false,
        explanation:
          "Alkalosis requires pH > 7.45. This patient has a pH of 7.18 - severe acidosis. Both the pH and HCO₃⁻ point firmly to acidosis.",
      },
      {
        text: "Metabolic acidosis - no compensation present",
        correct: false,
        explanation:
          "Compensation is present - the low PaCO₂ (3.1 kPa) reflects the lungs working to blow off CO₂ and raise pH. This is the expected respiratory response to a metabolic acidosis.",
      },
    ],
  },
  {
    question:
      "Which condition is most likely to produce a HIGH anion gap metabolic acidosis?",
    options: [
      {
        text: "Diabetic ketoacidosis",
        correct: true,
        explanation:
          "DKA produces ketoacid accumulation, increasing unmeasured anions and raising the anion gap. The MUDPILES mnemonic covers high anion gap causes: Methanol, Uraemia, DKA, Propylene glycol, Isoniazid/Iron, Lactic acidosis, Ethylene glycol, Salicylates.",
      },
      {
        text: "Diarrhoea",
        correct: false,
        explanation:
          "Diarrhoea causes bicarbonate loss, producing a NORMAL anion gap (hyperchloraemic) metabolic acidosis.",
      },
      {
        text: "Renal tubular acidosis",
        correct: false,
        explanation:
          "RTA causes bicarbonate wasting or impaired acid excretion, typically producing a normal anion gap metabolic acidosis.",
      },
      {
        text: "Vomiting",
        correct: false,
        explanation:
          "Vomiting causes HCl loss, leading to metabolic ALKALOSIS, not acidosis.",
      },
    ],
  },
  {
    question:
      "A mechanically ventilated patient has pH 7.48, PaCO₂ 4.0 kPa, HCO₃⁻ 22 mmol/L. What should you do?",
    abgPanel: { pH: "7.48", paCO2: "4.0", hco3: "22", paO2: "14.2", saO2: "99%" },
    options: [
      {
        text: "Reduce the respiratory rate - patient is over-ventilated",
        correct: true,
        explanation:
          "The low PaCO₂ from excessive ventilation is causing respiratory alkalosis. Reducing the ventilator rate will allow CO₂ to rise back to normal range, correcting the pH.",
      },
      {
        text: "Increase the tidal volume - patient needs more ventilation",
        correct: false,
        explanation:
          "Increasing tidal volume would worsen the respiratory alkalosis by blowing off even more CO₂.",
      },
      {
        text: "Give sodium bicarbonate IV",
        correct: false,
        explanation:
          "Bicarbonate treats metabolic acidosis, not respiratory alkalosis. This would worsen the alkalosis.",
      },
      {
        text: "No action needed - values are within normal limits",
        correct: false,
        explanation:
          "pH 7.48 and PaCO₂ 4.0 kPa are both outside normal range (pH 7.35–7.45, PaCO₂ 4.7–6.0 kPa). Action is required.",
      },
    ],
  },
  {
    question:
      "Which ABG pattern suggests chronic respiratory acidosis with adequate metabolic compensation?",
    abgPanel: undefined,
    options: [
      {
        text: "pH 7.36, PaCO₂ 7.7 kPa, HCO₃⁻ 32 mmol/L",
        correct: true,
        explanation:
          "Near-normal pH despite elevated PaCO₂, with significantly raised HCO₃⁻ - hallmark of chronic respiratory acidosis with full metabolic compensation. The kidneys have retained bicarbonate to buffer the chronic CO₂ retention.",
      },
      {
        text: "pH 7.20, PaCO₂ 8.0 kPa, HCO₃⁻ 23 mmol/L",
        correct: false,
        explanation:
          "This is acute respiratory acidosis - HCO₃⁻ is normal, meaning the kidneys haven't had time to compensate. The acidosis is severe and uncompensated.",
      },
      {
        text: "pH 7.42, PaCO₂ 5.3 kPa, HCO₃⁻ 26 mmol/L",
        correct: false,
        explanation:
          "This is essentially normal - no significant acid-base disorder.",
      },
      {
        text: "pH 7.48, PaCO₂ 4.0 kPa, HCO₃⁻ 22 mmol/L",
        correct: false,
        explanation:
          "This is respiratory alkalosis, not respiratory acidosis.",
      },
    ],
  },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function ABGPanel({ values }: { values: ABGValues }) {
  const fields = [
    { label: "pH", value: values.pH, normal: "7.35–7.45" },
    { label: "PaCO₂", value: values.paCO2, normal: "4.7–6.0 kPa" },
    { label: "HCO₃⁻", value: values.hco3, normal: "22–26 mmol/L" },
    { label: "PaO₂", value: values.paO2, normal: "10.6–13.3 kPa" },
    { label: "SaO₂", value: values.saO2, normal: "95–100%" },
  ];
  return (
    <div className="rounded-lg border border-border bg-[#0D1B2A] text-white p-4 font-mono text-sm my-4">
      <div className="text-xs text-muted-foreground mb-3 uppercase tracking-widest font-sans">
        ABG Report
      </div>
      <div className="grid grid-cols-3 gap-y-2 gap-x-4">
        {fields.map((f) => (
          <div key={f.label} className="flex flex-col">
            <span className="text-[10px] uppercase tracking-widest text-slate-400">
              {f.label}
            </span>
            <span className="text-lg font-medium text-[#4DD9E0]">
              {f.value}
            </span>
            <span className="text-[10px] text-slate-500">{f.normal}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function NormalValueGauge({
  label,
  min,
  max,
  normalMin,
  normalMax,
  unit,
  color,
  invertColors = false,
}: {
  label: string;
  min: number;
  max: number;
  normalMin: number;
  normalMax: number;
  unit: string;
  color: string;
  invertColors?: boolean;
}) {
  const range = max - min;
  const normalLeftPct = ((normalMin - min) / range) * 100;
  const normalWidthPct = ((normalMax - normalMin) / range) * 100;
  const midPct = ((normalMin + normalMax) / 2 - min) / range * 100;

  const leftColor = invertColors ? "bg-blue-500/20" : "bg-red-500/20";
  const rightColor = invertColors ? "bg-red-500/20" : "bg-blue-500/20";
  const leftLabel = invertColors ? "text-blue-400" : "text-red-400";
  const rightLabel = invertColors ? "text-red-400" : "text-blue-400";

  return (
    <div className="bg-card rounded-lg p-4 border border-border">
      <div className="flex justify-between items-baseline mb-3">
        <span className="font-semibold text-sm text-foreground">{label}</span>
        <span className="font-mono text-xs text-muted-foreground">{unit}</span>
      </div>

      {/* Track */}
      <div className="relative h-4 bg-muted rounded-full mb-2">
        <div className={`absolute inset-y-0 left-0 rounded-l-full ${leftColor}`} style={{ width: `${normalLeftPct}%` }} />
        <div className={`absolute inset-y-0 right-0 rounded-r-full ${rightColor}`} style={{ left: `${normalLeftPct + normalWidthPct}%` }} />
        {/* Normal zone */}
        <motion.div
          className="absolute inset-y-0 rounded-full"
          style={{ backgroundColor: color, left: `${normalLeftPct}%`, opacity: 0.85 }}
          initial={{ width: 0 }}
          animate={{ width: `${normalWidthPct}%` }}
          transition={{ duration: 0.7, ease: "easeOut" }}
        />
        {/* Needle marker at midpoint */}
        <motion.div
          className="absolute top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-full bg-white shadow-sm"
          style={{ left: `${midPct}%`, marginLeft: -1 }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7 }}
        />
      </div>

      {/* Labels */}
      <div className="flex justify-between text-[10px] font-mono mt-1">
        <span className={leftLabel}>{min}</span>
        <span className="text-center" style={{ color }}>
          {normalMin}–{normalMax} <span className="text-muted-foreground">(normal)</span>
        </span>
        <span className={rightLabel}>{max}</span>
      </div>
    </div>
  );
}

function StepCard({
  step,
  title,
  description,
  detail,
  isActive,
  isDone,
  onClick,
}: {
  step: number;
  title: string;
  description: string;
  detail: string;
  isActive: boolean;
  isDone: boolean;
  onClick: () => void;
}) {
  return (
    <motion.div
      layout
      onClick={onClick}
      className={`rounded-lg border cursor-pointer transition-all duration-200 overflow-hidden ${
        isActive
          ? "border-primary bg-primary/5 shadow-sm"
          : isDone
          ? "border-border bg-card opacity-80"
          : "border-border bg-card hover:border-primary/40"
      }`}
    >
      <div className="flex items-start gap-4 p-4">
        <div
          className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-mono font-medium ${
            isDone
              ? "bg-primary text-primary-foreground"
              : isActive
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground"
          }`}
        >
          {isDone ? <CheckCircle size={14} /> : step}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-foreground">{title}</div>
          <div className="text-sm text-muted-foreground mt-0.5">
            {description}
          </div>
          <AnimatePresence>
            {isActive && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="overflow-hidden"
              >
                <div className="mt-3 pt-3 border-t border-border text-sm text-foreground leading-relaxed">
                  {detail}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}

function DisorderCard({
  name,
  primary,
  compensation,
  example,
  phColor,
}: {
  name: string;
  primary: string;
  compensation: string;
  example: string;
  phColor: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <motion.div
      layout
      className="rounded-lg border border-border bg-card overflow-hidden cursor-pointer hover:border-primary/50 transition-colors"
      onClick={() => setOpen((v) => !v)}
    >
      <div className="flex items-center gap-3 p-4">
        <div
          className="w-2 h-10 rounded-full flex-shrink-0"
          style={{ backgroundColor: phColor }}
        />
        <div className="flex-1">
          <div className="font-medium text-foreground">{name}</div>
          <div className="text-xs text-muted-foreground font-mono mt-0.5">
            {primary}
          </div>
        </div>
        <ChevronRight
          size={16}
          className={`text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`}
        />
      </div>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: "auto" }}
            exit={{ height: 0 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 border-t border-border pt-3 space-y-2 text-sm">
              <div>
                <span className="text-muted-foreground">Compensation: </span>
                <span className="text-foreground">{compensation}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Example: </span>
                <span className="text-foreground">{example}</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Module Content ───────────────────────────────────────────────────────────

function IntroModule() {
  return (
    <div className="space-y-6">
      <div className="text-muted-foreground leading-relaxed">A Blood Gas analysis is one of the most clinically powerful investigations available at the bedside. It provides real-time data on respiratory function, acid-base status, and oxygenation - information that is essential in managing acutely unwell / critically ill patients. Blood gas analysis can be performed on arterial, capillary, or venous samples. In this resource, we will be focusing on      <span className="font-bold">Arterial Blood Gases</span>.</div>

      <div className="rounded-lg bg-card border border-border p-5">
        <h3 className="font-semibold text-foreground mb-3">
          When do we order an ABG?
        </h3>
        <ul className="space-y-2 text-sm text-muted-foreground">
          {[
            "Acute respiratory failure or deterioration (e.g. COPD exacerbation)",
            "Assessment of ventilation in mechanically ventilated patients (e.g. post-op / critical care)",
            "Evaluation of metabolic derangements (DKA, shock, renal failure)",
            "Monitoring response to treatment (e.g. checking if NIV is reducing hypercapnia)",
            "Pre-operative assessment in high-risk patients",
          ].map((item) => (
            <li key={item} className="flex gap-2 items-start">
              <span className="text-primary mt-0.5">→</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-lg bg-card border border-border p-5">
        <h3 className="font-semibold text-foreground mb-3">
          What does an ABG measure?
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          {[
            {
              param: "pH",
              desc: "Hydrogen ion concentration - reflects overall acid-base status",
            },
            {
              param: "PaCO₂",
              desc: "Partial pressure of arterial CO₂ - respiratory component",
            },
            {
              param: "HCO₃⁻",
              desc: "Bicarbonate - metabolic component (calculated)",
            },
            {
              param: "PaO₂",
              desc: "Partial pressure of arterial oxygen",
            },
            {
              param: "SaO₂",
              desc: "Arterial oxygen saturation (handy if pulse oximeter not picking up signal)",
            },
            {
              param: "Base Excess",
              desc: "Amount of base needed to correct pH - metabolic indicator",
            },
            {
              param: "Glucose",
              desc: "Blood glucose - identifies hypoglycaemia or hyperglycaemia at the bedside",
            },
            {
              param: "Lactate",
              desc: "Marker of tissue hypoperfusion - elevated in sepsis, shock, and ischaemia",
            },
            {
              param: "Haemoglobin Tests",
              desc: "Haemoglobin level, Carboxyhaemoglobin (COHb), Methaemoglobin (MetHb)",
            },
            {
              param: "Electrolytes",
              desc: "Na⁺, K⁺, Cl⁻, Ca²⁺ - essential for acid-base correction and clinical management",
            },
          ].map((item) => (
            <div
              key={item.param}
              className="flex flex-col gap-1 p-3 rounded-md bg-muted/50"
            >
              <span className="font-mono font-medium text-primary text-sm">
                {item.param}
              </span>
              <span className="text-muted-foreground">{item.desc}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-5">
        <h3 className="font-semibold text-foreground mb-2">Why haemoglobin tests on a blood gas matter</h3>
        <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
          Blood gas analysers report haemoglobin and its dysfunctional forms - findings that a standard FBC or pulse oximeter will miss entirely.
        </p>
        <div className="space-y-3 text-sm">
          {[
            {
              param: "Haemoglobin (Hb)",
              color: "#0A6E74",
              detail: "A rapid bedside Hb estimate. Useful in acute settings where you need a quick sense of oxygen-carrying capacity before formal FBC results return. Remember: a patient can have a normal SaO₂ but severely compromised oxygen delivery if Hb is critically low.",
            },
            {
              param: "Carboxyhaemoglobin (COHb)",
              color: "#E8534A",
              detail: "Carbon monoxide binds haemoglobin with ~240× the affinity of oxygen, producing COHb. Pulse oximetry cannot distinguish COHb from oxyhaemoglobin - SpO₂ will look falsely normal even in severe CO poisoning. ABG (or co-oximetry) is essential for diagnosis. Normal COHb is < 3% (< 10% in smokers). Levels > 25% indicate severe poisoning.",
            },
            {
              param: "Methaemoglobin (MetHb)",
              color: "#F5A623",
              detail: "Methaemoglobin forms when iron in haem is oxidised from Fe²⁺ to Fe³⁺, which cannot carry oxygen. Causes cyanosis with a paradoxically normal PaO₂ - the oxygen is in the plasma but can't be picked up by Hb. Pulse oximetry again misreads this, typically reading SpO₂ around 85% regardless of true severity. Common causes: dapsone, benzocaine, nitrites, prilocaine.",
            },
          ].map((item) => (
            <div key={item.param} className="flex gap-3 p-3 rounded-md bg-muted/50">
              <div className="w-1 rounded-full flex-shrink-0 mt-1" style={{ backgroundColor: item.color, minHeight: 16 }} />
              <div>
                <div className="font-medium text-foreground mb-1 font-mono text-xs" style={{ color: item.color }}>{item.param}</div>
                <div className="text-muted-foreground leading-relaxed">{item.detail}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 rounded-md bg-primary/10 border border-primary/20 p-3 text-xs text-foreground">
          <strong>Key point:</strong> Both COHb and MetHb cause a "saturation gap" - SpO₂ on the pulse oximeter looks acceptable, but the patient is clinically hypoxic. If you suspect either, an ABG with co-oximetry is the only way to diagnose it.
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-5">
        <h3 className="font-semibold text-foreground mb-3">ABG vs VBG vs CBG - which sample do I need?</h3>
        <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
          Not every clinical question requires an arterial sample. Choosing the right sample type reduces patient discomfort and procedural risk.
        </p>
        <div className="space-y-3">
          {[
            {
              label: "ABG",
              full: "Arterial Blood Gas",
              color: "#0A6E74",
              site: "Radial, brachial, or femoral artery",
              use: "When you need accurate PaO₂ and PaCO₂ - i.e. when oxygenation or ventilation status is the clinical question. Essential in respiratory failure, mechanical ventilation, and when precise CO₂ monitoring matters.",
              limitations: "Painful, arterial puncture risk (haematoma, vasospasm). Requires Allen's test for radial approach.",
            },
            {
              label: "VBG",
              full: "Venous Blood Gas",
              color: "#1A9DA6",
              site: "Peripheral vein (or central line)",
              use: "Sufficient for most acid-base questions - pH, HCO₃⁻, lactate, glucose, and electrolytes correlate well with arterial values. Ideal in DKA monitoring, sepsis, and when repeated sampling is needed. Much easier and less painful.",
              limitations: "PvO₂ and PvCO₂ do not reflect pulmonary gas exchange - cannot assess oxygenation. VBG CO₂ runs ~0.8–1.0 kPa higher than arterial.",
            },
            {
              label: "CBG",
              full: "Capillary Blood Gas",
              color: "#27AE60",
              site: "Fingertip or earlobe (after warming)",
              use: "Commonly used in paediatrics and for outpatient/community monitoring. Provides a reasonable estimate of acid-base status and CO₂ when arterial access is difficult. Earlobe CBG is commonly used in respiratory clinics for CO₂ monitoring in COPD.",
              limitations: "Requires good peripheral perfusion. Less reliable in shocked or peripherally shut-down patients. PO₂ values are unreliable.",
            },
          ].map((item) => (
            <div key={item.label} className="rounded-lg border border-border overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-2.5" style={{ backgroundColor: item.color + "18" }}>
                <span className="font-mono font-bold text-sm" style={{ color: item.color }}>{item.label}</span>
                <span className="text-xs text-muted-foreground">{item.full}</span>
                <span className="ml-auto text-xs text-muted-foreground font-mono">{item.site}</span>
              </div>
              <div className="px-4 py-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <div className="font-medium text-foreground mb-1">When to use</div>
                  <div className="text-muted-foreground leading-relaxed">{item.use}</div>
                </div>
                <div>
                  <div className="font-medium text-foreground mb-1">Limitations</div>
                  <div className="text-muted-foreground leading-relaxed">{item.limitations}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
        <strong className="text-foreground">Sample site (ABG):</strong> Blood is typically drawn from the radial
        artery (after Allen's test), brachial artery, or femoral artery. It
        must be analysed within 15–30 minutes to prevent ex vivo metabolism
        from affecting results.
      </div>
    </div>
  );
}

// ─── Acid Equilibrium Simulator ──────────────────────────────────────────────

function AcidEquilibriumSimulator() {
  const [co2Level, setCo2Level] = useState(50); // 0–100 maps to 2–12 kPa
  const [ketoneLevel, setKetoneLevel] = useState(0); // 0–100 maps to 0–4

  const co2kPa = 2 + (co2Level / 100) * 10;
  const ketones = (ketoneLevel / 100) * 4;
  const pH = Math.max(6.8, Math.min(7.7,
    7.4 - (co2kPa - 5.3) * 0.065 - ketones * 0.12
  ));

  const pHLabel =
    pH < 7.2 ? "Severe acidosis"
    : pH < 7.35 ? "Acidosis"
    : pH > 7.55 ? "Severe alkalosis"
    : pH > 7.45 ? "Alkalosis"
    : "Normal range";

  const pHColor =
    pH < 7.35 ? "#E8534A"
    : pH > 7.45 ? "#1A9DA6"
    : "#27AE60";

  // Equilibrium shift: positive = rightward (more H⁺), negative = leftward
  const shift = (co2kPa - 5.3) * 0.4 + ketones * 0.5;
  const arrowRight = Math.min(1, Math.max(0, 0.5 + shift * 0.4));
  const arrowLeft = 1 - arrowRight;

  return (
    <div className="rounded-lg bg-card border border-border p-5 space-y-5">
      <div>
        <h3 className="font-semibold text-foreground mb-1">Acid Equilibrium Simulator</h3>
        <p className="text-xs text-muted-foreground">
          Adjust CO₂ and ketone levels to see how they shift the equilibrium and drive acidosis or alkalosis.
        </p>
      </div>

      {/* Chemical equation */}
      <div className="rounded-lg bg-[#0D1B2A] p-4 text-center">
        <div className="flex items-center justify-center gap-1 text-sm font-mono flex-wrap">
          {[
            { text: "CO₂", color: co2Level > 55 ? "#E8534A" : co2Level < 45 ? "#1A9DA6" : "#4DD9E0" },
            { text: " + H₂O", color: "#94a3b8" },
            { text: " ⇌ ", color: "#94a3b8" },
            { text: "H₂CO₃", color: "#94a3b8" },
            { text: " ⇌ ", color: "#94a3b8" },
            { text: "H⁺", color: shift > 0.1 ? "#E8534A" : shift < -0.1 ? "#1A9DA6" : "#4DD9E0" },
            { text: " + HCO₃⁻", color: "#27AE60" },
          ].map((part, i) => (
            <span key={i} style={{ color: part.color }}>{part.text}</span>
          ))}
        </div>
        {/* Equilibrium arrow bar */}
        <div className="mt-3 flex items-center gap-2">
          <span className="text-[10px] text-slate-400 font-mono">← alkalosis</span>
          <div className="flex-1 h-2 rounded-full bg-slate-800 relative overflow-hidden">
            <motion.div
              className="absolute top-0 h-full rounded-full"
              animate={{ left: `${(1 - arrowRight) * 100 * 0.5}%`, width: `${arrowRight * 100}%` }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              style={{ background: `linear-gradient(90deg, #1A9DA6, ${pHColor}, #E8534A)` }}
            />
            {/* Normal zone marker */}
            <div className="absolute top-0 h-full border-x border-[#27AE60]/40 left-[40%] w-[20%]" />
          </div>
          <span className="text-[10px] text-slate-400 font-mono">acidosis →</span>
        </div>
        {ketoneLevel > 10 && (
          <div className="mt-2 text-[11px] text-amber-400 font-sans">
            + Ketoacids (β-hydroxybutyrate, acetoacetate) also directly contribute H⁺
          </div>
        )}
      </div>

      {/* Live pH display */}
      <div className="flex items-center gap-4">
        <div
          className="text-4xl font-mono font-bold transition-colors duration-300"
          style={{ color: pHColor }}
        >
          {pH.toFixed(2)}
        </div>
        <div>
          <div className="text-sm font-medium text-foreground">{pHLabel}</div>
          <div className="text-xs text-muted-foreground">Arterial pH</div>
        </div>
        <div className="ml-auto flex flex-col gap-1 text-right text-xs text-muted-foreground font-mono">
          <span>PaCO₂ {co2kPa.toFixed(1)} kPa</span>
          <span>Ketones {ketones.toFixed(1)} mmol/L</span>
        </div>
      </div>

      {/* Sliders */}
      <div className="space-y-4">
        <div>
          <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
            <span>PaCO₂ (respiratory)</span>
            <span className="font-mono">{co2kPa.toFixed(1)} kPa</span>
          </div>
          <input
            type="range" min={0} max={100} value={co2Level}
            onChange={e => setCo2Level(Number(e.target.value))}
            className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
            style={{ accentColor: "#0A6E74" }}
          />
          <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
            <span>2.0 kPa - alkalosis</span>
            <span>Normal 4.7–6.0</span>
            <span>12.0 kPa - acidosis</span>
          </div>
        </div>

        <div>
          <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
            <span>Ketone level (metabolic)</span>
            <span className="font-mono">{ketones.toFixed(1)} mmol/L</span>
          </div>
          <input
            type="range" min={0} max={100} value={ketoneLevel}
            onChange={e => setKetoneLevel(Number(e.target.value))}
            className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
            style={{ accentColor: "#F5A623" }}
          />
          <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
            <span>Absent</span>
            <span>Mild (&lt;1.5)</span>
            <span>Severe DKA (&gt;3)</span>
          </div>
        </div>
      </div>

      <div className="text-xs text-muted-foreground border-t border-border pt-3">
        <strong className="text-foreground">CO₂ + H₂O ⇌ H₂CO₃ ⇌ H⁺ + HCO₃⁻ </strong>
        - Rising CO₂ or ketoacids push this equilibrium rightward, generating more H⁺ and lowering pH. Falling CO₂ (hyperventilation) or falling ketones shift it leftward, raising pH.
      </div>
    </div>
  );
}

// ─── Renal Homeostasis Tabs ───────────────────────────────────────────────────

function RenalHomeostasisTabs() {
  const [activeTab, setActiveTab] = useState(0);

  const tabs = [
    { label: "HCO₃⁻ Reabsorption", short: "Bicarbonate" },
    { label: "H⁺ Secretion", short: "H⁺ Secretion" },
    { label: "Response Timeline", short: "Timeline" },
  ];

  const content = [
    // Tab 0: HCO₃⁻ Reabsorption
    <div className="space-y-4" key="hco3">
      <p className="text-sm text-muted-foreground leading-relaxed">
        The proximal convoluted tubule (PCT) reclaims ~85% of filtered bicarbonate. In acidosis this process is upregulated - more HCO₃⁻ is retained, raising blood pH.
      </p>
      {/* SVG diagram */}
      <div className="rounded-lg bg-[#0D1B2A] p-4">
        <svg viewBox="0 0 320 140" className="w-full" style={{ maxHeight: 160 }}>
          {/* Tubule lumen */}
          <rect x="10" y="30" width="200" height="80" rx="8" fill="none" stroke="#1A9DA6" strokeWidth="1.5" strokeDasharray="4 3"/>
          <text x="105" y="22" textAnchor="middle" fill="#4DD9E0" fontSize="9" fontFamily="monospace">Proximal Tubule Lumen</text>
          {/* Blood side */}
          <rect x="230" y="30" width="80" height="80" rx="8" fill="#0A6E74" fillOpacity="0.15" stroke="#0A6E74" strokeWidth="1.5"/>
          <text x="270" y="22" textAnchor="middle" fill="#27AE60" fontSize="9" fontFamily="monospace">Blood</text>
          {/* Filtered HCO3 in lumen */}
          <text x="60" y="72" fill="#4DD9E0" fontSize="10" fontFamily="monospace">HCO₃⁻</text>
          <text x="52" y="85" fill="#94a3b8" fontSize="8" fontFamily="monospace">(filtered)</text>
          {/* Arrow across */}
          <path d="M 140 68 L 220 68" stroke="#27AE60" strokeWidth="2" markerEnd="url(#arr)"/>
          <defs>
            <marker id="arr" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
              <path d="M0,0 L6,3 L0,6 Z" fill="#27AE60"/>
            </marker>
          </defs>
          <text x="155" y="62" fill="#27AE60" fontSize="8" fontFamily="monospace">reabsorbed</text>
          {/* Blood HCO3 */}
          <text x="240" y="72" fill="#27AE60" fontSize="10" fontFamily="monospace">HCO₃⁻</text>
          {/* H+ secretion note */}
          <text x="60" y="105" fill="#E8534A" fontSize="8" fontFamily="monospace">+ H⁺ secreted →</text>
          <text x="60" y="116" fill="#94a3b8" fontSize="7" fontFamily="monospace">drives reclamation</text>
        </svg>
      </div>
      <div className="rounded-md bg-primary/10 border border-primary/20 p-3 text-xs text-foreground">
        <strong>In acidosis:</strong> Upregulation of Na⁺/H⁺ exchangers and H⁺-ATPases secretes more H⁺ into the tubule, indirectly reclaiming more HCO₃⁻ and raising plasma bicarbonate over hours–days.
      </div>
    </div>,

    // Tab 1: H⁺ Secretion
    <div className="space-y-4" key="h">
      <p className="text-sm text-muted-foreground leading-relaxed">
        Intercalated cells in the distal tubule and collecting duct actively secrete H⁺ into the filtrate, where it combines with buffers for excretion.
      </p>
      <div className="rounded-lg bg-[#0D1B2A] p-4">
        <svg viewBox="0 0 320 150" className="w-full" style={{ maxHeight: 170 }}>
          {/* Cell */}
          <rect x="100" y="20" width="120" height="110" rx="6" fill="#0A6E74" fillOpacity="0.2" stroke="#0A6E74" strokeWidth="1.5"/>
          <text x="160" y="14" textAnchor="middle" fill="#4DD9E0" fontSize="9" fontFamily="monospace">Intercalated Cell</text>
          {/* Lumen left */}
          <text x="40" y="14" textAnchor="middle" fill="#94a3b8" fontSize="9" fontFamily="monospace">Lumen</text>
          <rect x="0" y="20" width="95" height="110" rx="4" fill="none" stroke="#1A9DA6" strokeWidth="1" strokeDasharray="4 3"/>
          {/* Blood right */}
          <text x="275" y="14" textAnchor="middle" fill="#27AE60" fontSize="9" fontFamily="monospace">Blood</text>
          <rect x="225" y="20" width="90" height="110" rx="4" fill="#27AE60" fillOpacity="0.08" stroke="#27AE60" strokeWidth="1"/>
          {/* H+ arrow out to lumen */}
          <path d="M100 65 L20 65" stroke="#E8534A" strokeWidth="2" markerEnd="url(#arrR)"/>
          <defs>
            <marker id="arrR" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
              <path d="M6,0 L0,3 L6,6 Z" fill="#E8534A"/>
            </marker>
          </defs>
          <text x="160" y="60" fill="#E8534A" fontSize="9" fontFamily="monospace" textAnchor="middle">H⁺</text>
          <text x="160" y="71" fill="#94a3b8" fontSize="7" fontFamily="monospace" textAnchor="middle">secreted</text>
          {/* NH3 + H → NH4 */}
          <text x="40" y="90" fill="#94a3b8" fontSize="8" fontFamily="monospace">NH₃ + H⁺</text>
          <text x="40" y="102" fill="#F5A623" fontSize="8" fontFamily="monospace">→ NH₄⁺ (excreted)</text>
          {/* Phosphate buffer */}
          <text x="40" y="118" fill="#94a3b8" fontSize="8" fontFamily="monospace">HPO₄²⁻ + H⁺</text>
          <text x="40" y="129" fill="#F5A623" fontSize="8" fontFamily="monospace">→ H₂PO₄⁻ (excreted)</text>
          {/* HCO3 to blood */}
          <path d="M220 65 L270 65" stroke="#27AE60" strokeWidth="2" markerEnd="url(#arrG)"/>
          <defs>
            <marker id="arrG" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
              <path d="M0,0 L6,3 L0,6 Z" fill="#27AE60"/>
            </marker>
          </defs>
          <text x="270" y="80" fill="#27AE60" fontSize="9" fontFamily="monospace" textAnchor="middle">HCO₃⁻</text>
          <text x="270" y="91" fill="#94a3b8" fontSize="7" fontFamily="monospace" textAnchor="middle">→ blood</text>
        </svg>
      </div>
      <div className="rounded-md bg-primary/10 border border-primary/20 p-3 text-xs text-foreground">
        <strong>Net effect:</strong> Each H⁺ secreted into the tubule generates one new HCO₃⁻ that enters the blood - directly raising plasma pH. NH₄⁺ excretion is the dominant route during prolonged acidosis.
      </div>
    </div>,

    // Tab 2: Timeline
    <div className="space-y-4" key="timeline">
      <p className="text-sm text-muted-foreground leading-relaxed">
        The body uses multiple buffer systems to defend pH, operating across very different time scales.
      </p>
      <div className="space-y-3">
        {[
          { label: "Blood buffers (HCO₃⁻, Hb, proteins)", time: "Seconds", width: "8%", color: "#4DD9E0", detail: "Immediate chemical buffering - blunts pH change but does not correct it." },
          { label: "Respiratory compensation", time: "Minutes", width: "30%", color: "#F5A623", detail: "Brainstem detects pH change → adjusts ventilation rate. Fast but limited in magnitude." },
          { label: "Renal compensation", time: "Hours–Days", width: "100%", color: "#27AE60", detail: "Kidneys adjust H⁺ secretion and HCO₃⁻ reabsorption. Slow onset (3–5 days) but can fully correct pH." },
        ].map((item, i) => (
          <div key={i} className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-foreground font-medium">{item.label}</span>
              <span className="text-muted-foreground font-mono">{item.time}</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <motion.div
                className="h-full rounded-full"
                style={{ backgroundColor: item.color }}
                initial={{ width: 0 }}
                animate={{ width: item.width }}
                transition={{ duration: 0.6, delay: i * 0.15, ease: "easeOut" }}
              />
            </div>
            <div className="text-[11px] text-muted-foreground">{item.detail}</div>
          </div>
        ))}
      </div>
      <div className="rounded-md bg-primary/10 border border-primary/20 p-3 text-xs text-foreground">
        <strong>Clinical implication:</strong> In chronic respiratory acidosis (e.g. COPD), the kidneys have had days to fully compensate - expect a markedly elevated HCO₃⁻. An acute decompensation sits on top of this compensated baseline.
      </div>
    </div>,
  ];

  return (
    <div className="rounded-lg bg-card border border-border overflow-hidden">
      <div className="px-5 pt-5 pb-0">
        <h3 className="font-semibold text-foreground mb-1">Renal Homeostasis Mechanisms</h3>
        <p className="text-xs text-muted-foreground mb-4">
          How the kidneys stabilise blood pH - the body's most powerful (but slowest) acid-base defence.
        </p>
        {/* Tabs */}
        <div className="flex gap-2 mb-4">
          {tabs.map((tab, i) => (
            <button
              key={i}
              onClick={() => setActiveTab(i)}
              className={`flex-1 px-3 py-2.5 text-xs font-semibold rounded-lg transition-all border ${
                activeTab === i
                  ? "bg-primary text-primary-foreground border-primary shadow-sm"
                  : "bg-muted text-muted-foreground border-border hover:bg-secondary hover:text-foreground hover:border-primary/40"
              }`}
              style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
            >
              <span className="hidden sm:inline">{tab.label}</span>
              <span className="sm:hidden">{tab.short}</span>
            </button>
          ))}
        </div>
      </div>
      {/* Tab content */}
      <div className="p-5">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2 }}
          >
            {content[activeTab]}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

function NormalValuesModule() {
  return (
    <div className="space-y-6">
      <p className="text-muted-foreground leading-relaxed">
        Getting familiar with the normal reference ranges is the essential foundation of ABG
        interpretation. Any deviation from these ranges can then trigge systematic
        analysis.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <NormalValueGauge
          label="pH"
          min={7.0}
          max={7.6}
          normalMin={7.35}
          normalMax={7.45}
          unit="no units"
          color="#0A6E74"
        />
        <NormalValueGauge
          label="PaCO₂"
          min={2.7}
          max={8.0}
          normalMin={4.7}
          normalMax={6.0}
          unit="kPa"
          color="#1A9DA6"
          invertColors
        />
        <NormalValueGauge
          label="HCO₃⁻"
          min={10}
          max={36}
          normalMin={22}
          normalMax={26}
          unit="mmol/L"
          color="#27AE60"
        />
        <NormalValueGauge
          label="PaO₂"
          min={5.3}
          max={16.0}
          normalMin={10.6}
          normalMax={13.3}
          unit="kPa"
          color="#F5A623"
        />
      </div>

      <div className="rounded-lg bg-[#0D1B2A] text-white p-5">
        <h3 className="font-semibold mb-3 text-sm uppercase tracking-widest text-slate-400">
          Reference Ranges - Quick Reference
        </h3>
        <table className="w-full text-sm font-mono">
          <thead>
            <tr className="text-slate-400 text-xs border-b border-slate-700">
              <th className="text-left py-2">Parameter</th>
              <th className="text-left py-2">Normal Range</th>
              <th className="text-left py-2">Low = </th>
              <th className="text-left py-2">High = </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {[
              {
                p: "pH",
                r: "7.35–7.45",
                lo: "Acidosis",
                hi: "Alkalosis",
              },
              {
                p: "PaCO₂",
                r: "4.7–6.0 kPa",
                lo: "Alkalosis (↓CO₂)",
                hi: "Acidosis (↑CO₂)",
              },
              {
                p: "HCO₃⁻",
                r: "22–26 mmol/L",
                lo: "Acidosis (lost base)",
                hi: "Alkalosis (gained base)",
              },
              {
                p: "PaO₂",
                r: "10.6–13.3 kPa",
                lo: "Hypoxaemia",
                hi: "Hyperoxia",
              },
              { p: "SaO₂", r: "95–100%", lo: "Hypoxaemia", hi: "-" },
            ].map((row) => (
              <tr key={row.p} className="text-[13px]">
                <td className="py-2 text-[#4DD9E0]">{row.p}</td>
                <td className="py-2 text-white">{row.r}</td>
                <td className="py-2 text-red-400">{row.lo}</td>
                <td className="py-2 text-blue-300">{row.hi}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <AcidEquilibriumSimulator />
      <RenalHomeostasisTabs />
    </div>
  );
}

function SystematicModule() {
  const [activeStep, setActiveStep] = useState<number | null>(0);
  const [doneSteps, setDoneSteps] = useState<number[]>([]);

  const steps = [
    {
      title: "Step 1: Assess the pH",
      description: "Is the patient acidotic, alkalotic, or normal?",
      detail:
        "pH < 7.35 → Acidosis | pH > 7.45 → Alkalosis | pH 7.35–7.45 → Normal (but may still have a disorder). Always look at pH first - it tells you the net acid-base state.",
    },
    {
      title: "Step 2: Identify the Primary Disorder",
      description: "Is the primary problem respiratory or metabolic?",
      detail:
        "If acidosis: High PaCO₂ → Respiratory Acidosis | Low HCO₃⁻ → Metabolic Acidosis. If alkalosis: Low PaCO₂ → Respiratory Alkalosis | High HCO₃⁻ → Metabolic Alkalosis. The primary disorder moves in the same direction as the pH change.",
    },
    {
      title: "Step 3: Check for Compensation",
      description: "Is there adequate compensation? Is it acute or chronic?",
      detail:
        "Once you've identified the primary disorder, ask: is the other parameter moving in the right direction to compensate? For example, in metabolic acidosis the lungs should lower CO₂ by hyperventilating - if they haven't, there may be a second problem. Winter's formula gives you the expected CO₂ for a given bicarbonate level, so you can check whether the compensation is appropriate. You don't need to memorise it - just know it exists and what it tells you.",
    },
    {
      title: "Step 4: Assess Oxygenation",
      description: "Is the patient adequately oxygenated?",
      detail:
        "Is the patient getting enough oxygen? PaO₂ below 10.6 kPa means hypoxaemia. Also check SaO₂. If oxygenation is poor despite supplemental oxygen, think about why - is the lung not transferring oxygen properly (V/Q mismatch, shunt)? The A-a gradient is a tool that helps answer this, but the key clinical question is simply: are they hypoxaemic, and is it explained by the clinical picture?",
    },
  ];

  const handleStep = (i: number) => {
    if (activeStep === i) {
      setDoneSteps((d) => [...d, i]);
      setActiveStep(i + 1 < steps.length ? i + 1 : null);
    } else {
      setActiveStep(i);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground leading-relaxed">
        A systematic four-step approach ensures you never miss a diagnosis.
        Click each step to expand and mark complete.
      </p>
      {steps.map((s, i) => (
        <StepCard
          key={i}
          step={i + 1}
          title={s.title}
          description={s.description}
          detail={s.detail}
          isActive={activeStep === i}
          isDone={doneSteps.includes(i)}
          onClick={() => handleStep(i)}
        />
      ))}
      {doneSteps.length === steps.length && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-lg bg-primary/10 border border-primary/30 p-4 text-sm text-primary font-medium text-center"
        >
          All four steps reviewed. You now have a complete framework for ABG
          interpretation.
        </motion.div>
      )}
    </div>
  );
}

function DisordersModule() {
  return (
    <div className="space-y-5">
      <p className="text-muted-foreground leading-relaxed">
        There are four primary acid-base disorders. All other patterns are
        combinations or compensations of these four. Click each to expand.
      </p>

      <DisorderCard
        name="Respiratory Acidosis"
        primary="↓ pH | ↑ PaCO₂ | ↑ HCO₃⁻ (compensation)"
        compensation="Kidneys retain HCO₃⁻ (takes 3–5 days for full compensation)"
        example="COPD exacerbation, opioid overdose, neuromuscular disease, obesity hypoventilation"
        phColor="#E8534A"
      />
      <DisorderCard
        name="Respiratory Alkalosis"
        primary="↑ pH | ↓ PaCO₂ | ↓ HCO₃⁻ (compensation)"
        compensation="Kidneys excrete HCO₃⁻ (takes 3–5 days for full compensation)"
        example="Anxiety / hyperventilation, high altitude, pulmonary embolism, pregnancy, salicylate toxicity (early)"
        phColor="#1A9DA6"
      />
      <DisorderCard
        name="Metabolic Acidosis"
        primary="↓ pH | ↓ HCO₃⁻ | ↓ PaCO₂ (compensation)"
        compensation="Immediate hyperventilation (Kussmaul breathing) - [look up Winter's formula!]"
        example="DKA, lactic acidosis, renal failure, diarrhoea, RTA - check anion gap!"
        phColor="#F5A623"
      />
      <DisorderCard
        name="Metabolic Alkalosis"
        primary="↑ pH | ↑ HCO₃⁻ | ↑ PaCO₂ (compensation)"
        compensation="Hypoventilation to retain CO₂ - limited by hypoxaemia"
        example="Vomiting, diuretic use, primary hyperaldosteronism, post-hypercapnia"
        phColor="#27AE60"
      />

      <div className="rounded-lg bg-card border border-border p-4 text-sm">
        <h4 className="font-semibold text-foreground mb-2">
          Anion Gap - Key Concept
        </h4>
        <p className="text-muted-foreground mb-3">
          Calculate in all metabolic acidoses: AG = Na⁺ − (Cl⁻ + HCO₃⁻)
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-md bg-muted/50 p-3">
            <div className="font-medium text-foreground text-sm mb-1">
              High AG (&gt; 12)
            </div>
            <div className="text-xs text-muted-foreground">
              MUDPILES: Methanol, Uraemia, DKA, Propylene glycol, INH/Iron,
              Lactic acidosis, Ethylene glycol, Salicylates
            </div>
          </div>
          <div className="rounded-md bg-muted/50 p-3">
            <div className="font-medium text-foreground text-sm mb-1">
              Normal AG (8–12)
            </div>
            <div className="text-xs text-muted-foreground">
              HARDUPS: Hyperalimentation, Acetazolamide, RTA, Diarrhoea,
              Ureterosigmoidostomy, Pancreatic fistula, Saline infusion
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MixedModule() {
  return (
    <div className="space-y-6">
      <p className="text-muted-foreground leading-relaxed">
        Mixed disorders occur when two primary acid-base disorders coexist
        simultaneously. They are common in critically ill patients and require
        careful analysis to identify.
      </p>

      <div className="rounded-lg bg-card border border-border p-5 space-y-4">
        <h3 className="font-semibold text-foreground">How to Identify a Mixed Disorder</h3>
        <div className="space-y-3 text-sm text-muted-foreground">
          <div className="flex gap-3">
            <span className="text-primary font-medium min-w-[20px]">1.</span>
            <span>
              Identify the primary disorder from pH and the main abnormal parameter.
            </span>
          </div>
          <div className="flex gap-3">
            <span className="text-primary font-medium min-w-[20px]">2.</span>
            <span>
              Calculate the expected compensation using the appropriate formula.
            </span>
          </div>
          <div className="flex gap-3">
            <span className="text-primary font-medium min-w-[20px]">3.</span>
            <span>
              If the actual compensation deviates significantly from expected, a
              second disorder is present. If PaCO₂ is higher than expected →
              additional respiratory acidosis. If PaCO₂ is lower than expected
              → additional respiratory alkalosis.
            </span>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="font-semibold text-foreground">Common Mixed Patterns</h3>
        {[
          {
            pattern: "Respiratory Acidosis + Metabolic Alkalosis",
            example:
              "COPD patient on diuretics - CO₂ retention plus HCO₃⁻ raised from diuretic use",
            abg: "pH ~7.40 (near normal), PaCO₂ ↑↑, HCO₃⁻ ↑↑",
          },
          {
            pattern: "Respiratory Alkalosis + Metabolic Acidosis",
            example:
              "Sepsis / salicylate toxicity - hyperventilation from fever plus lactic/metabolic acidosis",
            abg: "pH variable, PaCO₂ ↓, HCO₃⁻ ↓",
          },
          {
            pattern: "Metabolic Acidosis + Metabolic Alkalosis",
            example:
              "DKA with persistent vomiting - ketoacidosis offset by HCl loss from vomiting",
            abg: "pH variable, HCO₃⁻ may appear normal despite two opposing disorders",
          },
          {
            pattern: "Respiratory Acidosis + Metabolic Acidosis",
            example:
              "Cardiac arrest - CO₂ retention plus lactic acidosis from poor perfusion",
            abg: "pH very low ↓↓, PaCO₂ ↑, HCO₃⁻ ↓",
          },
        ].map((item) => (
          <div
            key={item.pattern}
            className="rounded-lg border border-border bg-card p-4 text-sm"
          >
            <div className="font-semibold text-foreground mb-1">
              {item.pattern}
            </div>
            <div className="text-muted-foreground mb-2">{item.example}</div>
            <div className="font-mono text-xs text-primary bg-primary/5 rounded px-2 py-1 inline-block">
              {item.abg}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ScenariosModule({ onComplete }: { onComplete: () => void }) {
  const [scenarioIdx, setScenarioIdx] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [answered, setAnswered] = useState(false);
  const scenario = SCENARIOS[scenarioIdx];
  const allDone = scenarioIdx >= SCENARIOS.length;

  const handleChoice = (i: number) => {
    if (answered) return;
    setSelected(i);
    setAnswered(true);
  };

  const handleNext = () => {
    const next = scenarioIdx + 1;
    if (next >= SCENARIOS.length) {
      onComplete();
    } else {
      setScenarioIdx(next);
      setSelected(null);
      setAnswered(false);
    }
  };

  if (allDone) return null;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono">
        <span>Case {scenarioIdx + 1} of {SCENARIOS.length}</span>
        <div className="flex-1 h-0.5 bg-muted rounded-full">
          <div
            className="h-full bg-primary rounded-full transition-all"
            style={{ width: `${((scenarioIdx) / SCENARIOS.length) * 100}%` }}
          />
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <div className="text-xs uppercase tracking-widest text-muted-foreground mb-2 font-sans">
          Patient Presentation
        </div>
        <p className="text-foreground text-sm leading-relaxed">
          {scenario.patientInfo}
        </p>
      </div>

      <ABGPanel values={scenario.abg} />

      <div className="space-y-2">
        <div className="text-sm font-medium text-foreground">
          What is your interpretation?
        </div>
        {scenario.choices.map((choice, i) => {
          const isSelected = selected === i;
          const showResult = answered && isSelected;
          return (
            <motion.button
              key={i}
              layout
              onClick={() => handleChoice(i)}
              disabled={answered}
              className={`w-full text-left rounded-lg border p-3 text-sm transition-all duration-200 ${
                !answered
                  ? "border-border bg-card hover:border-primary/50 hover:bg-primary/5"
                  : isSelected
                  ? choice.isCorrect
                    ? "border-green-400 bg-green-50 text-green-900"
                    : "border-red-400 bg-red-50 text-red-900"
                  : "border-border bg-card opacity-50"
              }`}
            >
              <div className="flex items-start gap-2">
                {answered && isSelected ? (
                  choice.isCorrect ? (
                    <CheckCircle size={16} className="text-green-600 flex-shrink-0 mt-0.5" />
                  ) : (
                    <XCircle size={16} className="text-red-500 flex-shrink-0 mt-0.5" />
                  )
                ) : (
                  <span className="font-mono text-muted-foreground min-w-[16px]">
                    {String.fromCharCode(65 + i)}.
                  </span>
                )}
                <span>{choice.text}</span>
              </div>
              <AnimatePresence>
                {showResult && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    className="mt-2 pt-2 border-t border-current/20 text-xs leading-relaxed overflow-hidden"
                  >
                    {choice.consequence}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.button>
          );
        })}
      </div>

      {answered && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex justify-end"
        >
          <button
            onClick={handleNext}
            className="flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            {scenarioIdx + 1 >= SCENARIOS.length ? "Proceed to Assessment" : "Next Case"}
            <ChevronRight size={16} />
          </button>
        </motion.div>
      )}
    </div>
  );
}

type QuizAnswer = { questionIdx: number; selectedIdx: number; correct: boolean };

function AssessmentModule({
  onComplete,
}: {
  onComplete: (score: number, answers: QuizAnswer[]) => void;
}) {
  const [currentQ, setCurrentQ] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [answered, setAnswered] = useState(false);
  const [scores, setScores] = useState<boolean[]>([]);
  const [answers, setAnswers] = useState<QuizAnswer[]>([]);
  const [finished, setFinished] = useState(false);

  const q = QUIZ_QUESTIONS[currentQ];

  const handleAnswer = (i: number) => {
    if (answered) return;
    setSelected(i);
    setAnswered(true);
    setScores((s) => [...s, q.options[i].correct]);
    setAnswers((a) => [...a, { questionIdx: currentQ, selectedIdx: i, correct: q.options[i].correct }]);
  };

  const handleNext = () => {
    const next = currentQ + 1;
    if (next >= QUIZ_QUESTIONS.length) {
      const total = [...scores, q.options[selected!].correct].filter(Boolean).length;
      const finalAnswers = [...answers, { questionIdx: currentQ, selectedIdx: selected!, correct: q.options[selected!].correct }];
      setFinished(true);
      onComplete(Math.round((total / QUIZ_QUESTIONS.length) * 100), finalAnswers);
    } else {
      setCurrentQ(next);
      setSelected(null);
      setAnswered(false);
    }
  };

  if (finished) return null;

  return (
    <div className="space-y-5">
      {/* Persistent normal reference ranges */}
      <div className="rounded-lg bg-[#0D1B2A] px-4 py-2.5 flex flex-wrap gap-x-4 gap-y-1">
        <span className="text-[10px] text-slate-500 uppercase tracking-widest w-full mb-0.5 font-sans">Normal ranges</span>
        {[
          { label: "pH", range: "7.35–7.45" },
          { label: "PaCO₂", range: "4.7–6.0 kPa" },
          { label: "HCO₃⁻", range: "22–26 mmol/L" },
          { label: "PaO₂", range: "10.6–13.3 kPa" },
          { label: "SaO₂", range: "95–100%" },
        ].map(r => (
          <span key={r.label} className="text-[11px] font-mono">
            <span className="text-[#4DD9E0]">{r.label}</span>
            <span className="text-slate-400"> {r.range}</span>
          </span>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground font-mono">
          Question {currentQ + 1} / {QUIZ_QUESTIONS.length}
        </span>
        <div className="flex gap-1">
          {QUIZ_QUESTIONS.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 w-6 rounded-full transition-colors ${
                i < currentQ
                  ? scores[i]
                    ? "bg-green-500"
                    : "bg-red-400"
                  : i === currentQ
                  ? "bg-primary"
                  : "bg-muted"
              }`}
            />
          ))}
        </div>
      </div>

      {q.abgPanel && <ABGPanel values={q.abgPanel} />}

      <div className="font-medium text-foreground leading-relaxed">{q.question}</div>

      <div className="space-y-2">
        {q.options.map((opt, i) => {
          const isSelected = selected === i;
          return (
            <motion.button
              key={i}
              layout
              onClick={() => handleAnswer(i)}
              disabled={answered}
              className={`w-full text-left rounded-lg border p-3 text-sm transition-all ${
                !answered
                  ? "border-border bg-card hover:border-primary/50 hover:bg-primary/5"
                  : isSelected
                  ? opt.correct
                    ? "border-green-400 bg-green-50 text-green-900"
                    : "border-red-400 bg-red-50 text-red-900"
                  : opt.correct && answered
                  ? "border-green-200 bg-green-50/50 text-green-800"
                  : "border-border bg-card opacity-50"
              }`}
            >
              <div className="flex items-start gap-2">
                <span className="font-mono text-muted-foreground min-w-[16px] text-xs mt-0.5">
                  {String.fromCharCode(65 + i)}.
                </span>
                <span>{opt.text}</span>
                {answered && isSelected && (
                  opt.correct ? (
                    <CheckCircle size={15} className="text-green-600 ml-auto flex-shrink-0 mt-0.5" />
                  ) : (
                    <XCircle size={15} className="text-red-500 ml-auto flex-shrink-0 mt-0.5" />
                  )
                )}
              </div>
              <AnimatePresence>
                {answered && (isSelected || opt.correct) && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    className="mt-2 pt-2 border-t border-current/20 text-xs leading-relaxed overflow-hidden"
                  >
                    {opt.explanation}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.button>
          );
        })}
      </div>

      {answered && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex justify-end"
        >
          <button
            onClick={handleNext}
            className="flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            {currentQ + 1 >= QUIZ_QUESTIONS.length ? "View Results" : "Next Question"}
            <ChevronRight size={16} />
          </button>
        </motion.div>
      )}
    </div>
  );
}

// ─── Certificate ──────────────────────────────────────────────────────────────

function Certificate({
  name,
  score,
  date,
}: {
  name: string;
  score: number;
  date: string;
}) {
  return (
    <div
      id="certificate-canvas"
      className="bg-white border-8 border-double border-[#0A6E74] rounded-xl p-10 text-center relative overflow-hidden"
      style={{ fontFamily: "'DM Sans', sans-serif", minWidth: 640 }}
    >
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none">
        <div className="w-full h-full grid grid-cols-8 grid-rows-8">
          {Array.from({ length: 64 }).map((_, i) => (
            <Activity key={i} size={32} className="text-[#0A6E74] m-auto" />
          ))}
        </div>
      </div>
      <div className="relative z-10">
        <div className="text-xs uppercase tracking-[0.25em] text-[#5A6A7A] mb-2" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
          Certificate of Completion
        </div>
        <div className="text-3xl font-bold text-[#0D1B2A] mb-8">
          Blood Gas Interpretation
        </div>

        <div className="text-sm text-[#5A6A7A] mb-2" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
          This is to certify that
        </div>
        <div className="text-2xl font-semibold text-[#0A6E74] italic mb-6 border-b border-[#0A6E74]/30 pb-4">
          {name || "Student Name"}
        </div>

        <div className="text-sm text-[#5A6A7A] mb-6" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
          has successfully completed the Blood Gas Interpretation module
          <br />
          with a final assessment score of{" "}
          <strong className="text-[#0D1B2A]">{score}%</strong>
        </div>

        <div className="flex items-center justify-center gap-8 text-xs text-[#5A6A7A]" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
          <div>
            <div className="font-medium text-[#0D1B2A]">{date}</div>
            <div>Date of Completion</div>
          </div>
          <div className="text-[#0A6E74]">
            <Award size={32} />
          </div>
          <div>
            <div className="font-medium text-[#0D1B2A]">Passed</div>
            <div>Status</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CompletionScreen({
  score,
  learnerName,
}: {
  score: number;
  learnerName: string;
}) {
  const [name, setName] = useState(learnerName);
  const [downloading, setDownloading] = useState(false);
  const [ratingSubmitted, setRatingSubmitted] = useState(false);
  const passed = score >= 80;
  const date = new Date().toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const downloadCertificate = async () => {
    setDownloading(true);
    try {
      const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      const W = pdf.internal.pageSize.getWidth(); // 297
      const H = pdf.internal.pageSize.getHeight(); // 210
      const cx = W / 2;
      const dateStr = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

      // Load logo as image
      const logoDataUrl = await new Promise<string>((resolve) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
          const c = document.createElement("canvas");
          c.width = img.width; c.height = img.height;
          c.getContext("2d")!.drawImage(img, 0, 0);
          resolve(c.toDataURL("image/png"));
        };
        img.src = logoMedicine as string;
      });

      // White background
      pdf.setFillColor(255, 255, 255);
      pdf.rect(0, 0, W, H, "F");

      // Outer teal double border (matching on-screen border-8 border-double)
      pdf.setDrawColor(10, 110, 116);
      pdf.setLineWidth(3);
      pdf.rect(6, 6, W - 12, H - 12);
      pdf.setLineWidth(0.6);
      pdf.rect(10, 10, W - 20, H - 20);

      // Cardiff logo — top left inside border
      const logoW = 52;
      const logoH = 18;
      pdf.addImage(logoDataUrl, "PNG", 18, 17, logoW, logoH);

      // "Certificate of Completion" badge — top centre
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(7);
      pdf.setTextColor(90, 106, 122);
      pdf.text("CERTIFICATE OF COMPLETION", cx, 24, { align: "center", charSpace: 2 });

      // Main title
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(26);
      pdf.setTextColor(13, 27, 42);
      pdf.text("Blood Gas Interpretation", cx, 48, { align: "center" });

      // Teal rule under title
      pdf.setDrawColor(10, 110, 116);
      pdf.setLineWidth(0.4);
      pdf.line(cx - 70, 53, cx + 70, 53);

      // "This is to certify that"
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9);
      pdf.setTextColor(90, 106, 122);
      pdf.text("This is to certify that", cx, 67, { align: "center" });

      // Student name — large, teal, italic
      pdf.setFont("times", "bolditalic");
      pdf.setFontSize(28);
      pdf.setTextColor(10, 110, 116);
      pdf.text(name || "Student Name", cx, 83, { align: "center" });

      // Name underline (matching border-b on screen)
      const nW = Math.min(pdf.getTextWidth(name || "Student Name") + 12, 150);
      pdf.setDrawColor(10, 110, 116);
      pdf.setLineWidth(0.3);
      pdf.line(cx - nW / 2, 86, cx + nW / 2, 86);

      // Description
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9);
      pdf.setTextColor(90, 106, 122);
      pdf.text("has successfully completed the Blood Gas Interpretation module", cx, 98, { align: "center" });
      pdf.text(`with a final assessment score of ${score}%`, cx, 106, { align: "center" });

      // Bottom row — Date | Award mark | Status (matching on-screen layout)
      const rowY = 126;
      // Date
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(10);
      pdf.setTextColor(13, 27, 42);
      pdf.text(dateStr, cx - 42, rowY, { align: "center" });
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(7);
      pdf.setTextColor(90, 106, 122);
      pdf.text("Date of Completion", cx - 42, rowY + 5, { align: "center" });

      // Teal circle award mark in centre
      pdf.setFillColor(10, 110, 116);
      pdf.circle(cx, rowY - 2, 5, "F");
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(9);
      pdf.setTextColor(255, 255, 255);
      pdf.text("✓", cx, rowY + 1, { align: "center" });

      // Status
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(10);
      pdf.setTextColor(13, 27, 42);
      pdf.text("Passed", cx + 42, rowY, { align: "center" });
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(7);
      pdf.setTextColor(90, 106, 122);
      pdf.text("Status", cx + 42, rowY + 5, { align: "center" });

      pdf.save(`ABG_Certificate_${(name || "Student").replace(/\s+/g, "_")}.pdf`);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="text-center">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 200, damping: 15 }}
          className={`w-20 h-20 rounded-full mx-auto flex items-center justify-center mb-4 ${
            passed ? "bg-primary" : "bg-destructive"
          }`}
        >
          {passed ? (
            <Award size={36} className="text-white" />
          ) : (
            <AlertTriangle size={36} className="text-white" />
          )}
        </motion.div>
        <h2 className="text-2xl font-semibold text-foreground" style={{ fontFamily: "'DM Sans', sans-serif" }}>
          {passed ? "Assessment Passed" : "Assessment Not Passed"}
        </h2>
        <p className="text-muted-foreground mt-1">
          Final Score:{" "}
          <span className={`font-mono font-medium text-lg ${passed ? "text-primary" : "text-destructive"}`}>
            {score}%
          </span>{" "}
          {passed ? "(Pass threshold: 80%)" : "- 80% required to pass"}
        </p>
      </div>

      {/* Rating first - required for certificate */}
      <GoodbyeRating onSubmit={() => setRatingSubmitted(true)} submitted={ratingSubmitted} />

      {passed ? (
        <div className="space-y-4">
          {!ratingSubmitted && (
            <p className="text-center text-xs text-muted-foreground italic">
              Please submit your rating above to unlock your certificate.
            </p>
          )}
          <AnimatePresence>
            {ratingSubmitted && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-4"
              >
                <div className="flex flex-col items-center gap-2">
                  <label className="text-sm font-medium text-foreground">
                    Enter your name for the certificate
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Full name"
                    className="border border-border rounded-lg px-4 py-2 text-sm text-foreground bg-card focus:outline-none focus:ring-2 focus:ring-ring w-64 text-center"
                  />
                </div>
                <div className="overflow-x-auto">
                  <Certificate name={name} score={score} date={date} />
                </div>
                <div className="flex justify-center">
                  <button
                    onClick={downloadCertificate}
                    disabled={downloading || !name.trim()}
                    className="flex items-center gap-2 bg-primary text-primary-foreground px-6 py-3 rounded-lg font-medium hover:bg-primary/90 transition-colors disabled:opacity-60"
                  >
                    <Download size={18} />
                    {downloading ? "Generating PDF…" : "Download Certificate (PDF)"}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ) : (
        <div className="text-center space-y-4">
          <p className="text-muted-foreground text-sm">
            Review the module content and try the assessment again. Focus on
            the systematic approach and compensation formulas.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="flex items-center gap-2 mx-auto bg-primary text-primary-foreground px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <RotateCcw size={16} />
            Restart Course
          </button>
        </div>
      )}
    </div>
  );
}

function GoodbyeRating({ onSubmit, submitted }: { onSubmit: () => void; submitted: boolean }) {
  const [rating, setRating] = useState<number | null>(null);

  const getMessage = (r: number) => {
    if (r <= 3) return { text: "We hear you - we'll work on it.", emoji: "📋" };
    if (r <= 6) return { text: "Thanks for the honest feedback.", emoji: "👍" };
    if (r <= 8) return { text: "Really glad it was useful!", emoji: "🎉" };
    if (r === 9) return { text: "That means a lot - thank you!", emoji: "⭐" };
    if (r === 10) return { text: "A perfect score. You're too kind.", emoji: "🏆" };
    if (r === 11) return { text: "Wait... the scale only goes to 10.", emoji: "👀" };
    if (r === 12) return { text: "You've broken the scale. We'll take it.", emoji: "💥" };
    return { text: "", emoji: "" };
  };

  const scaleColor = rating === null ? "#0A6E74"
    : rating <= 4 ? "#E8534A"
    : rating <= 7 ? "#F5A623"
    : rating <= 10 ? "#27AE60"
    : "#4DD9E0";

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className="rounded-xl border border-border bg-card p-6 text-center space-y-5"
    >
      <div>
        <p className="text-lg font-semibold text-foreground" style={{ fontFamily: "'DM Sans', sans-serif" }}>
          Thanks for completing the module!
        </p>
        <p className="text-sm text-muted-foreground mt-1">
          We hope it was useful. Please rate this resource - your feedback helps us improve it.
        </p>
      </div>

      {!submitted ? (
        <div className="space-y-4">
          {/* Slider */}
          <div className="relative px-2">
            <input
              type="range"
              min={0}
              max={12}
              step={1}
              value={rating ?? 5}
              onChange={e => setRating(Number(e.target.value))}
              className="w-full h-2 rounded-full appearance-none cursor-pointer"
              style={{ accentColor: scaleColor }}
            />
            {/* Scale labels */}
            <div className="flex justify-between text-[10px] font-mono mt-1.5">
              {Array.from({ length: 13 }, (_, i) => (
                <span
                  key={i}
                  className={`transition-colors ${rating === i ? "font-bold" : "text-muted-foreground"}`}
                  style={{ color: rating === i ? scaleColor : undefined }}
                >
                  {i}
                </span>
              ))}
            </div>
            {/* 11-12 "out of scale" marker */}
            <div className="flex justify-end mt-1">
              <span className="text-[9px] text-[#4DD9E0] font-mono italic">
                ...wait, what?
              </span>
            </div>
          </div>

          {/* Live feedback */}
          <AnimatePresence mode="wait">
            {rating !== null && (
              <motion.div
                key={rating}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="flex flex-col items-center gap-1"
              >
                <span className="text-3xl">{getMessage(rating).emoji}</span>
                <span
                  className="text-2xl font-bold font-mono"
                  style={{ color: scaleColor }}
                >
                  {rating > 10 ? `${rating} (?!)` : `${rating}/10`}
                </span>
                <span className="text-sm text-muted-foreground italic">
                  "{getMessage(rating).text}"
                </span>
              </motion.div>
            )}
          </AnimatePresence>

          <button
            onClick={() => rating !== null && onSubmit()}
            disabled={rating === null}
            className={`px-6 py-2.5 rounded-lg text-sm font-medium transition-all ${
              rating !== null
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "bg-muted text-muted-foreground cursor-not-allowed"
            }`}
          >
            Submit Rating
          </button>
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="space-y-2"
        >
          <span className="text-4xl">{getMessage(rating!).emoji}</span>
          <p className="font-semibold text-foreground" style={{ fontFamily: "'DM Sans', sans-serif" }}>
            {rating! > 10 ? `${rating}/10... apparently.` : `${rating}/10 - thank you!`}
          </p>
          <p className="text-sm text-muted-foreground">
            "{getMessage(rating!).text}" - Your feedback has been recorded.
          </p>
        </motion.div>
      )}
    </motion.div>
  );
}

// ─── Sci-Fi Background Shader ────────────────────────────────────────────────

type ShaderVariant = 1 | 2 | 3 | 4;

function SciFiShader({ variant = 1 }: { variant?: ShaderVariant }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<number>(0);
  const mouseRef = useRef<{ x: number; y: number }>({ x: 0.5, y: 0.5 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Window resize - use ResizeObserver on parent for accuracy
    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(document.documentElement);

    // Mouse tracking - normalised 0–1
    const onMouse = (e: MouseEvent) => {
      mouseRef.current = {
        x: e.clientX / window.innerWidth,
        y: e.clientY / window.innerHeight,
      };
    };
    window.addEventListener("mousemove", onMouse);

    let t = 0;

    const draw = () => {
      const W = canvas.width;
      const H = canvas.height;
      const mx = mouseRef.current.x; // 0–1 normalised
      const my = mouseRef.current.y;
      ctx.clearRect(0, 0, W, H);

      if (variant === 1) {
        // ── Hex Grid - mouse brightens nearby cells + data streams bend toward cursor ──
        const R = 36;
        const cols = Math.ceil(W / (R * 1.75)) + 2;
        const rows = Math.ceil(H / (R * 1.5)) + 2;
        for (let row = -1; row < rows; row++) {
          for (let col = -1; col < cols; col++) {
            const cx = col * R * 1.75 + (row % 2 === 0 ? 0 : R * 0.875);
            const cy = row * R * 1.5;
            const pulse = Math.sin(t * 0.6 + col * 0.4 + row * 0.7) * 0.5 + 0.5;
            const dxM = cx / W - mx, dyM = cy / H - my;
            const distM = Math.sqrt(dxM * dxM + dyM * dyM);
            const mouseBoost = Math.max(0, 1 - distM / 0.25) * 0.25;
            const alpha = pulse * 0.18 + 0.07 + mouseBoost;
            ctx.beginPath();
            for (let i = 0; i < 6; i++) {
              const angle = (Math.PI / 3) * i - Math.PI / 6;
              ctx.lineTo(cx + R * 0.88 * Math.cos(angle), cy + R * 0.88 * Math.sin(angle));
            }
            ctx.closePath();
            ctx.strokeStyle = `rgba(77,217,224,${alpha})`;
            ctx.lineWidth = distM < 0.15 ? 1.0 : 0.6;
            ctx.stroke();
            if (Math.sin(t * 0.4 + col * 1.3 + row * 2.1) > 0.88 || mouseBoost > 0.1) {
              ctx.beginPath();
              ctx.arc(cx, cy, mouseBoost > 0.1 ? 3 : 1.8, 0, Math.PI * 2);
              ctx.fillStyle = `rgba(77,217,224,${alpha * 5})`; ctx.fill();
            }
          }
        }
        for (let s = 0; s < 8; s++) {
          const x = (W / 8) * s + (W / 8) * 0.5;
          const offset = (t * (0.4 + (s % 3) * 0.2) * 60 + s * 137) % (H + 80);
          const colDist = Math.abs(x / W - mx);
          const boost = Math.max(0, 1 - colDist / 0.2);
          for (let d = 0; d < 5; d++) {
            const y = (offset + d * 18) % (H + 80) - 40;
            ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 14);
            ctx.strokeStyle = `rgba(77,217,224,${(1 - d / 5) * (0.35 + boost * 0.3)})`;
            ctx.lineWidth = 0.8 + boost; ctx.stroke();
          }
        }
        const mg = ctx.createRadialGradient(mx * W, my * H, 0, mx * W, my * H, 160);
        mg.addColorStop(0, "rgba(77,217,224,0.07)"); mg.addColorStop(1, "rgba(77,217,224,0)");
        ctx.fillStyle = mg; ctx.fillRect(0, 0, W, H);
        const g = ctx.createRadialGradient(W * 0.5, H * 0.42, 0, W * 0.5, H * 0.42, W * 0.55);
        g.addColorStop(0, "rgba(10,110,116,0.18)"); g.addColorStop(1, "rgba(10,110,116,0)");
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      }

      else if (variant === 2) {
        // ── Neural Net - mouse attracts nodes + lights up nearby connections ──
        const COUNT = 55;
        const nodes: [number, number][] = [];
        for (let i = 0; i < COUNT; i++) {
          let nx = (Math.sin(i * 2.4 + t * 0.2) * 0.5 + 0.5) * W;
          let ny = (Math.cos(i * 1.9 + t * 0.15) * 0.5 + 0.5) * H;
          // Mouse attraction
          const dxM = mx * W - nx, dyM = my * H - ny;
          const distM = Math.sqrt(dxM * dxM + dyM * dyM);
          if (distM < 200) {
            nx += (dxM / distM) * (1 - distM / 200) * 30;
            ny += (dyM / distM) * (1 - distM / 200) * 30;
          }
          nodes.push([nx, ny]);
        }
        for (let a = 0; a < COUNT; a++) {
          for (let b = a + 1; b < COUNT; b++) {
            const dx = nodes[a][0] - nodes[b][0], dy = nodes[a][1] - nodes[b][1];
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 160) {
              const midX = (nodes[a][0] + nodes[b][0]) / 2;
              const midY = (nodes[a][1] + nodes[b][1]) / 2;
              const dxM = midX / W - mx, dyM = midY / H - my;
              const mDist = Math.sqrt(dxM * dxM + dyM * dyM);
              const boost = Math.max(0, 1 - mDist / 0.25) * 0.3;
              ctx.beginPath();
              ctx.moveTo(nodes[a][0], nodes[a][1]);
              ctx.lineTo(nodes[b][0], nodes[b][1]);
              ctx.strokeStyle = `rgba(77,217,224,${(1 - dist / 160) * (0.22 + boost)})`;
              ctx.lineWidth = 0.5 + boost; ctx.stroke();
            }
          }
        }
        nodes.forEach(([nx, ny], i) => {
          const pulse = Math.sin(t * 1.2 + i) * 0.5 + 0.5;
          const dxM = nx / W - mx, dyM = ny / H - my;
          const mDist = Math.sqrt(dxM * dxM + dyM * dyM);
          const boost = Math.max(0, 1 - mDist / 0.2);
          ctx.beginPath();
          ctx.arc(nx, ny, 1.5 + pulse * 1.5 + boost * 2, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(77,217,224,${0.3 + pulse * 0.4 + boost * 0.3})`; ctx.fill();
        });
        const mg = ctx.createRadialGradient(mx * W, my * H, 0, mx * W, my * H, 180);
        mg.addColorStop(0, "rgba(77,217,224,0.07)"); mg.addColorStop(1, "rgba(77,217,224,0)");
        ctx.fillStyle = mg; ctx.fillRect(0, 0, W, H);
        const g = ctx.createRadialGradient(W * 0.5, H * 0.45, 0, W * 0.5, H * 0.45, W * 0.6);
        g.addColorStop(0, "rgba(10,110,116,0.15)"); g.addColorStop(1, "rgba(10,110,116,0)");
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      }

      else if (variant === 3) {
        // ── ECG Lines - mouse creates local spike near cursor ──
        const LINES = 18;
        for (let l = 0; l < LINES; l++) {
          const yBase = (H / LINES) * l + H / (LINES * 2);
          const alpha = 0.08 + (Math.sin(t * 0.5 + l * 0.4) * 0.5 + 0.5) * 0.14;
          ctx.beginPath();
          for (let x = 0; x <= W; x += 2) {
            const nx = x / W;
            const spike = Math.exp(-Math.pow((nx - ((t * 0.08 + l * 0.07) % 1.2) + 0.6) * 12, 2)) * 40;
            // Mouse-driven spike
            const dxM = nx - mx, dyM = yBase / H - my;
            const mDist = Math.sqrt(dxM * dxM + dyM * dyM);
            const mouseSpike = mDist < 0.2 ? Math.exp(-Math.pow(dxM * 18, 2)) * (1 - mDist / 0.2) * 55 : 0;
            const wave = Math.sin(nx * Math.PI * 4 + t * 0.8 + l * 0.5) * 8;
            const y = yBase + wave + spike + mouseSpike;
            x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
          }
          ctx.strokeStyle = `rgba(77,217,224,${alpha})`; ctx.lineWidth = 0.8; ctx.stroke();
        }
        const mg = ctx.createRadialGradient(mx * W, my * H, 0, mx * W, my * H, 120);
        mg.addColorStop(0, "rgba(77,217,224,0.08)"); mg.addColorStop(1, "rgba(77,217,224,0)");
        ctx.fillStyle = mg; ctx.fillRect(0, 0, W, H);
        const g = ctx.createRadialGradient(W * 0.5, H * 0.5, 0, W * 0.5, H * 0.5, W * 0.7);
        g.addColorStop(0, "rgba(26,157,166,0.12)"); g.addColorStop(1, "rgba(10,110,116,0)");
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      }

      else if (variant === 4) {
        // ── Radar - sweep origin follows mouse softly ──
        const rcx = W * 0.5 + (mx - 0.5) * W * 0.15;
        const rcy = H * 0.5 + (my - 0.5) * H * 0.15;
        const maxR = Math.sqrt(Math.max(rcx, W - rcx) ** 2 + Math.max(rcy, H - rcy) ** 2);
        for (let r = 1; r <= 5; r++) {
          ctx.beginPath(); ctx.arc(rcx, rcy, (maxR / 5) * r, 0, Math.PI * 2);
          ctx.strokeStyle = "rgba(77,217,224,0.1)"; ctx.lineWidth = 0.6; ctx.stroke();
        }
        ctx.strokeStyle = "rgba(77,217,224,0.08)"; ctx.lineWidth = 0.5;
        ctx.beginPath(); ctx.moveTo(rcx, 0); ctx.lineTo(rcx, H); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, rcy); ctx.lineTo(W, rcy); ctx.stroke();
        const sweepAngle = (t * 0.7) % (Math.PI * 2);
        ctx.save(); ctx.translate(rcx, rcy);
        for (let a = 0; a < 60; a++) {
          const angle = sweepAngle - (a / 60) * (Math.PI * 0.6);
          ctx.beginPath(); ctx.moveTo(0, 0);
          ctx.arc(0, 0, maxR, angle, angle + 0.06);
          ctx.fillStyle = `rgba(77,217,224,${(1 - a / 60) * 0.06})`; ctx.fill();
        }
        ctx.beginPath(); ctx.moveTo(0, 0);
        ctx.lineTo(maxR * Math.cos(sweepAngle), maxR * Math.sin(sweepAngle));
        ctx.strokeStyle = "rgba(77,217,224,0.5)"; ctx.lineWidth = 1; ctx.stroke();
        ctx.restore();
        for (let b = 0; b < 6; b++) {
          const bAngle = b * 1.04 + 0.3;
          const bR = maxR * (0.3 + (b % 3) * 0.2);
          const bx = rcx + Math.cos(bAngle) * bR;
          const by = rcy + Math.sin(bAngle) * bR;
          const blipAge = ((sweepAngle - bAngle) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
          const blipAlpha = blipAge < 1.5 ? (1 - blipAge / 1.5) * 0.8 : 0;
          if (blipAlpha > 0) {
            ctx.beginPath(); ctx.arc(bx, by, 3, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(77,217,224,${blipAlpha})`;
            ctx.shadowColor = "#4DD9E0"; ctx.shadowBlur = 8; ctx.fill(); ctx.shadowBlur = 0;
          }
        }
        const mg = ctx.createRadialGradient(mx * W, my * H, 0, mx * W, my * H, 180);
        mg.addColorStop(0, "rgba(77,217,224,0.06)"); mg.addColorStop(1, "rgba(77,217,224,0)");
        ctx.fillStyle = mg; ctx.fillRect(0, 0, W, H);
      }

      t += 0.008;
      frameRef.current = requestAnimationFrame(draw);
    };

    draw();
    return () => {
      cancelAnimationFrame(frameRef.current);
      ro.disconnect();
      window.removeEventListener("mousemove", onMouse);
    };
  }, [variant]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none"
      style={{ opacity: 0.9 }}
    />
  );
}

// ─── Analyser Screen Shader ───────────────────────────────────────────────────

function AnalyserShader() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Fixed logical dimensions - avoid division-by-zero if offsetWidth is 0
    const W = 220;
    const H = 130;
    canvas.width = W;
    canvas.height = H;

    let t = 0;

    const waves = [
      { color: "#4DD9E0", alpha: 0.9, freq: 1.8, amp: 0.22, phase: 0,   yBias: 0.35, lw: 1.5 },
      { color: "#1A9DA6", alpha: 0.5, freq: 2.6, amp: 0.12, phase: 1.2, yBias: 0.62, lw: 1.0 },
      { color: "#27AE60", alpha: 0.3, freq: 1.1, amp: 0.07, phase: 2.5, yBias: 0.80, lw: 0.8 },
    ];

    const COLS = 6;
    const ROWS = 4;

    const draw = () => {
      // Background
      ctx.fillStyle = "#060f1a";
      ctx.fillRect(0, 0, W, H);

      // Scanlines
      ctx.fillStyle = "rgba(0,0,0,0.15)";
      for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1);

      // Grid
      ctx.strokeStyle = "rgba(77,217,224,0.08)";
      ctx.lineWidth = 0.5;
      for (let i = 0; i <= COLS; i++) {
        const x = (W / COLS) * i;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
      }
      for (let i = 0; i <= ROWS; i++) {
        const y = (H / ROWS) * i;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      }

      // Waveforms
      waves.forEach((w) => {
        ctx.beginPath();
        ctx.lineWidth = w.lw;
        ctx.strokeStyle = w.color;
        ctx.globalAlpha = w.alpha;
        ctx.shadowColor = w.color;
        ctx.shadowBlur = 6;

        for (let x = 0; x <= W; x++) {
          const nx = x / W;
          const y =
            H * w.yBias -
            H * w.amp * (
              Math.sin(nx * Math.PI * 2 * w.freq + t + w.phase) * 0.6 +
              Math.sin(nx * Math.PI * 2 * w.freq * 2.3 + t * 1.4 + w.phase) * 0.25 +
              Math.sin(nx * Math.PI * 2 * w.freq * 0.4 + t * 0.6 + w.phase) * 0.15
            );
          x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;
      });

      // Cursor dot on primary wave
      const dotX = (t * 30) % (W + 16) - 8;
      const nx = dotX / W;
      const dotY =
        H * 0.35 -
        H * 0.22 * (
          Math.sin(nx * Math.PI * 2 * 1.8 + t) * 0.6 +
          Math.sin(nx * Math.PI * 2 * 4.1 + t * 1.4) * 0.25 +
          Math.sin(nx * Math.PI * 2 * 0.7 + t * 0.6) * 0.15
        );
      ctx.beginPath();
      ctx.arc(dotX, dotY, 2, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.shadowColor = "#4DD9E0";
      ctx.shadowBlur = 10;
      ctx.fill();
      ctx.shadowBlur = 0;

      // Live readouts
      ctx.font = "bold 8px monospace";
      ctx.fillStyle = "rgba(77,217,224,0.75)";
      ctx.fillText(`pH   ${(7.35 + Math.sin(t * 0.3) * 0.04).toFixed(2)}`, 6, 13);
      ctx.fillText(`CO₂  ${((40 + Math.sin(t * 0.2) * 1.5) / 7.5).toFixed(1)} kPa`, 6, 24);
      ctx.fillText(`O₂   ${(95 + Math.sin(t * 0.15)).toFixed(0)}%`, 6, 35);

      ctx.font = "6px monospace";
      ctx.fillStyle = "rgba(77,217,224,0.3)";
      ctx.fillText("LIVE", W - 22, H - 6);

      t += 0.012;
      frameRef.current = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(frameRef.current);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="rounded-lg"
      style={{ display: "block", imageRendering: "crisp-edges", width: "80%", height: "80%", margin: "auto", position: "absolute", inset: 0 }}
    />
  );
}

// ─── Landing Page ─────────────────────────────────────────────────────────────

// ─── Survey ───────────────────────────────────────────────────────────────────

const SURVEY_STATEMENTS = [
  "I know when it is clinically appropriate to order an arterial blood gas and what information it will provide",
  "I understand the difference between respiratory and metabolic causes of acid-base disturbance",
  "I can apply a systematic step-by-step approach when interpreting an ABG result",
  "I understand how the lungs and kidneys compensate for acid-base disorders",
  "I feel confident interpreting an ABG result in a real clinical scenario",
];

const LIKERT_LABELS = [
  { value: 1, label: "Not at all\nconfident" },
  { value: 2, label: "Slightly\nconfident" },
  { value: 3, label: "Moderately\nconfident" },
  { value: 4, label: "Quite\nconfident" },
  { value: 5, label: "Very\nconfident" },
];

function LikertSurvey({
  type,
  onComplete,
  embedded = false,
}: {
  type: "pre" | "post";
  onComplete: (responses: number[]) => void;
  embedded?: boolean;
}) {
  const [responses, setResponses] = useState<(number | null)[]>(
    Array(SURVEY_STATEMENTS.length).fill(null)
  );
  const [showSkipWarning, setShowSkipWarning] = useState(false);
  const allAnswered = responses.every((r) => r !== null);

  const isPre = type === "pre";

  const inner = (
    <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full"
      >
        {/* Header */}
        <div className={`mb-6 ${embedded ? "" : "text-center"}`}>
          <div className={`inline-flex items-center gap-2 bg-primary/10 border border-primary/30 rounded-full px-4 py-1.5 mb-3`}>
            <span className="text-primary text-xs font-medium tracking-widest uppercase" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
              {isPre ? "Pre-Course Survey" : "Post-Course Survey"}
            </span>
          </div>
          <h2
            className="text-xl font-bold text-foreground mb-1"
            style={{ fontFamily: "'DM Sans', sans-serif" }}
          >
            {isPre ? "Before we begin..." : "Reflecting on what you've learned"}
          </h2>
          <p className="text-muted-foreground text-sm leading-relaxed" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
            {isPre
              ? "Rate your confidence in each statement before starting the course. There are no right or wrong answers - this is just a baseline."
              : "Now that you've completed the course, rate your confidence again. Your responses help us understand the impact of this module."}
          </p>
        </div>

        {/* Statements */}
        <div className="space-y-3 mb-6">
          {SURVEY_STATEMENTS.map((statement, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
              className="rounded-lg border border-border bg-card p-4"
            >
              <p className="text-foreground text-sm font-medium mb-3 leading-relaxed" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                <span className="text-primary font-mono mr-2">{i + 1}.</span>
                {statement}
              </p>
              <div className="flex gap-1.5">
                {LIKERT_LABELS.map((opt) => {
                  const selected = responses[i] === opt.value;
                  return (
                    <button
                      key={opt.value}
                      onClick={() => {
                        const updated = [...responses];
                        updated[i] = opt.value;
                        setResponses(updated);
                      }}
                      className={`flex-1 flex flex-col items-center gap-1 py-2 rounded-md border text-xs transition-all ${
                        selected
                          ? "bg-primary border-primary text-primary-foreground"
                          : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground bg-muted/40"
                      }`}
                    >
                      <span className="font-mono font-bold text-sm leading-none">{opt.value}</span>
                      <span className="text-[9px] text-center leading-tight whitespace-pre-line opacity-80" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                        {opt.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </motion.div>
          ))}
        </div>

        {/* Progress indicator */}
        <div className="flex items-center gap-3 mb-5">
          <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-primary rounded-full"
              animate={{ width: `${(responses.filter(r => r !== null).length / SURVEY_STATEMENTS.length) * 100}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
          <span className="text-xs text-muted-foreground font-mono">
            {responses.filter(r => r !== null).length}/{SURVEY_STATEMENTS.length}
          </span>
        </div>

        {/* Fletcher warning dialog */}
        <AnimatePresence>
          {showSkipWarning && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="mb-4 rounded-xl border border-border bg-[#0D1B2A] overflow-hidden shadow-xl"
            >
              <ImageWithFallback
                src={isPre ? fletcherImg : gretaImg}
                alt={isPre ? "Terence Fletcher raising his fist" : "Greta Thunberg looking furious"}
                className="w-full object-cover"
                style={{ maxHeight: 180, objectPosition: "center 20%" }}
              />
              <div className="px-5 py-4">
                <p className="text-white text-sm leading-relaxed italic" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                  {isPre
                    ? "\"You're rushing. Not quite my tempo. Go back, and answer all the questions.\""
                    : "\"How dare you?! Go back and answer all of the questions.\""}
                </p>
                <button
                  onClick={() => setShowSkipWarning(false)}
                  className="mt-3 text-xs text-[#4DD9E0] hover:underline font-medium"
                  style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
                >
                  ...okay, fine →
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Submit */}
        <div className="flex items-center justify-between">
          <button
              onClick={() => setShowSkipWarning(true)}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
              style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
            >
              Nah, skip
            </button>
          <motion.button
            onClick={() => allAnswered && onComplete(responses as number[])}
            disabled={!allAnswered}
            whileHover={allAnswered ? { scale: 1.02 } : {}}
            whileTap={allAnswered ? { scale: 0.98 } : {}}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-lg font-medium text-sm transition-all ${
              isPre ? "" : "ml-auto"
            } ${
              allAnswered
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "bg-muted text-muted-foreground cursor-not-allowed"
            }`}
            style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
          >
            {allAnswered ? "Continue" : "Please answer all statements"}
            <ChevronRight size={16} />
          </motion.button>
        </div>
      </motion.div>
  );

  if (embedded) return <div>{inner}</div>;

  return (
    <div className="min-h-screen bg-[#0D1B2A] flex flex-col items-center justify-center px-4 py-12">
      {inner}
    </div>
  );
}

function LandingPage({ onStart }: { onStart: () => void }) {

  return (
    <div className="min-h-screen bg-[#0D1B2A] flex flex-col items-center justify-center px-6 py-12 overflow-hidden relative">
      {/* subtle grid background */}
      <SciFiShader variant={1} />

      <div className="relative z-10 flex flex-col items-center text-center max-w-2xl w-full">


        {/* title */}
        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="text-4xl sm:text-5xl font-bold text-white leading-tight mb-3"
          style={{ fontFamily: "'DM Sans', sans-serif" }}
        >
          Arterial Blood Gas
          <br />
          <span className="text-[#4DD9E0]">Interpretation</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="text-slate-400 text-sm leading-relaxed mb-8 max-w-md"
          style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
        >
          Ms. Olivia McKeon-Williams
          <br />
          Dr. Ahmed Surya
        </motion.p>

        {/* stats */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="flex items-center gap-6 text-xs text-slate-400 mb-10 px-7 py-4 rounded-2xl"
          style={{
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            background: "linear-gradient(135deg, rgba(255,255,255,0.07) 0%, rgba(77,217,224,0.04) 100%)",
            backdropFilter: "blur(20px) saturate(1.4)",
            WebkitBackdropFilter: "blur(20px) saturate(1.4)",
            border: "1px solid rgba(255,255,255,0.10)",
            boxShadow: "0 4px 24px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.12)",
          }}
        >
          {[
            { label: "Modules", value: "10" },
            { label: "Pass mark", value: "80%" },
            { label: "Certificate", value: "Included" },
          ].map((s, i) => (
            <div key={s.label} className="flex flex-col items-center gap-0.5">
              <span className="text-white font-semibold text-sm font-mono">{s.value}</span>
              <span>{s.label}</span>
            </div>
          ))}
        </motion.div>

        {/* analyser with button overlay */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.35 }}
          className="relative w-72 sm:w-80"
        >
          <ImageWithFallback
            src={analyserImg}
            alt="GEM 7000 blood gas analyser"
            className="w-full object-contain drop-shadow-2xl"
          />

          {/* Shader canvas fills the analyser screen area */}
          <div
            className="absolute overflow-hidden rounded-sm"
            style={{ top: "1%", left: "12%", width: "76%", height: "47%" }}
          >
            <AnalyserShader />

            {/* Begin button centred over the shader */}
            <motion.button
              onClick={onStart}
              whileHover={{ scale: 1.06 }}
              whileTap={{ scale: 0.96 }}
              className="absolute inset-0 flex flex-col items-center justify-center gap-0 cursor-pointer focus:outline-none group rounded-[76px]"
              style={{ background: "transparent" }}
            >
              <motion.div
                animate={{ scale: [1, 1.18, 1], opacity: [0.5, 0, 0.5] }}
                transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
                className="absolute w-14 h-14 rounded-full bg-[#0A6E74]"
                style={{ top: "calc(50% + 30px)", left: "50%", marginLeft: "-28px", marginTop: "-28px" }}
              />
              <div className="relative flex items-center justify-center drop-shadow-lg group-hover:scale-105 transition-transform mt-4">
                <svg width="90" height="90" viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ marginTop: "40px" }}>
                  {/* Syringe barrel */}
                  <rect x="14" y="24" width="24" height="8" rx="2" fill="#0A6E74"/>
                  {/* Plunger rod */}
                  <rect x="38" y="26.5" width="8" height="3" rx="1" fill="#0A6E74"/>
                  {/* Plunger handle */}
                  <rect x="45" y="23" width="2" height="10" rx="1" fill="#4DD9E0"/>
                  {/* Needle hub */}
                  <rect x="10" y="25.5" width="4" height="5" rx="1" fill="#1A9DA6"/>
                  {/* Needle */}
                  <rect x="4" y="27.2" width="7" height="1.6" rx="0.8" fill="#4DD9E0"/>
                  {/* Fluid fill inside barrel */}
                  <rect x="16" y="26" width="14" height="4" rx="1" fill="#4DD9E0" opacity="0.5"/>
                  {/* Tick marks on barrel */}
                  <line x1="21" y1="24" x2="21" y2="22" stroke="#4DD9E0" strokeWidth="1" opacity="0.6"/>
                  <line x1="26" y1="24" x2="26" y2="22" stroke="#4DD9E0" strokeWidth="1" opacity="0.6"/>
                  <line x1="31" y1="24" x2="31" y2="22" stroke="#4DD9E0" strokeWidth="1" opacity="0.6"/>
                </svg>
              </div>
              <span
                className="relative text-[13px] font-semibold text-[#4DD9E0] tracking-[0.18em] uppercase -mt-8"
                style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
              >
                Start
              </span>
            </motion.button>
          </div>
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.5 }}
          className="text-slate-500 text-xs mt-4"
          style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
        >
          This resource was developed for Medical Students
        </motion.p>

        {/* Shader picker */}
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────

export default function App() {
  const [started, setStarted] = useState(false);
  const [devMode, setDevMode] = useState(false);
  const [showDevPrompt, setShowDevPrompt] = useState(false);
  const [devPassword, setDevPassword] = useState("");
  const [devError, setDevError] = useState(false);
  const [currentModule, setCurrentModule] = useState(0);
  const [completedModules, setCompletedModules] = useState<Set<number>>(new Set());
  const [finalScore, setFinalScore] = useState<number | null>(null);
  const [scenariosDone, setScenariosDone] = useState(false);
  const [learnerName, setLearnerName] = useState("");
  const [startTime] = useState(Date.now());
  const scormRef = useRef<any>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // SCORM init
  useEffect(() => {
    const api = initSCORM();
    scormRef.current = api;
    if (api) {
      const stored = scormGet(api, "cmi.suspend_data");
      if (stored) {
        try {
          const data = JSON.parse(stored);
          if (data.completedModules)
            setCompletedModules(new Set(data.completedModules));
          if (data.currentModule) setCurrentModule(data.currentModule);
          if (data.learnerName) setLearnerName(data.learnerName);
        } catch {}
      }
      const name =
        scormGet(api, "cmi.core.student_name") ||
        scormGet(api, "cmi.learner_name");
      if (name) setLearnerName(name);
    }
    return () => {
      finishSCORM(scormRef.current);
    };
  }, []);

  const saveProgress = useCallback(
    (completed: Set<number>, modIdx: number) => {
      const api = scormRef.current;
      if (!api) return;
      const data = JSON.stringify({
        completedModules: Array.from(completed),
        currentModule: modIdx,
        learnerName,
      });
      scormSet(api, "cmi.suspend_data", data);
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      const hh = String(Math.floor(elapsed / 3600)).padStart(2, "0");
      const mm = String(Math.floor((elapsed % 3600) / 60)).padStart(2, "0");
      const ss = String(elapsed % 60).padStart(2, "0");
      scormSet(api, "cmi.core.session_time", `${hh}:${mm}:${ss}`);
    },
    [learnerName, startTime]
  );

  const markComplete = (moduleIdx: number) => {
    const updated = new Set(completedModules);
    updated.add(moduleIdx);
    setCompletedModules(updated);
    saveProgress(updated, moduleIdx);
  };

  const goToModule = (idx: number) => {
    if (!devMode && idx > 0 && !completedModules.has(idx - 1)) return;
    setCurrentModule(idx);
    contentRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleNext = () => {
    markComplete(currentModule);
    if (currentModule < MODULES.length - 1) {
      goToModule(currentModule + 1);
    }
  };

  const handleScenariosDone = () => {
    markComplete(6);
    goToModule(7);
  };

  const handleAssessmentComplete = (score: number, quizAnswers: QuizAnswer[]) => {
    setFinalScore(score);
    const api = scormRef.current;
    if (api) {
      scormSet(api, "cmi.core.score.raw", String(score));
      scormSet(api, "cmi.core.score.min", "0");
      scormSet(api, "cmi.core.score.max", "100");
      scormSet(api, "cmi.core.lesson_status", score >= 80 ? "passed" : "failed");
      scormSet(api, "cmi.completion_status", score >= 80 ? "completed" : "incomplete");
      // Record each quiz answer as a choice interaction (indices 5-9)
      quizAnswers.forEach((a, i) => {
        const q = QUIZ_QUESTIONS[a.questionIdx];
        scormInteraction(
          api,
          5 + i,
          `quiz_q${i + 1}`,
          "choice",
          q.options[a.selectedIdx].text.substring(0, 255),
          q.options.find(o => o.correct)?.text.substring(0, 255) ?? "",
          a.correct ? "correct" : "wrong"
        );
      });
    }
    markComplete(7);
    goToModule(8);
  };

  const mod = MODULES[currentModule];
  const isLastModule = currentModule === MODULES.length - 1;
  const showCompletion = mod?.id === "certificate";

  const renderContent = () => {
    if (showCompletion) {
      return <CompletionScreen score={finalScore!} learnerName={learnerName} />;
    }
    switch (mod.id) {
      case "pre-survey":
        return (
          <LikertSurvey
            key="pre-survey"
            type="pre"
            embedded
            onComplete={(r) => {
              const api = scormRef.current;
              if (api) {
                r.forEach((val, i) => scormInteraction(api, i, `pre_survey_${i + 1}`, "likert", String(val)));
                const stored = JSON.parse(scormGet(api, "cmi.suspend_data") || "{}");
                scormSet(api, "cmi.suspend_data", JSON.stringify({ ...stored, preSurvey: r }));
              }
              const updated = new Set(completedModules);
              updated.add(currentModule);
              setCompletedModules(updated);
              saveProgress(updated, currentModule);
              setCurrentModule(1);
              contentRef.current?.scrollTo({ top: 0, behavior: "smooth" });
            }}
          />
        );
      case "post-survey":
        return (
          <LikertSurvey
            key="post-survey"
            type="post"
            embedded
            onComplete={(r) => {
              const api = scormRef.current;
              if (api) {
                r.forEach((val, i) => scormInteraction(api, 10 + i, `post_survey_${i + 1}`, "likert", String(val)));
                const stored = JSON.parse(scormGet(api, "cmi.suspend_data") || "{}");
                scormSet(api, "cmi.suspend_data", JSON.stringify({ ...stored, postSurvey: r }));
              }
              const updated = new Set(completedModules);
              updated.add(currentModule);
              setCompletedModules(updated);
              saveProgress(updated, currentModule);
              setCurrentModule(9);
              contentRef.current?.scrollTo({ top: 0, behavior: "smooth" });
            }}
          />
        );
      case "intro":
        return <IntroModule />;
      case "normal-values":
        return <NormalValuesModule />;
      case "systematic":
        return <SystematicModule />;
      case "disorders":
        return <DisordersModule />;
      case "mixed":
        return <MixedModule />;
      case "scenarios":
        return (
          <ScenariosModule
            onComplete={handleScenariosDone}
            key={scenariosDone ? "done" : "active"}
          />
        );
      case "assessment":
        return (
          <AssessmentModule
            key="assessment"
            onComplete={handleAssessmentComplete}
          />
        );
      case "certificate":
        return <CompletionScreen score={finalScore ?? 0} learnerName={learnerName} />;
      default:
        return null;
    }
  };

  const showNextButton =
    !showCompletion &&
    mod.type === "content" &&
    !completedModules.has(currentModule);

  if (!started) {
    return (
      <AnimatePresence>
        <LandingPage onStart={() => setStarted(true)} />
      </AnimatePresence>
    );
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-background">
      {/* Top bar */}
      <header className="flex-shrink-0 border-b border-border bg-[#0D1B2A] text-white flex items-center justify-between px-6 py-3">
        <div className="flex items-center gap-3">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="#4DD9E0" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2C12 2 4 10.5 4 15.5C4 19.6 7.6 23 12 23C16.4 23 20 19.6 20 15.5C20 10.5 12 2 12 2Z"/>
          </svg>
          <span
            className="font-semibold text-sm"
            style={{ fontFamily: "'DM Sans', sans-serif" }}
          >
            Blood Gas Interpretation
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-400">
          <Clock size={13} />
          <span>
            {completedModules.size} / {MODULES.length} modules
          </span>
          <div className="w-24 h-1 bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#0A6E74] rounded-full transition-all"
              style={{
                width: `${(completedModules.size / MODULES.length) * 100}%`,
              }}
            />
          </div>
          <button
            onClick={() => {
              finishSCORM(scormRef.current);
              window.close();
            }}
            className="flex items-center gap-1.5 text-slate-400 hover:text-white border border-slate-700 hover:border-slate-500 rounded-md px-2.5 py-1.5 transition-colors ml-2"
          >
            <LogOut size={12} />
            Exit
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-64 flex-shrink-0 border-r border-border bg-[#0D1B2A] text-white overflow-y-auto hidden md:flex flex-col">
          <div className="p-4 space-y-1">
            {/* Home link */}
            <button
              onClick={() => setStarted(false)}
              className="w-full text-left flex items-start gap-3 px-3 py-2.5 rounded-lg text-sm text-slate-300 hover:bg-[#1A2E40] transition-all mb-2"
            >
              <div className="flex-shrink-0 mt-0.5">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z"/>
                  <polyline points="9 21 9 12 15 12 15 21"/>
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <div className="leading-tight truncate">Home</div>
                <div className="text-[11px] text-slate-500 mt-0.5">Return to landing page</div>
              </div>
            </button>
            <div className="border-t border-slate-700/50 mb-2" />
            {MODULES.map((m, i) => {
              const Icon = ICON_MAP[m.icon];
              const done = completedModules.has(i);
              const active = currentModule === i && !showCompletion;
              const locked = !devMode && i > 0 && !completedModules.has(i - 1) && !done;
              return (
                <button
                  key={m.id}
                  onClick={() => !locked && goToModule(i)}
                  disabled={locked}
                  className={`w-full text-left flex items-start gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${
                    active
                      ? "bg-[#0A6E74] text-white"
                      : done
                      ? "text-slate-300 hover:bg-[#1A2E40]"
                      : locked
                      ? "text-slate-600 cursor-not-allowed"
                      : "text-slate-300 hover:bg-[#1A2E40]"
                  }`}
                >
                  <div className="flex-shrink-0 mt-0.5">
                    {done ? (
                      <CheckCircle size={15} className="text-[#4DD9E0]" />
                    ) : (
                      <Icon size={15} className={locked ? "opacity-40" : ""} />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="leading-tight truncate">{m.title}</div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Dev mode lock icon */}
          <div className="mt-auto p-4 border-t border-slate-700/40">
            <button
              onClick={() => { setShowDevPrompt(true); setDevError(false); setDevPassword(""); }}
              className="flex items-center gap-2 text-slate-700 hover:text-slate-400 text-[11px] transition-colors"
            >
              {devMode ? <LockOpen size={11} className="text-[#4DD9E0]" /> : <Lock size={11} />}
              {devMode && <span className="text-[#4DD9E0]">Dev mode active</span>}
            </button>
          </div>
        </aside>

        {/* Dev mode password modal */}
        {showDevPrompt && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowDevPrompt(false)}>
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-card rounded-xl border border-border p-6 w-72 space-y-4 shadow-xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center gap-2">
                <Lock size={16} className="text-muted-foreground" />
                <h3 className="font-semibold text-foreground text-sm">Developer Mode</h3>
              </div>
              <p className="text-xs text-muted-foreground">Enter the password to unlock all modules for testing.</p>
              <input
                type="password"
                value={devPassword}
                onChange={e => { setDevPassword(e.target.value); setDevError(false); }}
                onKeyDown={e => {
                  if (e.key === "Enter") {
                    if (devPassword === "password") {
                      setDevMode(true);
                      setCompletedModules(new Set(MODULES.map((_, i) => i)));
                      setShowDevPrompt(false);
                    } else {
                      setDevError(true);
                    }
                  }
                }}
                placeholder="Password"
                autoFocus
                className={`w-full border rounded-lg px-3 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-colors ${devError ? "border-destructive" : "border-border"}`}
              />
              {devError && <p className="text-xs text-destructive">Incorrect password.</p>}
              <div className="flex gap-2 justify-end">
                <button onClick={() => setShowDevPrompt(false)} className="text-xs text-muted-foreground hover:text-foreground px-3 py-1.5">Cancel</button>
                <button
                  onClick={() => {
                    if (devPassword === "password") {
                      setDevMode(true);
                      setCompletedModules(new Set(MODULES.map((_, i) => i)));
                      setShowDevPrompt(false);
                    } else {
                      setDevError(true);
                    }
                  }}
                  className="bg-primary text-primary-foreground text-xs px-4 py-1.5 rounded-lg hover:bg-primary/90 transition-colors"
                >
                  Unlock
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Content */}
        <main
          ref={contentRef}
          className="flex-1 overflow-y-auto"
          style={{ scrollbarWidth: "none" }}
        >
          <div className="max-w-2xl mx-auto px-6 py-8">
            <AnimatePresence mode="wait">
              <motion.div
                key={showCompletion ? "completion" : mod.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25 }}
              >
                {!showCompletion && (
                  <div className="mb-6">
                    <div className="text-xs text-muted-foreground uppercase tracking-widest font-sans mb-1">
                      Module {currentModule + 1} of {MODULES.length}
                    </div>
                    <h1
                      className="text-2xl font-semibold text-foreground"
                      style={{ fontFamily: "'DM Sans', sans-serif" }}
                    >
                      {mod.title}
                    </h1>
                  </div>
                )}

                {renderContent()}

                {showNextButton && (
                  <div className="mt-8 flex justify-end">
                    <button
                      onClick={() => {
                        const updated = new Set(completedModules);
                        updated.add(currentModule);
                        setCompletedModules(updated);
                        saveProgress(updated, currentModule);
                        if (currentModule < MODULES.length - 1) {
                          setCurrentModule(currentModule + 1);
                          contentRef.current?.scrollTo({ top: 0, behavior: "smooth" });
                        }
                      }}
                      className="flex items-center gap-2 bg-primary text-primary-foreground px-6 py-2.5 rounded-lg font-medium hover:bg-primary/90 transition-colors"
                    >
                      {isLastModule ? "Complete Module" : "Next Module"}
                      <ChevronRight size={16} />
                    </button>
                  </div>
                )}

                {showNextButton && completedModules.has(currentModule) && (
                  <div className="mt-8 flex justify-end">
                    <button
                      onClick={() => goToModule(currentModule + 1)}
                      className="flex items-center gap-2 bg-primary text-primary-foreground px-6 py-2.5 rounded-lg font-medium hover:bg-primary/90 transition-colors"
                    >
                      Continue
                      <ChevronRight size={16} />
                    </button>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="md:hidden flex-shrink-0 border-t border-border bg-[#0D1B2A] overflow-x-auto flex">
        {MODULES.map((m, i) => {
          const done = completedModules.has(i);
          const active = currentModule === i;
          const locked = !devMode && i > 0 && !completedModules.has(i - 1);
          return (
            <button
              key={m.id}
              onClick={() => !locked && goToModule(i)}
              disabled={locked}
              className={`flex-shrink-0 px-4 py-3 text-xs text-center flex flex-col items-center gap-1 transition-colors ${
                active ? "text-[#4DD9E0]" : done ? "text-slate-400" : "text-slate-600"
              }`}
            >
              {done ? (
                <CheckCircle size={14} />
              ) : (
                <span className="font-mono">{i + 1}</span>
              )}
              <span className="max-w-[60px] leading-tight truncate">{m.title.split(" ")[0]}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
