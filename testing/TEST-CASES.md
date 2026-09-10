# SimpleLife - Test Cases and Results

Two catalogues:

- **Part A** - the 84 automated checks in `automation/engine-regression.js`.
- **Part B** - the 40 manual user-journey cases walked in a real browser.

"Baseline" is the unmodified `533bf9e`. "After fix" is the working tree with the
fixes described in `DEFECTS.md`.

---

# Part A - Automated checks

## ENGINE - the scheduling state machine

| ID | Check | Baseline | After fix |
|---|---|---|---|
| ENG-01 | A task stays pending before its scheduled time | pass | pass |
| ENG-02 | A task starts alarming exactly at its scheduled time | pass | pass |
| ENG-03 | An unanswered alarm is flagged missed once its grace window passes | pass | pass |
| ENG-04 | Being flagged missed raises exactly one family notification | pass | pass |
| ENG-05 | A completed task never alarms again that day | pass | pass |
| ENG-06 | A task not scheduled for today never alarms | pass | pass |
| ENG-07 | A snooze re-alarms after the priority snooze interval, not before | pass | pass |
| ENG-08 | Critical tasks cannot be snoozed | pass | pass |
| ENG-09 | Important tasks allow exactly one snooze | pass | pass |
| ENG-10 | Flexible tasks allow exactly three snoozes | pass | pass |
| ENG-11 | Asking for help resolves the task and notifies the family | pass | pass |
| ENG-12 | A per-task grace override wins over the priority default | pass | pass |
| ENG-13 | The earliest triggered alarm is the one presented | pass | pass |
| ENG-14 | Next-up skips resolved tasks and returns the soonest remaining one | pass | pass |
| ENG-15 | A task whose time passed while the app was closed does not silently vanish | pass | pass |
| ENG-16 | A critical task tells the family at the grace point but keeps sounding | **fail** | pass |

## TESTMODE - the family "Test now" rehearsal path

| ID | Check | Baseline | After fix |
|---|---|---|---|
| TST-01 | Test now schedules a rehearsal without touching the real status | pass | pass |
| TST-02 | A rehearsal alarm rings about three seconds later | pass | pass |
| TST-03 | Finishing a rehearsal clears it and leaves the real task pending | pass | pass |
| TST-04 | Snoozing a rehearsal keeps it quiet for the snooze interval | **fail** | pass |
| TST-05 | An ignored rehearsal expires quietly without alerting the family | **fail** | pass |
| TST-06 | Asking for help during a rehearsal does not alarm the family | pass | pass |

## FORM - add and edit validation

| ID | Check | Baseline | After fix |
|---|---|---|---|
| FRM-01 | A named activity is saved with all of its settings | pass | pass |
| FRM-02 | An unnamed activity is refused and the error is shown | pass | pass |
| FRM-03 | Editing an activity updates it in place instead of duplicating it | pass | pass |
| FRM-04 | A grace window of zero or less is rejected | pass | pass |
| FRM-05 | A grace window beyond the allowed maximum is rejected | **fail** | pass |
| FRM-06 | Choosing a priority loads its recommended grace window | pass | pass |
| FRM-07 | At least one weekday always stays selected | pass | pass |
| FRM-08 | Repeat days are stored in a stable, sorted order | **fail** | pass |
| FRM-09 | A name containing markup is rendered as text, never as HTML | pass | pass |
| FRM-10 | Cancelling the form discards the entry | pass | pass |

## LOCK - the legal-document gate

| ID | Check | Baseline | After fix |
|---|---|---|---|
| LCK-01 | With no document uploaded the four protected screens stay shut | pass | pass |
| LCK-02 | The legal screen itself stays reachable while locked | pass | pass |
| LCK-03 | Uploading a document opens up the rest of the app | pass | pass |
| LCK-04 | Removing the last document locks up again and closes the open screen | pass | pass |
| LCK-05 | Locked navigation buttons are marked as unavailable to assistive tech | **fail** | pass |

## PERSIST - surviving a reload

| ID | Check | Baseline | After fix |
|---|---|---|---|
| PER-01 | The app has a working storage backend | **fail** | pass |
| PER-02 | Saving the schedule does not raise an error | **fail** | pass |
| PER-03 | A saved schedule can be read back | **fail** | pass |

## FORMAT - display helpers

| ID | Check | Baseline | After fix |
|---|---|---|---|
| FMT-01 | Midnight and noon are labelled correctly | pass | pass |
| FMT-02 | A task on all seven days reads as "Every day" | pass | pass |
| FMT-03 | File sizes are shown in sensible units | pass | pass |
| FMT-04 | Ordinal dates are spelled correctly, including the teens | pass | pass |
| FMT-05 | Every HTML-significant character is escaped | pass | pass |

## NOTIF - the family notification list

