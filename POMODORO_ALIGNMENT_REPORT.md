# NeonModoro vs. the Official Pomodoro Technique — Alignment Report

**Date**: 2026-08-27
**Scope**: Compares NeonModoro's current feature set against Francesco Cirillo's original
Pomodoro Technique (as documented in his book and on pomodorotechnique.com), and lists what's
missing or divergent, with priorities and concrete recommendations.

---

## 1. What the official technique actually specifies

Researched directly for this report (see Sources at the bottom) rather than assumed from
memory. The technique is a **complete system**, not just a 25-minute timer:

### 1.1 The core interval
- A **Pomodoro** = 25 minutes of focused work on **one chosen task**, followed by a **5-minute
  break**.
- After **every 4 Pomodoros**, take a **longer break of 15–30 minutes** instead of the usual
  5-minute one. The cycle then resets and repeats.
- A Pomodoro is treated as **indivisible**: it's not meant to be paused to check messages,
  email, or chat. If a genuine interruption can't be deferred, the convention is to **void the
  Pomodoro and restart it from zero**, rather than pause and resume it.
- If the task is finished before the 25 minutes are up, the guidance is to use the remaining
  time for **"overlearning"** — reviewing, polishing, or double-checking the work — rather than
  stopping early.

### 1.2 The five stages (the parts most apps skip)
Cirillo's method is explicitly built around five stages, most of which happen *around* the
timer rather than during it:

