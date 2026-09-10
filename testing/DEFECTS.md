# SimpleLife - Defect Report

17 defects found. All 17 are fixed in `SimpleLife.html` and re-verified.
7 further observations are recorded at the end as open items, because each needs
a product decision or a backend rather than a code fix.

Severity is judged against what the product is for: a schedule that reminds an
older person to take medicine and tells their family when something is missed.

| ID | Severity | Summary | Status |
|---|---|---|---|
| [DEF-001](#def-001) | Critical | Nothing is ever saved; the whole schedule is lost on reload | Fixed |
| [DEF-002](#def-002) | High | Critical alarms go silent after 10 minutes despite promising not to | Fixed |
| [DEF-003](#def-003) | High | Snoozing a rehearsal does nothing; it rings again within a second | Fixed |
| [DEF-004](#def-004) | High | A task missed while the app was closed rings hours late and the family is never told | Fixed |
| [DEF-005](#def-005) | Medium | The Snooze button is rebuilt every second, losing focus and dropping slow taps | Fixed |
| [DEF-006](#def-006) | Medium | Accessibility: zoom blocked, day picker unusable by keyboard, states not exposed | Fixed |
| [DEF-007](#def-007) | Medium | "Mark all as read" silently marks earlier days read | Fixed |
| [DEF-008](#def-008) | Medium | A miss is timestamped when the app noticed, not when it happened | Fixed |
| [DEF-009](#def-009) | Low | Tasks that do not repeat today look identical to tasks still due | Fixed |
| [DEF-010](#def-010) | Low | A ReferenceError is thrown on every page load | Fixed |
| [DEF-011](#def-011) | Low | The grace window accepts values far outside its advertised range | Fixed |
| [DEF-012](#def-012) | Low | Day records and notifications grow without limit | Fixed |
| [DEF-013](#def-013) | Low | The legal upload accepts any file, of any size | Fixed |
| [DEF-014](#def-014) | Low | Deleting a task leaves its queued rehearsal behind | Fixed |
| [DEF-015](#def-015) | Low | Repeat days are stored in click order | Fixed |
| [DEF-016](#def-016) | Low | Drawing a screen writes to the saved schedule | Fixed |
| [DEF-017](#def-017) | Low | The confirmation tick can appear when nothing was finished | Fixed |

---

## DEF-001

**Nothing is ever saved; the whole schedule is lost on reload.** Critical.

Found by: MAN-29, MAN-30, PER-01, PER-02, PER-03.

`loadState` and `saveState` were the only persistence in the app and both went
through `window.storage`, which does not exist in a browser. Every call threw,
`loadState` fell into its catch, and the app silently started again from its
single built-in "Lunch" task.

Observed: a schedule of three activities and an uploaded power of attorney,
reloaded, came back as one default task with no documents and the whole app
locked again. `Could not save TypeError: Cannot read properties of undefined
(reading 'set')` was logged once a second, for ever.

Why it matters: a carer sets up a week of care and it is gone the moment the tab
reloads. The app also re-locks itself, so they have to find the legal document
again. Nothing else in the product can be relied on while this is true.

Fix: a `storageBackend` that picks whichever backend the page actually has. It
uses `window.storage` when a host provides it, the browser's own `localStorage`
otherwise, and an in-memory store as a last resort when storage is blocked (a
private window), so the app still works for the session instead of throwing.

Re-verified: schedule and unlock state survive a reload; `PERSIST` does a real
write-and-read-back round trip; console clean.

---

## DEF-002

**Critical alarms go silent after 10 minutes despite promising not to.** High.

Found by: MAN-38, ALM-01, ENG-16.

The Critical importance level tells the carer, in the app's own words: "The alarm
keeps sounding until it's confirmed done. No snoozing." The no-snoozing half was
implemented. The keeps-sounding half was not: after the 10 minute grace window
the task was marked `missed` like any other, which removes it from the alarm
query, so the alarm stopped.

Observed: a Critical "Morning medicine" at 08:15 was `alarming` at 08:15 and
`missed` at 08:26, with no active alarm from that moment on.

Why it matters: this is the setting the interface explicitly recommends for
medicine. Someone who is in the bathroom for twelve minutes comes back to a blank
screen and no medicine, and the promise that made the carer choose Critical is
the one thing that did not hold.

Fix: a `keepsSounding` flag on the Critical priority. At the grace point the
family is notified exactly once (via a new `missedNotified` marker so later ticks
cannot duplicate it), and the alarm stays up until it is confirmed or help is
requested. Every other importance level is unchanged. The Critical help text now
also states the notification behaviour.

Re-verified: 75 minutes past its slot, a Critical alarm is still ringing, the
family has been told once, and the notification is stamped 08:25.

Note for the product owner: this implements the promise the interface already
makes. The alternative would have been to soften the wording instead. That is a
product call, and it is worth confirming.

---

## DEF-003

**Snoozing a rehearsal does nothing; it rings again within a second.** High.

Found by: MAN-23, TST-04, TST-05.

Rehearsals from "Test now" are kept in their own `testLog` so a test can never
mark a real task done. But the rehearsal branch of `checkSchedule` worked out
when a rehearsal was next due like this:

```js
const sched = status.testOverride != null
  ? new Date(status.testOverride)
  : getScheduledDateTime(activity, dateStr);
```

`testOverride` is deleted the moment the rehearsal starts ringing, so from then
on the rehearsal fell back to the activity's real time of day, and `delayedUntil`
was never consulted at all. For any task whose real slot is earlier in the day,
the snoozed rehearsal was immediately past due again.

Observed: `delayedUntil` was correctly set 15 minutes ahead, and the alarm came
back after 0.15 seconds. The same wrong fallback also meant an ignored rehearsal
for a later slot never reached its expiry check, so it stayed on the loved one's
screen indefinitely.

Why it matters: "Test now" is how a family member shows the loved one what will
happen and checks the setup before relying on it. Snooze visibly does not work
during exactly that demonstration.

Fix: a rehearsal now has its own timeline and never falls back to the task's real
time. It is due at `delayedUntil` if it has been snoozed, else `testOverride` if
it has not started yet, else `triggeredAt`.

Re-verified: a snoozed rehearsal shows 14.9 minutes remaining four seconds later
and the screen has returned to the calm mark; an ignored rehearsal expires and
raises no notification.

---

## DEF-004

**A task missed while the app was closed rings hours late and the family is
never told.** High.

Found by: MAN-39, ALM-03, ALM-04.

On first seeing a past-due task, `checkSchedule` set `status.triggeredAt = now`,
starting the grace window from the moment the app happened to notice rather than
from when the task was due.

Observed: the tablet was opened at 14:06 with "Lunch" scheduled for 12:30. The
task went to `alarming` at 14:06 with a fresh 20 minute window. Reproduced
deterministically at 20:00: lunch rang as though it were due, and if nobody
answered, the family was told at 20:20 that lunch had been missed.

Why it matters: two separate harms. The loved one is prompted to do something at
the wrong time of day, which for a pill is exactly the mistake the app exists to
prevent. And the family's notification arrives up to eight hours late, or not at
all if the device stays off.

Fix: the grace window is now measured from when the task was actually due. If the
whole window had already elapsed before the app saw it, the task is recorded as
missed and the family is notified, without ringing. If the app catches it inside
the window, it rings as normal.

Re-verified: opening at 20:00 for a 12:30 task yields `missed` immediately with
one notification, and the notification reads 12:50.

---

## DEF-005

**The Snooze button is rebuilt every second, losing focus and dropping slow
taps.** Medium.

Found by: MAN-35, ALM-02.

`renderAlarmOverlay` runs on every one-second tick while an alarm is up, and it
unconditionally reassigned `alarmSnoozeBtnWrap.innerHTML`, destroying the button
and creating a new one each time.

Observed with a mutation observer: three rebuilds in three seconds, the button
node different each time, and keyboard focus moved from the button back to
`body` within one second. During manual testing a click aimed at Snooze was
silently swallowed, which is what first drew attention to it.

Why it matters: nobody can hold keyboard or switch-access focus on Snooze for
long enough to press it, and a slow or hesitant tap, which is the norm for the
users this screen is designed for, can land in the gap while the node is being
replaced.

Fix: the wrapper's contents are only rewritten when whether a snooze is offered
actually changes, tracked on a data attribute.

Re-verified: the same button node persists across ticks and keeps focus.

---

## DEF-006

**Accessibility: zoom blocked, day picker unusable by keyboard, states not
exposed.** Medium.

Found by: ACC-01 to ACC-07, LCK-05, MAN-33, MAN-34.

Seven distinct problems, grouped because they share one cause, which is that
interactive meaning was carried by CSS alone:

1. `maximum-scale=1` in the viewport tag disabled pinch zoom. In an app whose
   loved one's view uses the Atkinson Hyperlegible typeface specifically for
   poor eyesight, blocking zoom works against the product's own intent.
2. The repeat-day picker was seven `div` elements with `onclick`, so it could not
   be reached by keyboard or switch access at all. The repeat schedule was
   therefore impossible to set without a mouse or touch.
3. Selected days were conveyed only by green fill, with nothing in the accessible
   tree.
4. The chips read "S M T W T F S", so a screen reader announces "S" for both
   Saturday and Sunday and "T" for both Tuesday and Thursday.
5. Neither the activity sheet nor the delete confirmation was exposed as a
   dialog.
6. Toasts were not announced, and a toast is the only feedback for a refused
   action such as tapping a locked pill.
7. The alarm takeover, the single most important event in the product, was not
   announced at all.
8. Locked navigation buttons were only greyed, with no state in the accessible
   tree.

Fix: removed `maximum-scale`; the day chips are real buttons carrying
`aria-pressed` and a full-day-name `aria-label` while still showing one letter;
both modals carry `role="dialog"`, `aria-modal` and a label; the toast stack is a
polite live region; the alarm overlay is an `alertdialog` labelled by the task
name; locked pills carry `aria-disabled` and an explanatory label. `aria-disabled`
rather than `disabled`, so tapping a locked pill can still explain why it is
locked. The name error is now tied to its input and announced.

Re-verified: the day picker is focusable and operable by keyboard (Tab to
Tuesday, Enter, and `aria-pressed` flips to `false`); the visual design is
unchanged; all seven checks pass.

---

## DEF-007

**"Mark all as read" silently marks earlier days read.** Medium.

Found by: NTF-03.

The button sits on the notifications screen, which lists today only, but
`markAllNotifsSeen` set `seen = true` on every notification ever recorded.

Why it matters: unread items from earlier days are quietly consumed by a button
whose scope appears to be the day on screen, so a carer can lose sight of a miss
from yesterday that they never saw.

Fix: only today's notifications are marked.

---

## DEF-008

**A miss is timestamped when the app noticed, not when it happened.** Medium.

Found by: ALM-04.

`addNotification` always used `Date.now()`. Combined with DEF-004, a lunch missed
at 12:50 and noticed at 20:00 appeared in the family's list as "8:00 PM Lunch not
done", because the list renders that timestamp next to each item.

Fix: `addNotification` takes the time the event actually occurred, and the
schedule engine passes the moment the grace window lapsed.

Re-verified: the notification for a 12:30 task with a 20 minute window reads
12:50 regardless of when the app was opened.

---

## DEF-009

**Tasks that do not repeat today look identical to tasks still due.** Low.

Found by: MAN-12.

On Existing tasks and Add / remove task, `displayStatus` returned a plain
`pending` status for any task not scheduled today, giving it the same hollow tick
as a task that is genuinely still to be done.

Observed on a Thursday: "3:00 PM Afternoon walk", which repeats Mon/Wed/Fri, was
indistinguishable from "7:30 PM Call your daughter", which was due that day.

Fix: a distinct `not_today` state, drawn with a dashed grey outline and captioned
"not today". See `evidence/01-existing-tasks-off-day-marked.jpg`.

---

## DEF-010

**A ReferenceError is thrown on every page load.** Low.

Found by: MAN-30.

The GIF preview image was declared `<img id="gifPreview" src="" ...
onerror="handleGifPreviewError()">`. An empty `src` makes the browser attempt a
load and fire `onerror` during parsing, before the script block has defined the
handler, so every single page load logged
`ReferenceError: handleGifPreviewError is not defined`.

Harmless in itself, but it masks real errors during development and looks like a
broken product to anyone who opens the console.

Fix: dropped the empty `src` attribute. The element is hidden until a URL is
entered, and `updateGifPreview` sets the attribute when there is something to
load.

---

## DEF-011

**The grace window accepts values far outside its advertised range.** Low.

Found by: FRM-05.

The input declares `min="1" max="180"`, but `submitForm` only applied
`Math.max(1, ...)`. Typing 9999 stored 9999, and browser input attributes are not
enforced on a programmatic read.

Fix: clamped to the 1 to 180 range the form advertises.

---

## DEF-012

**Day records and notifications grow without limit.** Low.

Found by: HSE-01, HSE-02.

`statusLog` gains an entry per task per day and nothing ever removed one;
`notifications` grew unbounded. Latent while nothing was saved, but a real
problem for a schedule meant to run for years once DEF-001 was fixed.

Fix: `pruneHistory` keeps 60 days of records and caps the notification list at
200, running on load and once per day from the tick loop; `addNotification` also
caps at the point of insertion. HSE-06 confirms recent days survive pruning.

---

## DEF-013

**The legal upload accepts any file, of any size.** Low.

Found by: MAN-37.

The GIF upload checks both type and size and explains itself when it refuses. The
legal-document upload checked nothing; the `accept` attribute is only a filter in
the file picker and is trivially bypassed. Any file of any size unlocked the app.

Fix: the same treatment as the GIF path, accepting PDF, Word and image files up
to 20MB, with a message when refused.

---

## DEF-014

**Deleting a task leaves its queued rehearsal behind.** Low.

Found by: HSE-03.

`confirmDelete` removed the activity but not its `testLog` entry, leaving an
orphan that referred to a task that no longer existed.

Fix: deleting a task also drops its rehearsal, and the rehearsal loop clears
entries whose activity has gone.

---

## DEF-015

**Repeat days are stored in click order.** Low.

Found by: FRM-08.

`toggleDay` pushes, so selecting Friday then Monday then Wednesday stored
`[5,1,3]`. Harmless in behaviour, since lookups use `includes` and the label
sorts a copy, but it makes stored data awkward to compare or diff.

Fix: sorted on save.

---

## DEF-016

**Drawing a screen writes to the saved schedule.** Low.

Found by: RND-08.

`getStatus` creates a `pending` entry when one is missing, and it was being
called from render paths, so simply looking at a screen mutated `state.statusLog`
without saving it. Rendering should not have side effects.

Fix: a read-only `peekStatus` for render and query paths; `getStatus` is reserved
for the places that are about to change a status.

---

## DEF-017

**The confirmation tick can appear when nothing was finished.** Low.

Found by: ALM-05.

The check was `(Date.now() - lastCompletedAt) < CONFIRM_DISPLAY_MS` with no lower
bound, so any negative elapsed value counted as "just finished". Reachable if the
device clock is corrected backwards after a task is completed.

Fix: the elapsed time must also be at least zero.

---

# Open observations

Not defects with an obvious fix. Each needs a product decision, and none was
changed.

**OBS-01. An uploaded legal document is not actually stored.** Only its name,
size and date are kept. The file itself is discarded, so there is no way to open
or download the power of attorney later, and after a reload the list shows a
document that does not exist anywhere. For a feature called "Legal documents",
which gates the entire app, this needs either real storage or wording that makes
clear it is only a record that a document exists.

**OBS-02. There is no synchronisation.** The two views are a preview inside one
page, as the note under the switcher says. The product described by that note,
where each person has the app on their own device kept in sync, needs a backend
that does not exist yet.

**OBS-03. A second simultaneous task is queued invisibly.** When two tasks are
due in the same minute, the loved one sees one alarm and has no way to know
another follows. Worth a small indication such as "1 more after this".

**OBS-04. The confirmation screen has no words.** After Finished, the screen
shows only a green tick. The spoken message says "All done. Well done!", so a
loved one who is hard of hearing gets no wording at all.

**OBS-05. GIFs are embedded as data URLs.** Uploaded GIFs are stored inline in
the schedule, up to 5MB each before base64 expansion. A handful will approach the
5MB `localStorage` quota now that saving works. Worth moving to a blob store, or
lowering the per-file limit.

**OBS-06. The home pill reads "Notification".** Singular, where every other
label and the screen itself are plural.

**OBS-07. The Back link is small and low contrast.** 14 pixel grey text with no
icon, on an app whose other controls are deliberately large.
