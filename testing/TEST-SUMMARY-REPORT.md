# SimpleLife - Test Summary Report

| | |
|---|---|
| Product | `SimpleLife.html` |
| Baseline revision | `533bf9e` |
| Tested | 10 September 2026 |
| Tester | Zacharia Janssen |
| Browser | Chrome (Chromium) on Windows 11 |

## 1. Result

| | Automated | Manual | Total |
|---|---|---|---|
| Checks executed | 84 | 40 | 124 |
| Passed on the baseline | 57 | 29 | 86 |
| Failed on the baseline | 27 | 11 | 38 |
| Passed after the fixes | 84 | 40 | 124 |
| Failed after the fixes | 0 | 0 | 0 |

38 failures traced to **17 distinct defects**. All 17 are fixed and re-verified.
A further **7 observations** are recorded as open items in `DEFECTS.md`, because
each needs a product decision or a backend rather than a code change.

Machine-readable results: `results/run-1-pre-fix.json`, `results/run-2-post-fix.json`.

## 2. Defects by severity

| Severity | Count | Defects |
|---|---|---|
| Critical | 1 | DEF-001 nothing is ever saved |
| High | 3 | DEF-002 critical alarms go silent, DEF-003 rehearsal snooze does nothing, DEF-004 tasks missed while closed ring hours late |
| Medium | 4 | DEF-005 snooze button rebuilt every second, DEF-006 accessibility, DEF-007 mark-all-read scope, DEF-008 miss timestamps |
| Low | 9 | DEF-009 to DEF-017 |

## 3. The four that matter most

**DEF-001. The app never saved anything.** All persistence went through
`window.storage`, which does not exist in a browser. Every save threw, and
`loadState` quietly fell back to defaults. A schedule of three activities and an
uploaded power of attorney, reloaded, came back as one default task with the app
locked again. Nothing else in the product could be trusted while this held, and
it also hid DEF-012, which only becomes real once data survives.

**DEF-002. Critical alarms broke their own promise.** The interface tells the
carer that a Critical alarm "keeps sounding until it's confirmed done" and
recommends it for medicine. After the 10 minute grace window the task was marked
missed like any other, which stopped the alarm. Twelve minutes away from the
tablet meant a blank screen and no medicine.

**DEF-003. Snooze was broken in the rehearsal that exists to demonstrate it.**
The rehearsal branch worked out when a test alarm was next due from the
activity's real time of day, ignoring the snooze it had just been given. A
15 minute snooze lasted 0.15 seconds.

**DEF-004. Tasks missed while the app was closed rang hours late.** The grace
window started when the app noticed rather than when the task was due. Opening
the tablet at 20:00 rang for a 12:30 lunch as though it were due, and told the
family at 20:20 if nobody answered.

## 4. Coverage

| Area | Covered | Notes |
|---|---|---|
| Legal-document gate | Full | Lock, unlock, re-lock, upload validation, screen eviction |
| Activity management | Full | Create, edit, delete, cancel, validation, all fields |
| Schedule engine | Full | Every state transition, all three importance levels, grace overrides |
| Rehearsals | Full | Isolation, timing, snooze, expiry, help, orphan cleanup |
| Loved one's alarm | Full | Takeover, all three actions, confirmation, GIF, queueing |
| Notifications | Full | Creation, wording, badge, read scoping, timestamps |
| Persistence | Full | Backend selection, round trip, real reload |
| Rendering | Full | All six family screens, empty states, ordering, icons |
| Responsive layout | Full | 320, 360, 390, 430, 768 pixels |
| Accessibility | Partial | Programmatic checks and keyboard operation. Not tested with a real screen reader |
| Audio and speech | Partial | Code paths exercised; sound not assessed by ear |
| Cross-device sync | Not covered | No backend exists (OBS-02) |

## 5. Was the test suite worth trusting?

A suite that passes tells you nothing unless it can fail. After the fixes, three
known defects were reintroduced at runtime and the suite re-run:

| Bug put back | Checks that failed | Correct? |
|---|---|---|
| "Mark all as read" rewrites every day | `NTF-03` | Yes, and only that |
| Critical alarms give up at the grace point | `ENG-16`, `ALM-01` | Yes, both the engine and experience checks |
| `maximum-scale=1` back in the viewport tag | `ACC-01` | Yes, and only that |

Each mutation was caught, by exactly the checks that should have caught it and no
others. Restoring the code returned the suite to 84 passing.

