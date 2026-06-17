# Plan: Dev Mode Unlock (Password Lock Icon)

## Context
During testing, having to complete every module in sequence is slow. A small lock icon at the bottom of the sidebar opens a password prompt — enter the correct password and all modules unlock instantly.

## Implementation

### 1. Add `devMode` state to `App`
```ts
const [devMode, setDevMode] = useState(false);
const [showDevPrompt, setShowDevPrompt] = useState(false);
```

### 2. Lock icon at the bottom of the sidebar
In the `<aside>` sidebar, below the module list, add a small `Lock` icon button (from lucide-react — already imported or easy to add):

```tsx
<div className="p-4 mt-auto border-t border-slate-700/50">
  <button
    onClick={() => setShowDevPrompt(true)}
    className="flex items-center gap-2 text-slate-600 hover:text-slate-400 text-xs transition-colors"
  >
    <Lock size={12} />
    {devMode && <span className="text-[#4DD9E0]">Dev mode</span>}
  </button>
</div>
```

### 3. Password prompt modal
When `showDevPrompt` is true, render a small modal overlay with a password input. On submit, check `value === "password"` — if correct, call `setDevMode(true)`, mark all modules complete, and close the modal. If wrong, shake the input and show "Incorrect password".

```tsx
{showDevPrompt && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
    <div className="bg-card rounded-xl border border-border p-6 w-72 space-y-4">
      <h3>Developer Mode</h3>
      <input type="password" ... />
      <button onClick={handleDevSubmit}>Unlock</button>
    </div>
  </div>
)}
```

### 4. Wire `devMode` into navigation guards
```ts
// goToModule:
if (!devMode && idx > 0 && !completedModules.has(idx - 1)) return;

// sidebar locked:
const locked = !devMode && i > 0 && !completedModules.has(i - 1) && !done;
```

### 5. On unlock — mark all complete
```ts
setCompletedModules(new Set(MODULES.map((_, i) => i)));
```

Add `Lock` to the lucide-react import.

## Files to modify
- `src/app/App.tsx`: `App` state, sidebar JSX, `goToModule`, sidebar `locked` calculation, lucide import

## Verification
- Lock icon visible at bottom of sidebar (subtle, unobtrusive)
- Clicking it opens password prompt
- Wrong password: error shown, no unlock
- Correct password ("password"): all modules unlock, lock icon shows "Dev mode" label

---

# Plan: Certificate as Separate Locked Module

## Context
The completion screen (certificate + rating) currently appears as a full-screen overlay triggered by `showCompletion` state. The user wants it as a proper named module in the sidebar, locked until the post-course survey is complete.

## Implementation

### 1. Add "Certificate" to MODULES (index 9)
```ts
{ id: "certificate", title: "Certificate", icon: "Award", estimatedMinutes: 2, type: "certificate" }
```
Add `Award` to `ICON_MAP`. `Award` is already imported from lucide-react.

### 2. Remove `showCompletion` state — derive it instead
Replace `const [showCompletion, setShowCompletion] = useState(false)` with:
```ts
const showCompletion = mod?.id === "certificate";
```
Remove all `setShowCompletion(...)` calls.

### 3. Update post-survey `onComplete` in `renderContent`
Change from `setShowCompletion(true)` to:
```ts
const updated = new Set(completedModules);
updated.add(currentModule);   // marks module 8
setCompletedModules(updated);
saveProgress(updated, currentModule);
setCurrentModule(9);
contentRef.current?.scrollTo({ top: 0, behavior: "smooth" });
```

### 4. Add "certificate" case to `renderContent()`
```tsx
case "certificate":
  return <CompletionScreen score={finalScore ?? 0} learnerName={learnerName} />;
```

### 5. Sidebar styling
The existing lock logic (`i > 0 && !completedModules.has(i - 1)`) automatically locks module 9 until module 8 is complete — no extra code needed.

## File to modify
- `src/app/App.tsx` — MODULES array, ICON_MAP, `showCompletion` derivation, post-survey handler, `renderContent`

## Verification
- Certificate tab appears in sidebar, locked (greyed out) until post-survey submitted
- Completing post-survey navigates to Certificate module
- Certificate content and download work as before

---

# Plan: Full SCORM Reporting for LearningCentral