1. **Planning** — at the start of the day, choose which task(s) to work on today (the "To Do
   Today" sheet), in priority order, each with an *estimated* number of Pomodoros.
2. **Tracking** — during the day, record each completed Pomodoro against the task it was spent
   on (traditionally an "X" on paper).
3. **Recording** — at the end of the day, compile that raw data into a Records sheet/archive.
4. **Processing** — turn that raw data into information (how much did I actually get done vs.
   estimated?).
5. **Visualizing** — review it in a way that shows patterns and informs tomorrow's planning.

Supporting artifacts named in the method: an **Activity Inventory** (a running backlog of all
tasks/projects, bigger than just today), a **To Do Today** sheet (today's prioritized subset,
each task's Pomodoro estimate, plus an "Unplanned & Urgent Activities" section for things that
come up during the day), and a **Records sheet** (the historical log).

### 1.3 Interruptions
For interruptions that can't be avoided, the method prescribes a specific four-step response:
**Inform** (tell whoever/whatever is interrupting that you're mid-Pomodoro), **Negotiate**
(agree on a specific time to deal with it instead), **Schedule** (write it down immediately so
it isn't lost), **Call back** (resume the Pomodoro, and follow up on the deferred item later as
promised).

---

## 2. What NeonModoro currently does

- A single 25:00 countdown ("work session") and a single 5:00 countdown ("break session"),
  alternating forever: work → break → work → break → ...
- No concept of a 4th-Pomodoro long break — every break is 5 minutes, indefinitely.
- No task field, task list, or any way to say *what* the current Pomodoro is for. The timer is
  purely a generic interval clock.
- No Pomodoro counter — there is no visible tally of how many work sessions have been completed
  today, this session, or ever. (This is also *why* there's no long-break trigger: the app has
  no counter to trigger it from.)
- No history/records of any kind — by design, nothing persists across a countdown reset or app
  restart except the new Settings feature (digit color, minute-mark alarm). The countdown state
  itself intentionally resets on every launch (original spec requirement).
- No effort estimation, no Activity Inventory, no "To Do Today" list.
- Pause/Resume is a first-class feature — the countdown can be paused and resumed with exact
  time preserved. This is a deliberate, user-friendly convenience, and it's the single most
  direct divergence from the strict "indivisible Pomodoro" rule above (more on this below).
- No structured interruption workflow (no way to log/defer an interrupting item).
- Minute-mark alarm (configurable sound + toast + digit pulse) — this is a NeonModoro *addition*,
  not part of the official technique, but doesn't conflict with it either.

---

## 3. Gap analysis

| # | Official technique element | In NeonModoro? | Priority | Effort (rough) |
|---|---|---|---|---|
| 1 | 25 min work / 5 min break | ✅ Yes, exact | — | — |
| 2 | Long break (15–30 min) every 4th Pomodoro | ❌ Missing | **High** | Small |
| 3 | Pomodoro counter/tally | ❌ Missing | **High** | Small |
| 4 | Task binding ("what is this Pomodoro for?") | ❌ Missing | **High** | Small–Medium |
| 5 | Records sheet / daily history | ❌ Missing | Medium | Medium |
| 6 | Effort estimation (Pomodoros per task) | ❌ Missing | Medium | Medium (depends on #4) |
| 7 | Activity Inventory (backlog beyond today) | ❌ Missing | Low | Medium–Large |
| 8 | Interruption workflow (Inform/Negotiate/Schedule/Call back) | ❌ Missing | Low | Medium |
| 9 | Strict indivisibility (void-on-interrupt vs. Pause/Resume) | ⚠️ Diverges by design | Low (see note) | Small, if done as an opt-in |
| 10 | "Overlearning" guidance on early finish | ⚠️ Not surfaced | Low | Trivial |

### What NeonModoro gets right
- The 25/5 timing itself is exact, and it's the one part of the technique every user actually
  interacts with every cycle — worth stating plainly, since everything else in this report is a
  gap list.
- The countdown math is drift-corrected (end-timestamp based, not a naive per-tick decrement),
  so a real 25:00 stays a real 25:00 even under system load — which matters for a tool whose
  entire premise is a *trustworthy*, fixed unit of time.
- The always-on-top, frameless, minimal design is arguably *more* aligned with the technique's
  underlying goal (reduce context-switching, keep the timer present without stealing attention)
  than a typical browser-tab or full-window timer app would be — this is a real strength, not
  just a cosmetic choice.

---

## 4. Detailed recommendations, in priority order

### 4.1 High priority — the core mechanic is incomplete without these

**Long break every 4th Pomodoro.** This is arguably the single biggest functional gap: right
now the app cannot express "you've earned a longer break" at all, which is a defining rhythm of
the technique, not a minor variant. Needs: a Pomodoro counter (see next item) and a branch in
the existing end-of-work-session flow — on the 4th completed work session, offer/auto-start a
15–30 min break instead of 5, then reset the counter. This slots naturally into the existing
`onSessionComplete()` / session-end popup logic in `renderer.js` and `main.js`.

**Pomodoro counter.** A simple running count of completed work sessions (reset daily, or reset
per app-launch given the app's current "nothing persists" philosophy — worth a decision either
way, see open question in §5). Needed both as the trigger for the long break above, and because
Cirillo's "Tracking" stage is *itself* just this: knowing how many Pomodoros you've done. Even a
small, unobtrusive tally (e.g. a row of dots, or a number that fades in on hover next to the
existing controls) would close this gap cheaply.

**Task binding.** Right now every Pomodoro is anonymous. Even a single optional text field
("What are you working on?") shown before/while a work session runs would connect the app to
the technique's actual unit of work — a Pomodoro spent *on something* — rather than a bare
interval timer. This doesn't need to be a full task manager to be meaningfully more aligned;
even a one-line label per session, shown on the popup or as a small caption, gets most of the
value.

### 4.2 Medium priority — rounds out the "recording" half of the method

**Records / daily history.** A lightweight log (date, task label if present, Pomodoros
completed) that the user can review — this is what turns individual sessions into the
technique's "Processing/Visualizing" stages (did today go as planned?). Doesn't need graphs or
analytics; even a simple append-only log viewable from a new "History" popup would satisfy the
spirit of it. Natural home: alongside the existing `settings.json`-style persistence already
added in `main.js` for Settings — e.g. a `history.json` written by the main process.

**Effort estimation.** Once task binding (§4.1) exists, a natural follow-up is letting the user
say "I expect this to take ~3 Pomodoros" up front, then showing estimated-vs-actual afterward.
This is genuinely useful but depends on task binding existing first, so it's sequenced after it.

### 4.3 Low priority / optional — advanced or philosophical, smaller payoff for the effort

**Activity Inventory.** A backlog of tasks beyond "today" is the most involved addition here
(closer to a small task-management feature than a timer feature) and the official technique
treats it as the top of a planning hierarchy that most lightweight implementations skip. Only
worth doing if NeonModoro is meant to grow into a fuller planning tool rather than stay a
minimal floating timer — flagging it for completeness, not urging it.

**Interruption workflow.** A "log an interruption" affordance during a running Pomodoro (quick
capture of what interrupted you, so you can defer and return to it) would mirror Cirillo's
Inform/Negotiate/Schedule/Call-back flow. Reasonable scope: a single small popup/field, not a
full task system. Lower priority because it's a personal-discipline practice more than
something an app must enforce to be "aligned."

**Pause/Resume vs. strict indivisibility.** Worth calling out explicitly: the official technique
says an interrupted Pomodoro should be *voided and restarted*, not paused and resumed. NeonModoro's
Pause button is a deliberate, common, user-friendly divergence from that — essentially every
mainstream Pomodoro app on the market makes the same tradeoff, because a hard "no pause, ever"
timer is unforgiving in practice. **Recommendation: keep Pause as the default** (removing it
would hurt usability for a purity gain most users won't want), but optionally offer a "strict
mode" toggle in Settings for users who want the app to enforce the original rule (Pause
disabled; Stop always counts as voiding the Pomodoro). Low priority, small effort, purely
additive.

**Overlearning nudge.** When Stop is pressed with a large amount of time still remaining in a
work session, a small one-line tip ("Finished early? Use the rest of the Pomodoro to review your
work.") would surface this specific piece of official guidance without forcing any behavior.
Trivial to add, genuinely optional.

---

## 5. Open questions worth deciding before implementing §4.1–4.2

- **Does the Pomodoro counter/history persist across app restarts, or reset every launch?** The
  app's countdown state intentionally resets every launch (an explicit original design
  requirement), but a *daily* Pomodoro count and a Records history are meant to survive at least
  through a single day, and arguably indefinitely (that's the entire point of a Records sheet).
  This likely needs its own persistence (a small JSON file via the main process, similar to how
  Settings now works), separate from the "timer always starts fresh" rule — recommend treating
  the *count/history* as a different kind of state than the *live countdown*, so the existing
  "nothing persists" rule doesn't need to change to fix this gap.
- **How prominent should the task field be?** A required field before Play works (closer to the
  official method) vs. an optional label (closer to the app's current zero-friction feel) is a
  real product decision, not just an implementation detail.

---

## Sources

- [Pomodoro® Technique — official site](https://www.pomodorotechnique.com/)
- [Pomodoro Technique — Wikipedia](https://en.wikipedia.org/wiki/Pomodoro_Technique)
- [The Pomodoro Technique — Todoist](https://www.todoist.com/productivity-methods/pomodoro-technique)
- [THE POMODORO® TECHNIQUE SHEETS (official worksheets)](https://digitalproducts.francescocirillo.com/l/zmttfr)
- [How to deal with interruptions in The Pomodoro Technique — FacileThings](https://facilethings.com/blog/en/interruptions-on-pomodoro)
- [Cirillo-Pomodoro-Technique.pdf (summary PDF)](https://www.northbaycounselling.com/wp-content/uploads/2022/05/Cirillo-Pomodoro-Technique.pdf)