Two flaws in the harness itself were found and fixed before the baseline was
recorded, and they are worth naming because they would otherwise have been
reported as product defects:

- `ENG-13` used a fixture whose first alarm lapsed into "missed" during the hour
  the test advanced, so the assertion was checking the wrong thing.
- `ELD-01` inherited "just finished" state from a test that ran before it, under
  a clock that had been wound backwards.

Three further checks asserted the wrong contract and were corrected rather than
counted against the app: `PER-01` and `PER-03` demanded `window.storage`
specifically when the real requirement is a working backend, and `ALM-04`
originally demanded a notification at a time when no code was running to raise
one. `ENG-12` and `HSE-01`/`HSE-02` were rewritten where they encoded the old
behaviour that the fixes deliberately changed.

## 6. Changes made to the product

All in `SimpleLife.html`. Visual design is untouched; the day chips became
buttons but are styled to render identically.

| Area | Change |
|---|---|
| Storage | `storageBackend` picks a host helper, `localStorage`, or memory; `pruneHistory` keeps 60 days and caps notifications |
| Schedule engine | Grace measured from when the task was due; slots that lapsed unseen are recorded missed rather than rung; `keepsSounding` for Critical; `missedNotified` prevents duplicate alerts |
| Rehearsals | Own timeline via `delayedUntil` then `testOverride` then `triggeredAt`; orphans cleared |
| Notifications | `addNotification` takes the time the event happened; mark-as-read scoped to today; capped on insert |
| Alarm screen | Snooze wrapper only rewritten when its state changes; confirmation tick needs a non-negative elapsed time |
| Form | Grace clamped to 1 to 180; repeat days sorted |
| Rendering | Read-only `peekStatus`; `not_today` state with a dashed icon and caption |
| Accessibility | Zoom unblocked; day chips are labelled toggle buttons; dialogs, toasts and the alarm are announced; locked pills expose their state |
| Uploads | Legal documents validated for type and size |
| Load | Removed the empty `src` that threw on every page load |

## 7. Exit criteria

| Criterion | Met |
|---|---|
| Every automated check passes | Yes, 84 of 84 |
| Every planned user journey walked in a real browser | Yes, 40 of 40 |
| Every defect fixed and re-verified, or recorded with a reason | Yes, 17 fixed, 7 recorded |
| Console free of errors and warnings on load and in normal use | Yes |
| No layout breaks at any tested width | Yes, 320 to 768 pixels |

## 8. Assessment

The product's structure is sound. The state machine is well shaped, the
separation between the family and loved one's views is clean, the rehearsal path
was deliberately isolated from real data, task names are escaped, and the code
carries comments explaining why several tricky decisions were made. The failures
were not architectural.

What the defects had in common is that they sat where nobody would look during a
demonstration. Persistence only fails on reload. The Critical alarm only breaks
its promise after ten minutes of being ignored. The stale-alarm bug needs the app
to have been closed over a scheduled slot. The rehearsal snooze only misbehaves
for a task whose real time is earlier in the day. Each is invisible in a two
minute walkthrough and each matters in a week of real use, which is the gap that
regression testing exists to close.

The accessibility gaps deserve their own note. This is a product built for older
users, with a hyperlegible typeface and deliberately large buttons on the loved
one's screen, and yet pinch zoom was disabled and the repeat-day picker could not
be operated without a mouse. The intent was clearly there and the implementation
had not caught up with it.

**Recommendation:** the fixed build is fit for continued development and for
demonstration. Before it is put in front of a real family, OBS-01 needs settling,
because an app that gates itself behind a legal document while discarding that
document is making a promise it does not keep. OBS-02 is the next substantial
piece of work.

## 9. How to reproduce this run

```
python testing/automation/serve-and-collect.py 8765
```

Open `http://127.0.0.1:8765/SimpleLife.html`, then in the console:

```js
const src = await fetch('/testing/automation/engine-regression.js', {cache:'no-store'}).then(r => r.text());
const el = document.createElement('script'); el.textContent = src;
document.body.appendChild(el); el.remove();
const summary = await SL_TESTS.run();
console.table(summary.bySuite);
summary.failures;
```

`SL_TESTS.rerun()` re-fetches and runs again after editing either file, so the
suite can be iterated without reloading the page. The manual cases are listed
with their steps in `TEST-CASES.md`, Part B.