## Context
The user wants full attempt detail visible in LearningCentral (Cardiff's Moodle VLE) — quiz scores, individual question responses, pre/post survey data, and time spent. Currently only the total score and pass/fail are properly visible. Survey responses are buried in `cmi.suspend_data`, which Moodle cannot surface in any report.

## What LearningCentral actually exposes to instructors

| Data | Where it appears | Current status |
|---|---|---|
| Total quiz score | **Gradebook** (score.raw) | ✅ Already wired |
| Pass / fail | **Gradebook** (lesson_status) | ✅ Already wired |
| Time spent | SCORM activity report | ✅ Already wired (session_time) |
| Individual question responses | SCORM activity report → Interactions tab | ❌ Not recorded |
| Pre/post survey responses | SCORM activity report → Interactions tab | ❌ Buried in suspend_data |
| Student name | Pulled from LMS automatically | ✅ Already wired |

The **SCORM activity report** (Moodle → SCORM activity → Reports) is separate from the gradebook but accessible to all instructors and **downloadable as CSV/Excel**. It reads `cmi.interactions.*`. This is the right place for survey and per-question data.

## Implementation

### 1. New helper — `scormInteraction()`
Add to `src/app/App.tsx` alongside existing SCORM helpers:

```ts
function scormInteraction(
  api: any,
  n: number,
  id: string,
  type: string,
  response: string,
  correctPattern?: string,
  result?: string
) {
  const base = `cmi.interactions.${n}`;
  scormSet(api, `${base}.id`, id);
  scormSet(api, `${base}.type`, type);
  scormSet(api, `${base}.student_response`, response);
  if (correctPattern) scormSet(api, `${base}.correct_responses.0.pattern`, correctPattern);
  scormSet(api, `${base}.result`, result ?? "neutral");
}
```

### 2. Record pre-survey interactions (interactions 0–4)
In the pre-survey `onComplete` handler in `App` (~line 2943), after saving to suspend_data, loop over the 5 responses and call `scormInteraction` with type `"likert"`:

```ts
r.forEach((val, i) => {
  scormInteraction(api, i, `pre_survey_${i + 1}`, "likert", String(val));
});
```

### 3. Record quiz question interactions (interactions 5–9)
`AssessmentModule` currently passes only the final score to `onComplete`. Change its signature to also pass the per-question answers:

- Change `onComplete: (score: number) => void` → `onComplete: (score: number, answers: { questionIdx: number; selectedIdx: number; correct: boolean }[]) => void`
- In `AssessmentModule`, accumulate a `answers` array alongside `scores` — add `selectedIdx` to each entry when `handleAnswer` fires
- In `handleAssessmentComplete` in `App`, receive the answers and loop to call `scormInteraction` with type `"choice"`, the selected option text as `student_response`, the correct option text as `correctPattern`, and `"correct"` / `"wrong"` as `result`

### 4. Record post-survey interactions (interactions 10–14)
Same pattern as pre-survey but with offset `n = 10 + i` and id `post_survey_${i+1}`.

### 5. Moodle SCORM activity setup (instructor instruction, not code)
In LearningCentral, the SCORM activity should be configured with:
- **Grading method:** Highest attempt (or Latest)
- **Display attempt status:** Yes
- Reports → Interactions tab shows all `cmi.interactions` per student, downloadable as CSV

## Interaction numbering convention
| Index | ID | Type | Content |
|---|---|---|---|
| 0–4 | `pre_survey_1` … `pre_survey_5` | likert | Pre-course confidence (1–5) |
| 5–9 | `quiz_q1` … `quiz_q5` | choice | Quiz question responses |
| 10–14 | `post_survey_1` … `post_survey_5` | likert | Post-course confidence (1–5) |

## Files to modify
- `src/app/App.tsx`:
  - Add `scormInteraction()` helper (~line 60, with other SCORM helpers)
  - Pre-survey `onComplete` handler (~line 2943): add interaction recording loop
  - Post-survey `onComplete` handler (~line 2961): add interaction recording loop
  - `handleAssessmentComplete` (~line 2864): receive answer array, record quiz interactions
  - `AssessmentModule` component (~line 1581): extend `onComplete` signature and accumulate per-answer data

## Verification
1. Complete a quiz attempt → open LearningCentral SCORM report → Interactions tab shows 15 rows (5 pre-survey, 5 quiz, 5 post-survey)
2. Gradebook shows score.raw correctly
3. CSV export from Moodle includes all interaction fields
4. Re-attempting the course creates a new attempt in the SCORM report

---

# Plan: Exit Button

## Context
In a SCORM context the module is typically launched in a new browser window or LMS popup. Students need a clean way to close the window when they're done. The exit should also properly terminate the SCORM session before closing.

## Implementation

**Single change** — add an "Exit" button to the top header bar (`<header>` in the App component, `src/app/App.tsx`).

The button will:
1. Call `finishSCORM(scormRef.current)` to properly terminate the SCORM session
2. Call `window.close()` to shut the window

`finishSCORM` already exists at the top of `App.tsx` — reuse it directly.

Place the button on the right side of the header, next to the progress bar. Style it as a small ghost/outline button with an `X` or `LogOut` icon from `lucide-react` (already imported).

```tsx
<button
  onClick={() => {
    finishSCORM(scormRef.current);
    window.close();
  }}
  className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white border border-slate-700 hover:border-slate-500 rounded-md px-2.5 py-1.5 transition-colors"
>
  <LogOut size={12} />
  Exit
</button>
```

Add `LogOut` to the existing lucide-react import.

## File to Modify
- `src/app/App.tsx` — header section (~line 2860), lucide import (~line 5)

## Verification
- Button appears in the top-right of the header on all screens
- Clicking it closes the tab/window
- In a SCORM-aware environment, `LMSFinish` is called before close

---

# Plan: Acid-Base Chemistry & Renal Homeostasis Visual Section

## Context
The NormalValuesModule currently ends with a static one-liner "pH paradox" box. The user wants to replace this with interactive visual content covering two foundational concepts:
1. How rising CO₂ and ketones drive acidosis (and vice versa) — the Henderson-Hasselbalch equilibrium
2. How the kidneys stabilise pH through physiological homeostasis mechanisms

The selected element to replace is the `<div className="rounded-lg bg-card border border-border p-4...">` pH paradox box at the bottom of `NormalValuesModule` (~line 790).

## Scope
Modify **only** the selected element — replace the static pH paradox div with a richer two-part interactive section, keeping everything inside the existing `NormalValuesModule` return JSX.

## Implementation

### Part 1 — Acid Equilibrium Simulator (interactive slider)

Replace the static box with a new `AcidEquilibriumSimulator` component that renders inline. Two sliders:
- **CO₂ level** (low → high, labelled in kPa: 2–12 kPa)
- **Ketone level** (absent → severe, 0–4 scale)

Visual output:
- Animated chemical equation: `CO₂ + H₂O ⇌ H₂CO₃ ⇌ H⁺ + HCO₃⁻`  
  — Arrow thickness/colour shifts based on slider values to show equilibrium direction
- A live pH gauge (number + colour band: red <7.35, green 7.35–7.45, blue >7.45) that recalculates in real time using a simplified Henderson-Hasselbalch approximation:  
  `pH ≈ 7.4 − (CO₂offset × 0.08) − (ketones × 0.12)`
- A short contextual label below ("Respiratory acidosis", "Metabolic acidosis — DKA", "Normal range", etc.)

State: `useState` for `co2Level` and `ketoneLevel` (numbers). No external deps needed.

### Part 2 — Renal Homeostasis Mechanism Tabs

Below Part 1, a tabbed section with 3 tabs:

**Tab 1 — HCO₃⁻ Reabsorption**
- Simple SVG diagram of proximal tubule lumen vs blood
- Animated dashed arrows showing HCO₃⁻ filtered → reclaimed
- Text: "The proximal tubule reclaims ~85% of filtered bicarbonate. In acidosis, this process is upregulated — more HCO₃⁻ is retained, raising blood pH."

**Tab 2 — H⁺ Secretion**
- SVG diagram of distal tubule
- H⁺ ions shown moving from cell into tubule lumen, combined with NH₃ → NH₄⁺
- Text: "Intercalated cells in the distal tubule and collecting duct secrete H⁺ directly into the filtrate. This H⁺ combines with phosphate buffers (titratable acid) and ammonia (→ NH₄⁺) for excretion."

**Tab 3 — Timeline**
- Visual timeline bar: Respiratory compensation (seconds–minutes) vs Renal compensation (hours–days)
- Simple horizontal bar chart using divs (no recharts needed)
- Note: "Renal compensation is slower but more powerful — it can fully correct pH over 3–5 days."

### State & Patterns
- `useState<number>` for `activeTab` (0/1/2) — same pattern as `SystematicModule`
- `AnimatePresence` + `motion.div` height animation for tab content — same pattern as `DisorderCard`
- `useState` for `co2Level`, `ketoneLevel` sliders (range inputs, styled with Tailwind)
- All within a single self-contained block replacing the selected div

## File to Modify
- `/workspaces/default/code/src/app/App.tsx` — replace the pH paradox `<div>` (~line 790) with the new two-part section

## Verification
1. Preview renders with no blank screen
2. Sliders move → pH gauge colour and value update in real time
3. Chemical equation arrows visibly shift direction/intensity
4. All 3 tabs display correct content and animate in/out
5. "Next Module" button still works after interacting with new section
