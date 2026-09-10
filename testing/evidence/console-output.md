# Console evidence

Captured from Chrome's console with the app served at
`http://127.0.0.1:8765/SimpleLife.html`.

## Baseline (`533bf9e`) - on every page load

```
[EXCEPTION] (SimpleLife.html:527:205)
ReferenceError: handleGifPreviewError is not defined
    at HTMLImageElement.onerror (SimpleLife.html:528:206)

[ERROR] (SimpleLife.html:664:20)
Could not save TypeError: Cannot read properties of undefined (reading 'set')
    at saveState (SimpleLife.html:664:29)
    at loadState (SimpleLife.html:656:11)
    at SimpleLife.html:1421:1
```

The first is DEF-010: the GIF preview image carried `src=""`, so the browser
fired `onerror` during parsing, before the script block had defined the handler.

The second is DEF-001: `saveState` went through `window.storage`, which does not
exist in a browser. Nothing was ever saved.

## Baseline - during use

The same save failure repeated once per second from the tick loop, and again
from every action that saves. A five minute session produced over a hundred
identical errors:

```
[ERROR] Could not save TypeError: Cannot read properties of undefined (reading 'set')
    at saveState (SimpleLife.html:664:29)
    at tick (SimpleLife.html:958:5)

[ERROR] Could not save TypeError: Cannot read properties of undefined (reading 'set')
    at saveState (SimpleLife.html:664:29)
    at markDone (SimpleLife.html:779:3)

[ERROR] Could not save TypeError: Cannot read properties of undefined (reading 'set')
    at saveState (SimpleLife.html:664:29)
    at delayActivity (SimpleLife.html:793:3)

[ERROR] Could not save TypeError: Cannot read properties of undefined (reading 'set')
    at saveState (SimpleLife.html:664:29)
    at testNow (SimpleLife.html:804:3)
```

## After the fixes - on load, and through a full session

```
(no console messages)
```

Verified on a fresh load, through all 40 manual journeys, and across a full
84-check suite run:

```
read_console_messages(onlyErrors: true) -> No console errors or exceptions found
```

## Storage backend selection

```js
> storageBackend.name
"localStorage"
```

The app now reports which backend it chose. `host` when a page host provides
`window.storage`, `localStorage` in a normal browser, `memory` when storage is
blocked (a private window), in which case the app still works for the session
rather than throwing on every save.

## Persistence, verified across a real reload

```js
// before reload
> ({activities: state.activities.map(a=>a.name+' @'+a.time), docs: state.legalDocuments.length})
{activities: ["Evening pills @20:00"], docs: 1}

// after location.reload()
> ({activities: state.activities.map(a=>a.name+' @'+a.time),
    docs: state.legalDocuments.map(d=>d.name), unlocked: legalUnlocked()})
{activities: ["Evening pills @20:00"], docs: ["power-of-attorney.pdf"], unlocked: true}
```

On the baseline the same sequence returned the built-in default task, no
documents, and `unlocked: false`.

## DEF-005, measured

The Snooze button was being destroyed and rebuilt on every tick. Measured with a
`MutationObserver` on its wrapper while an alarm was up:

```js
// baseline
{rebuildsInAbout3Seconds: 3, sameButtonNode: false,
 focusedAtStart: true, stillFocusedAfter3s: false, activeElementNow: "BODY."}

// after the fix
{sameButtonNode: true, stillFocusedAfter3s: true}
```

## DEF-002, measured

A Critical "Morning medicine" at 08:15 with the default 10 minute grace window,
under a controlled clock:

```js
// baseline
{promise: "The alarm keeps sounding until it's confirmed done. No snoozing ...",
 statusAtTrigger: "alarming", statusAfter11Min: "missed",
 stillAlarmingAfter11Min: false}

// after the fix
{atTrigger: "alarming",
 after11Minutes:  {status: "alarming", familyTold: 1},
 after75Minutes:  {status: "alarming", familyTold: 1, notifTime: "08:25"},
 stillRingingAfter75Minutes: true}
```

## DEF-003, measured

Snoozing a "Test now" rehearsal for a task whose real slot is earlier in the day:

```js
// baseline
{snoozeShouldLast: "15 min", minutesItActuallyStayedQuiet: 0.0026,
 ringingAgain: true, overlayShowing: true}

// after the fix
{fourSecondsAfterSnooze: {status: "delayed", minutesRemaining: "14.9"},
 overlayHidden: true}
```