| ID | Check | Baseline | After fix |
|---|---|---|---|
| NTF-01 | The badge counts only unread items from today | pass | pass |
| NTF-02 | With nothing unread the badge is hidden | pass | pass |
| NTF-03 | "Mark all as read" clears today without rewriting history | **fail** | pass |
| NTF-04 | Help requests and misses are worded differently | pass | pass |

## RENDER - what each screen shows

| ID | Check | Baseline | After fix |
|---|---|---|---|
| RND-01 | Upcoming lists only unresolved tasks for today | pass | pass |
| RND-02 | Upcoming shows a friendly note when the day is clear | pass | pass |
| RND-03 | Existing lists every task with its days and priority | pass | pass |
| RND-04 | Existing does not show an off-day task as if it were still to come | pass | pass |
| RND-05 | The task list is ordered by time of day | pass | pass |
| RND-06 | A missed task is shown with the alert icon, not the done icon | pass | pass |
| RND-07 | The date pill shows today on every screen | pass | pass |
| RND-08 | Rendering a screen does not quietly rewrite stored history | **fail** | pass |

## ELDER - the loved one's screen

| ID | Check | Baseline | After fix |
|---|---|---|---|
| ELD-01 | The screen stays calm and empty when nothing is due | pass | pass |
| ELD-02 | A due task takes over the screen with its name | pass | pass |
| ELD-03 | A critical alarm offers no snooze button | pass | pass |
| ELD-04 | A flexible alarm offers a snooze button | pass | pass |
| ELD-05 | Finishing from the alarm marks the task done and confirms it | pass | pass |
| ELD-06 | The confirmation clears itself and returns to the calm screen | pass | pass |
| ELD-07 | The alarm never appears on the family device | pass | pass |
| ELD-08 | The alarm shows the picture chosen for the task | pass | pass |
| ELD-09 | A task with no picture leaves no broken image behind | pass | pass |

## ALARM - what the loved one actually experiences

| ID | Check | Baseline | After fix |
|---|---|---|---|
| ALM-01 | A critical alarm keeps sounding until it is confirmed, as promised | **fail** | pass |
| ALM-02 | The snooze button survives long enough to be pressed | **fail** | pass |
| ALM-03 | A task whose time passed hours ago is not rung as if it were due now | **fail** | pass |
| ALM-04 | The family is told about a miss on the day it happened, not hours later | **fail** | pass |
| ALM-05 | The confirmation tick is not shown when nothing was just finished | **fail** | pass |

## A11Y - accessibility basics

| ID | Check | Baseline | After fix |
|---|---|---|---|
| ACC-01 | The page can be pinch-zoomed | **fail** | pass |
| ACC-02 | The repeat-day picker can be operated from a keyboard | **fail** | pass |
| ACC-03 | The repeat-day picker reports its on/off state | **fail** | pass |
| ACC-04 | Each weekday chip has a distinguishable label | **fail** | pass |
| ACC-05 | Modal dialogs announce themselves as dialogs | **fail** | pass |
| ACC-06 | Toast messages are announced to screen readers | **fail** | pass |
| ACC-07 | The alarm screen is announced when it takes over | **fail** | pass |

## HOUSE - housekeeping and long-run behaviour

| ID | Check | Baseline | After fix |
|---|---|---|---|
| HSE-01 | Old day records are not kept for ever | **fail** | pass |
| HSE-02 | The notification history is capped | **fail** | pass |
| HSE-03 | Deleting a task also clears its pending rehearsal | **fail** | pass |
| HSE-04 | Cancelling a delete keeps the task | pass | pass |
| HSE-05 | A rehearsal for a deleted task cannot ring | pass | pass |
| HSE-06 | Pruning keeps recent days and only drops genuinely old ones | **fail** | pass |

**Part A totals: baseline 57 pass / 27 fail. After fix 84 pass / 0 fail.**

Recorded in `results/run-1-pre-fix.json` and `results/run-2-post-fix.json`. Both
runs execute the same 84 checks, the baseline against `533bf9e` unmodified.
On the baseline, `HSE-06` and `PER-03` fail by throwing, because the functions
they exercise (`pruneHistory`, `storageBackend`) did not exist yet.

---

# Part B - Manual user journeys

Each case was walked in Chrome against the served app.

## Journey 1 - a carer sets the app up for the first time

| ID | Steps and expectation | Baseline | After fix |
|---|---|---|---|
| MAN-01 | Open the app. Home shows five pills; four are visibly greyed and Legal documents is available | pass | pass |
| MAN-02 | Tap "Upcoming tasks" while locked. It refuses and explains why | pass | pass |
| MAN-03 | Open "Legal documents" while locked. The screen opens and offers an upload | pass | pass |
| MAN-04 | Upload `power-of-attorney.pdf` through the real file input. Everything unlocks, with a confirming message and updated hint text | pass | pass |
| MAN-05 | The document is listed with its size and upload date, and a Remove button | pass | pass |
| MAN-06 | Remove the only document. The app locks again and leaves the now-locked screen | pass | pass |
| MAN-37 | Upload a file that is not a document, and one over the size limit | **fail** (anything accepted) | pass |

