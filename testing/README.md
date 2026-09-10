# SimpleLife - testing

Full functional, regression, user-journey and accessibility testing of
`SimpleLife.html`, carried out on 10 September 2026 against revision `533bf9e`.

**124 checks. 38 failed on the baseline, tracing to 17 defects. All 17 are fixed
and re-verified; 7 further observations are recorded as open items.**

Start with the [summary report](TEST-SUMMARY-REPORT.md).

## What is here

| File | Contents |
|---|---|
| [TEST-SUMMARY-REPORT.md](TEST-SUMMARY-REPORT.md) | Results, coverage, harness validation, assessment, sign-off |
| [TEST-PLAN.md](TEST-PLAN.md) | Scope, approach, environment, risk assessment, exit criteria |
| [TEST-CASES.md](TEST-CASES.md) | All 124 cases with before and after results |
| [DEFECTS.md](DEFECTS.md) | Each defect: what was observed, why it matters, the fix, the re-verification |
| `automation/engine-regression.js` | The 84-check regression suite |
| `automation/serve-and-collect.py` | Static server plus a results collector |
| `results/` | Machine-readable results for both runs |
| `evidence/` | Screenshots |
| `fixtures/` | Files used by the upload tests |

## Running the suite

From the repository root:

```
python testing/automation/serve-and-collect.py 8765
```

Open `http://127.0.0.1:8765/SimpleLife.html` and paste this into the console:

```js
const src = await fetch('/testing/automation/engine-regression.js', {cache:'no-store'}).then(r => r.text());
const el = document.createElement('script'); el.textContent = src;
document.body.appendChild(el); el.remove();
const summary = await SL_TESTS.run();
console.table(summary.bySuite);
summary.failures;
```

Expected: `84 passed, 0 failed`.

- `SL_TESTS.rerun()` re-fetches the suite and runs it again, so both files can be
  edited without reloading the page.
- `SL_TESTS.summarise('ENGINE')` returns one suite's results.
- `fetch('/__results/my-run.json', {method:'POST', body: JSON.stringify(summary)})`
  writes a run to `testing/results/`.

## Reproducing the baseline run

`results/run-1-pre-fix.json` is the same 84 checks run against the unmodified
app. To reproduce it, put the original file back beside the current one and point
the browser at it:

```
git show 533bf9e:SimpleLife.html > SimpleLife-baseline.html
```

Open `http://127.0.0.1:8765/SimpleLife-baseline.html`, inject the suite the same
way, and expect `57 passed, 27 failed`. Delete the file afterwards. On the
baseline, `HSE-06` and `PER-03` fail by throwing, because the functions they
exercise did not exist yet.

The suite runs inside the live page and calls the real application functions.
Nothing is mocked except the clock, which is replaced by a controllable stub so
that a 45 minute grace window can be checked in milliseconds and at exact
instants. The stub is always restored, including when a check fails.

The app is served over HTTP rather than opened from disk because that is how it
would really be deployed, and because `file://` restrictions would otherwise mask
storage behaviour.

## What changed in the product

`SimpleLife.html` is the only file changed. Highlights, with the full list in
[DEFECTS.md](DEFECTS.md):

- Nothing was ever saved. All persistence went through `window.storage`, which
  does not exist in a browser, so every reload wiped the schedule and re-locked
  the app. There is now a storage layer that uses whichever backend the page has.
- Critical alarms promised to keep sounding until confirmed, and went silent
  after ten minutes. They now keep sounding, and the family is told once at the
  grace point.
- Snoozing a "Test now" rehearsal did nothing; it rang again within a fraction of
  a second.
- A task whose time passed while the app was closed rang hours late and the
  family was never told. It is now recorded as missed and reported, with the time
  it was actually missed.
- Pinch zoom was disabled and the repeat-day picker could not be used without a
  mouse.

The visual design is unchanged.
