# SimpleLife - Test Plan

| | |
|---|---|
| Product under test | `SimpleLife.html` (single-file web app) |
| Repository | `liampentony2006-stack/BIP_Montpellier` |
| Revision tested | `533bf9e` (baseline), fixes verified on the working tree |
| Test period | 10 September 2026 |
| Tester | Zacharia Janssen |
| Test type | Full functional, end-to-end, regression, user-journey and accessibility testing |

## 1. What the product is

SimpleLife is a care-schedule app with two faces sharing one data model:

- **Family view** - a carer sets up recurring activities (name, time of day, importance,
  repeat days, a grace window, and an optional GIF), sees what is still due today,
  reviews the whole schedule, reads notifications, and manages legal documents.
- **Loved one's view** - a deliberately bare screen showing only the SimpleLife mark
  until something is due, at which point an alarm takes over the whole screen with
  the activity name, a **Finished** button, an optional **Snooze**, and a
  **I need help** link.

Two cross-cutting rules shape the app:

1. Everything except the Legal documents screen is **locked** until at least one
   legal document has been uploaded.
2. Importance drives behaviour: **Critical** (no snoozing, 10 minute grace),
   **Important** (one 10 minute snooze, 20 minute grace), **Flexible**
   (three 15 minute snoozes, 45 minute grace).

## 2. Scope

### In scope

| Area | What is covered |
|---|---|
| Legal-document gate | Locking, unlocking, re-locking, upload validation |
| Activity management | Create, edit, delete, validation, repeat days, importance, grace window |
| Schedule engine | pending, alarming, delayed, done, missed, help; grace windows; snooze allowances |
| Rehearsals ("Test now") | Isolation from the real schedule, timing, snooze, expiry |
| Loved one's alarm | Takeover, Finished, Snooze, help request, confirmation, GIF display |
| Notifications | Creation, wording, badge count, mark as read, day scoping |
| Persistence | Surviving a page reload |
| Rendering | Every screen, in every state, including empty states and ordering |
| Responsive layout | 320, 360, 390, 430 and 768 pixel widths |
| Accessibility | Keyboard operation, assistive-technology exposure, zoom, colour-only meaning |
| Robustness | Long names, markup in names, out-of-range numbers, long-run data growth |

### Out of scope

- Cross-device synchronisation. The two views are a preview inside one page and
  there is no backend, so real sync cannot be exercised.
- Audio and speech output verified by ear. The code paths are exercised and the
  chime and speech calls are observed, but sound quality is not assessed.
- Server-side security, authentication and multi-user concerns. There is no server.

## 3. Approach

Testing runs in three passes that feed each other.

### 3.1 Static review

Read the whole file and note every place where behaviour could diverge from the
promises the interface makes. This produced the candidate list that shaped the
test cases, and it is how the Critical-alarm and rehearsal-snooze defects were
first suspected.

### 3.2 Automated regression suite

`automation/engine-regression.js` runs inside the live page and calls the real
application functions. Nothing is stubbed except the clock, which is replaced by
a controllable stub so that a 45 minute grace window can be tested in
milliseconds and at exact instants rather than approximately.

Twelve suites, 84 checks:

| Suite | Subject |
|---|---|
| `ENGINE` | The scheduling state machine |
| `TESTMODE` | The "Test now" rehearsal path |
| `FORM` | Add and edit validation |
| `LOCK` | The legal-document gate |
| `PERSIST` | Saving and reloading |
| `FORMAT` | Time, date, day and file-size helpers |
| `NOTIF` | The notification list and badge |
| `RENDER` | What each screen shows |
| `ELDER` | The loved one's screen |
| `ALARM` | What the loved one actually experiences |
| `A11Y` | Accessibility basics |
| `HOUSE` | Housekeeping and long-run behaviour |

The suite is checked for validity by mutation: known bugs are reintroduced at
runtime and the suite must fail on exactly the relevant checks. See section 5 of
the summary report.

### 3.3 Manual user-journey testing

Driving the real interface in Chrome with real clicks, real typing and real file
inputs, following the journeys an actual family would take, and capturing
screenshots and console output as evidence. This is where the defects that only
show up in a live browser were found: the page-load exception, the snooze button
being rebuilt underneath the user's finger, and the fact that nothing was ever
saved.

## 4. Environment

| | |
|---|---|
| Browser | Chrome (Chromium), Windows 11 |
| Served from | `http://127.0.0.1:8765/SimpleLife.html` via `automation/serve-and-collect.py` |
| Viewports | 320x700, 360x640, 390x844, 430x932, 768x1024, and a desktop window |
| Fixtures | `fixtures/power-of-attorney.pdf`, `fixtures/advance-directive.docx`, `fixtures/lunch.gif` |

The app is served over HTTP rather than opened from the filesystem, because that
is how it would really be deployed and because `file://` restrictions would mask
storage behaviour.

## 5. Entry and exit criteria

**Entry.** The app loads and reaches its home screen.

**Exit.** All of the following hold:

1. Every automated check passes.
2. Every planned user journey has been walked in a real browser.
3. Every defect found is either fixed and re-verified, or recorded as an open
   observation with a reason it was not fixed.
4. The console is free of errors and warnings on load and during normal use.
5. No layout breaks at any tested viewport width.

## 6. Risk assessment

The risks worth spending test effort on, in order:

| Risk | Why it matters | Mitigation in this plan |
|---|---|---|
| A medication reminder is silently lost | The product's whole purpose. A missed Critical task can be a health event | `ENGINE`, `ALARM` suites; Critical behaviour checked against its own promise |
| The schedule disappears | A carer sets up a week of care and it is gone on reload | `PERSIST` suite plus a real reload journey |
| A rehearsal corrupts the real day | "Test now" writing into today's record would mark a real task done | `TESTMODE` suite, isolation checked on every path |
| The family is told late or not at all | Late notice defeats the point of notifying | `ALARM` suite, including the app-was-closed case |
| The loved one cannot operate the alarm | Older users, tremor, poor sight, assistive technology | `A11Y` suite, target sizes, focus behaviour |
| The record grows until storage fails | A schedule meant to run for years | `HOUSE` suite |

## 7. Deliverables

| File | Contents |
|---|---|
| `TEST-PLAN.md` | This document |
| `TEST-CASES.md` | Every test case with its result |
| `DEFECTS.md` | Every defect, with cause, fix and re-verification |
| `TEST-SUMMARY-REPORT.md` | Results, coverage, harness validation, sign-off |
| `automation/engine-regression.js` | The regression suite |
| `automation/serve-and-collect.py` | Static server plus results collector |
| `results/run-1-pre-fix.json` | Machine-readable baseline results |
| `results/run-2-post-fix.json` | Machine-readable results after the fixes |
| `evidence/` | Screenshots and captured console output |
| `fixtures/` | Files used by the upload tests |