## Journey 2 - the carer builds the daily schedule

| ID | Steps and expectation | Baseline | After fix |
|---|---|---|---|
| MAN-07 | Tap + on Add / remove task. The activity sheet opens | pass | pass |
| MAN-08 | Save with the name left blank. An inline error appears and nothing is saved | pass | pass |
| MAN-09 | Change Importance to Critical. The help text and the recommended grace window both update | pass | pass |
| MAN-10 | Type "Morning medicine", set 08:15, Critical, and save. Stored exactly as entered | pass | pass |
| MAN-11 | Existing tasks lists all three tasks in time order with their days and importance | pass | pass |
| MAN-12 | A task that does not repeat today is distinguishable from one still due today | **fail** (identical) | pass |
| MAN-33 | Set the repeat days using only the keyboard | **fail** (not reachable) | pass |
| MAN-36 | Save a task whose name contains HTML. It is shown as text, and no script runs | pass | pass |

## Journey 3 - the loved one is reminded

| ID | Steps and expectation | Baseline | After fix |
|---|---|---|---|
| MAN-13 | Switch to the loved one's view with nothing due. Only the SimpleLife mark is shown | pass | pass |
| MAN-14 | With a task due, the alarm takes over the screen with the task name, Finished, and the help link | pass | pass |
| MAN-15 | A Critical alarm offers no Snooze | pass | pass |
| MAN-16 | A Flexible alarm offers Snooze | pass | pass |
| MAN-17 | Press Finished. The confirmation tick appears, then the screen returns to the calm mark | pass | pass |
| MAN-18 | The alarm never appears while the family view is open | pass | pass |
| MAN-20 | A very long task name wraps inside the card instead of overflowing | pass | pass |
| MAN-21 | Two tasks due in the same minute: one is presented, the other follows after the first is finished | pass | pass |
| MAN-35 | Give Snooze keyboard focus and wait. It stays focusable and pressable | **fail** (rebuilt every second) | pass |
| MAN-38 | Leave a Critical alarm unanswered past its grace window. It keeps sounding, as the app promises | **fail** (went silent) | pass |

## Journey 4 - the family is kept informed

| ID | Steps and expectation | Baseline | After fix |
|---|---|---|---|
| MAN-19 | A task lapses past its grace window. A message appears, a notification is recorded, and the home badge shows the count | pass | pass |
| MAN-39 | Open the app in the evening for a task that was due at lunchtime. It is reported as missed rather than rung hours late | **fail** (rang at 20:00, family never told) | pass |
| MAN-40 | Use "Mark all as read" on the today screen. Only today's items are affected | **fail** (rewrote earlier days) | pass |

## Journey 5 - the carer rehearses an alarm

| ID | Steps and expectation | Baseline | After fix |
|---|---|---|---|
| MAN-22 | Press "Test now", switch to the loved one's view. It rings after about three seconds and the real task is untouched | pass | pass |
| MAN-23 | Press Snooze on the rehearsal. It stays quiet for the snooze interval | **fail** (rang again in 0.15s) | pass |

## Journey 6 - pictures on the alarm screen

| ID | Steps and expectation | Baseline | After fix |
|---|---|---|---|
| MAN-24 | Paste a Giphy share-page link. An inline error explains that a direct file link is needed | pass | pass |
| MAN-25 | Paste a direct link to a GIF file. The preview appears and the error clears | pass | pass |
| MAN-26 | Upload a file that is not a GIF. It is refused with an explanation | pass | pass |
| MAN-27 | Upload a GIF over 5MB. It is refused with an explanation | pass | pass |
| MAN-28 | Upload a valid GIF. It is embedded and previewed | pass | pass |

## Journey 7 - coming back tomorrow

| ID | Steps and expectation | Baseline | After fix |
|---|---|---|---|
| MAN-29 | Build a schedule, upload a document, reload the page. Everything is still there | **fail** (all lost, app re-locked) | pass |
| MAN-30 | Load the app and inspect the console. No errors or warnings | **fail** (two errors on every load) | pass |

## Journey 8 - on a phone, and with assistive technology

| ID | Steps and expectation | Baseline | After fix |
|---|---|---|---|
| MAN-31 | Render every screen at 320, 360, 390, 430 and 768 pixels wide. No horizontal scrolling, nothing overflowing, no target under 24 pixels | pass | pass |
| MAN-32 | Open the activity sheet on a 568 pixel tall screen. The sheet scrolls and Save can be reached | pass | pass |
| MAN-34 | Pinch to zoom the page | **fail** (blocked) | pass |

**Part B totals: baseline 29 pass / 11 fail. After fix 40 pass / 0 fail.**
