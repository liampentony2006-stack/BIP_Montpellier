/* ============================================================================
   SimpleLife - automated regression suite
   ----------------------------------------------------------------------------
   Runs INSIDE the live page (paste into the console, or inject with a browser
   automation tool) against the real application functions. Nothing is mocked
   except the clock, so every assertion exercises the shipped code.

   Usage:  inject the file, then
             await SL_TESTS.run()           -> runs every suite, returns a summary
             SL_TESTS.last                  -> the summary of the last run
             SL_TESTS.summarise('ENGINE')   -> one suite's results
             await SL_TESTS.rerun()         -> re-fetch the file and run it again

   The clock is swapped for a controllable stub so that scheduling behaviour
   can be checked at exact instants instead of waiting for real minutes to
   pass. The stub is always restored, even when a test throws.
   ============================================================================ */
(function () {
  const SRC_URL = '/testing/automation/engine-regression.js';
  const RealDate = window.Date;
  let frozenAt = null;

  function freeze(ms) {
    frozenAt = ms;
    const Stub = function (...args) {
      if (!(this instanceof Stub)) return new RealDate(frozenAt).toString();
      return args.length === 0 ? new RealDate(frozenAt) : new RealDate(...args);
    };
    Stub.prototype = RealDate.prototype;
    Stub.now = () => frozenAt;
    Stub.parse = RealDate.parse;
    Stub.UTC = RealDate.UTC;
    window.Date = Stub;
  }
  function advance(ms) { freeze(frozenAt + ms); }
  function unfreeze() { window.Date = RealDate; frozenAt = null; }

  /* today at a given local wall-clock time, as an epoch ms value */
  function todayAt(h, m) {
    const d = new RealDate();
    return new RealDate(d.getFullYear(), d.getMonth(), d.getDate(), h, m, 0, 0).getTime();
  }
  const MIN = 60000;

  /* ---------------------------------------------------------------- runner
     Tests are registered first and executed afterwards, so that a test may be
     async (the storage round trip is) and still be awaited in order. */
  const queue = [];
  const results = [];
  let currentSuite = '';

  function suite(name, fn) { currentSuite = name; fn(); }

  function test(id, title, fn) {
    queue.push({ id, suite: currentSuite, title, fn });
  }

  async function runAll() {
    results.length = 0;
    for (const item of queue) {
      const entry = { id: item.id, suite: item.suite, title: item.title, status: 'pass', detail: '' };
      try {
        await item.fn();
      } catch (err) {
        entry.status = 'fail';
        entry.detail = String(err && err.message ? err.message : err);
      } finally {
        unfreeze();
      }
      results.push(entry);
    }
    window.SL_TESTS.last = summarise();
    return window.SL_TESTS.last;
  }

  function ok(cond, msg) { if (!cond) throw new Error(msg || 'expected truthy'); }
  function eq(actual, expected, msg) {
    const a = JSON.stringify(actual), e = JSON.stringify(expected);
    if (a !== e) throw new Error((msg ? msg + ': ' : '') + 'expected ' + e + ', got ' + a);
  }
  function throws(fn, msg) {
    try { fn(); } catch (e) { return; }
    throw new Error(msg || 'expected a throw');
  }

  /* ------------------------------------------------------------- fixtures */
  function resetState(activities) {
    state.activities = activities || [];
    state.statusLog = {};
    state.notifications = [];
    state.testLog = {};
    state.legalDocuments = [{ id: 'doc1', name: 'poa.pdf', size: 1024, uploadedAt: todayAt(8, 0) }];
    // clear the "just finished" confirmation so one test's tick cannot leak into the next
    lastCompletedActivity = null;
    lastCompletedAt = 0;
    alarmActivityRef = null;
    alarmActivityIsTest = false;
    if (typeof familyScreen !== 'undefined') { try { goFamilyScreen('home'); } catch (e) {} }
  }
  function act(over) {
    return Object.assign({
      id: 'act-' + Math.random().toString(36).slice(2, 8),
      name: 'Test activity',
      time: '12:30',
      priority: 'flexible',
      days: [0, 1, 2, 3, 4, 5, 6],
      graceMinutes: 20,
      gifUrl: ''
    }, over || {});
  }
  function statusOf(a) { return state.statusLog[todayStr() + '|' + a.id]; }

  /* ======================================================================
     SUITE: ENGINE - the scheduling state machine
     ====================================================================== */
  suite('ENGINE', function () {

    test('ENG-01', 'A task stays pending before its scheduled time', function () {
      const a = act({ time: '12:30' });
      resetState([a]);
      freeze(todayAt(12, 29));
      checkSchedule();
      ok(!statusOf(a) || statusOf(a).status === 'pending', 'should not have fired yet');
    });

    test('ENG-02', 'A task starts alarming exactly at its scheduled time', function () {
      const a = act({ time: '12:30' });
      resetState([a]);
      freeze(todayAt(12, 30));
      checkSchedule();
      eq(statusOf(a).status, 'alarming');
      eq(statusOf(a).triggeredAt, todayAt(12, 30));
    });

    test('ENG-03', 'An unanswered alarm is flagged missed once its grace window passes', function () {
      const a = act({ time: '12:30', graceMinutes: 20 });
      resetState([a]);
      freeze(todayAt(12, 30)); checkSchedule();
      advance(20 * MIN); checkSchedule();
      eq(statusOf(a).status, 'alarming', 'should still be alarming at exactly the grace limit');
      advance(1 * MIN); checkSchedule();
      eq(statusOf(a).status, 'missed');
    });

    test('ENG-04', 'Being flagged missed raises exactly one family notification', function () {
      const a = act({ time: '12:30', graceMinutes: 5, name: 'Medicine' });
      resetState([a]);
      freeze(todayAt(12, 30)); checkSchedule();
      advance(10 * MIN); checkSchedule();
      checkSchedule(); checkSchedule();
      eq(state.notifications.length, 1, 'must not raise duplicates on later ticks');
      eq(state.notifications[0].type, 'missed');
      eq(state.notifications[0].activityName, 'Medicine');
      eq(state.notifications[0].seen, false);
    });

    test('ENG-05', 'A completed task never alarms again that day', function () {
      const a = act({ time: '12:30' });
      resetState([a]);
      freeze(todayAt(12, 30)); checkSchedule();
      markDone(a);
      eq(statusOf(a).status, 'done');
      advance(6 * 60 * MIN); checkSchedule();
      eq(statusOf(a).status, 'done');
      eq(state.notifications.length, 0);
    });

    test('ENG-06', 'A task not scheduled for today never alarms', function () {
      const tomorrow = (new RealDate().getDay() + 1) % 7;
      const a = act({ time: '00:01', days: [tomorrow] });
      resetState([a]);
      freeze(todayAt(23, 59)); checkSchedule();
      ok(!statusOf(a), 'no status entry should be created for an off-day task');
      eq(getActiveAlarm(), null);
    });

    test('ENG-07', 'A snooze re-alarms after the priority snooze interval, not before', function () {
      const a = act({ time: '12:30', priority: 'flexible' }); // 15 min snooze
      resetState([a]);
      freeze(todayAt(12, 30)); checkSchedule();
      delayActivity(a);
      eq(statusOf(a).status, 'delayed');
      advance(14 * MIN); checkSchedule();
      eq(statusOf(a).status, 'delayed', 'must stay quiet inside the snooze window');
      advance(2 * MIN); checkSchedule();
      eq(statusOf(a).status, 'alarming', 'must ring again after the snooze window');
    });

    test('ENG-08', 'Critical tasks cannot be snoozed', function () {
      const a = act({ priority: 'critical' });
      resetState([a]);
      freeze(todayAt(12, 30)); checkSchedule();
      eq(canDelay(a, statusOf(a)), false);
      delayActivity(a);
      eq(statusOf(a).status, 'alarming', 'a critical alarm must survive a snooze attempt');
    });

    test('ENG-09', 'Important tasks allow exactly one snooze', function () {
      const a = act({ priority: 'important', time: '12:30' });
      resetState([a]);
      freeze(todayAt(12, 30)); checkSchedule();
      eq(canDelay(a, statusOf(a)), true);
      delayActivity(a);
      advance(11 * MIN); checkSchedule();
      eq(canDelay(a, statusOf(a)), false, 'second snooze must be refused');
    });

    test('ENG-10', 'Flexible tasks allow exactly three snoozes', function () {
      const a = act({ priority: 'flexible', time: '12:30', graceMinutes: 45 });
      resetState([a]);
      freeze(todayAt(12, 30)); checkSchedule();
      for (let i = 0; i < 3; i++) {
        ok(canDelay(a, statusOf(a)), 'snooze ' + (i + 1) + ' should be allowed');
        delayActivity(a);
        advance(16 * MIN); checkSchedule();
      }
      eq(canDelay(a, statusOf(a)), false, 'fourth snooze must be refused');
    });

    test('ENG-11', 'Asking for help resolves the task and notifies the family', function () {
      const a = act({ name: 'Shower' });
      resetState([a]);
      freeze(todayAt(12, 30)); checkSchedule();
      requestHelp(a);
      eq(statusOf(a).status, 'help_resolved');
      eq(state.notifications.length, 1);
      eq(state.notifications[0].type, 'help');
      advance(3 * 60 * MIN); checkSchedule();
      eq(state.notifications.length, 1, 'a resolved task must not also be reported missed');
    });

    test('ENG-12', 'A per-task grace override wins over the priority default', function () {
      const a = act({ priority: 'important', graceMinutes: 60, time: '12:30' });
      resetState([a]);
      freeze(todayAt(12, 30)); checkSchedule();
      advance(30 * MIN); checkSchedule();
      eq(statusOf(a).status, 'alarming', 'the 60 minute override should still be running');
      eq(state.notifications.length, 0, 'the family should not be told inside the override window');
      advance(31 * MIN); checkSchedule();
      eq(statusOf(a).status, 'missed');
    });

    test('ENG-16', 'A critical task tells the family at the grace point but keeps sounding', function () {
      const a = act({ priority: 'critical', time: '12:30' });
      delete a.graceMinutes;                   // use the 10 minute priority default
      resetState([a]);
      freeze(todayAt(12, 30)); checkSchedule();
      advance(11 * MIN); checkSchedule();
      eq(state.notifications.length, 1, 'the family should have been told');
      eq(statusOf(a).status, 'alarming', 'a critical alarm must not give up on its own');
      advance(60 * MIN); checkSchedule(); checkSchedule();
      eq(state.notifications.length, 1, 'but it must only be reported once');
      eq(statusOf(a).status, 'alarming');
    });

    test('ENG-13', 'The earliest triggered alarm is the one presented', function () {
      // long grace windows so that neither alarm lapses into "missed" during the hour
      const early = act({ name: 'Early', time: '08:00', graceMinutes: 180 });
      const late = act({ name: 'Late', time: '09:00', graceMinutes: 180 });
      resetState([early, late]);
      freeze(todayAt(8, 0)); checkSchedule();
      advance(60 * MIN); checkSchedule();
      const active = getActiveAlarm();
      ok(active, 'an alarm should be active');
      eq(active.activity.name, 'Early');
    });

    test('ENG-14', 'Next-up skips resolved tasks and returns the soonest remaining one', function () {
      const done = act({ name: 'Breakfast', time: '08:00' });
      const next = act({ name: 'Lunch', time: '12:30' });
      const later = act({ name: 'Dinner', time: '18:00' });
      resetState([done, next, later]);
      freeze(todayAt(9, 0)); checkSchedule();
      markDone(done);
      const up = getNextUp();
      eq(up.activity.name, 'Lunch');
    });

    test('ENG-15', 'A task whose time passed while the app was closed does not silently vanish', function () {
      const a = act({ time: '12:30', graceMinutes: 20 });
      resetState([a]);
      // app opened at 20:00, hours after the 12:30 slot
      freeze(todayAt(20, 0)); checkSchedule();
      ok(['alarming', 'missed'].includes(statusOf(a).status), 'must be surfaced somehow');
      // and it must be reported to the family rather than ringing forever hours late
      advance(21 * MIN); checkSchedule();
      eq(statusOf(a).status, 'missed');
      eq(state.notifications.length, 1);
    });
  });

  /* ======================================================================
     SUITE: TEST-MODE - the family "Test now" rehearsal path
     ====================================================================== */
  suite('TESTMODE', function () {

    test('TST-01', 'Test now schedules a rehearsal without touching the real status', function () {
      const a = act({ time: '12:30' });
      resetState([a]);
      freeze(todayAt(10, 0));
      testNow(a);
      ok(state.testLog[a.id], 'a test entry should exist');
      ok(!statusOf(a) || statusOf(a).status === 'pending', 'the real task must be untouched');
    });

    test('TST-02', 'A rehearsal alarm rings about three seconds later', function () {
      const a = act({ time: '12:30' });
      resetState([a]);
      freeze(todayAt(10, 0));
      testNow(a);
      checkSchedule();
      eq(state.testLog[a.id].status, 'pending', 'should not ring instantly');
      advance(3500); checkSchedule();
      eq(state.testLog[a.id].status, 'alarming');
      ok(!statusOf(a) || statusOf(a).status === 'pending', 'the real task must still be untouched');
    });

    test('TST-03', 'Finishing a rehearsal clears it and leaves the real task pending', function () {
      const a = act({ time: '23:00' });
      resetState([a]);
      freeze(todayAt(10, 0));
      testNow(a); advance(3500); checkSchedule();
      currentView = 'elderly'; renderAlarmOverlay();
      handleAlarmDone();
      ok(!state.testLog[a.id], 'the rehearsal should be cleared');
      ok(!statusOf(a) || statusOf(a).status === 'pending', 'the real task must not be marked done');
      currentView = 'family';
    });

    test('TST-04', 'Snoozing a rehearsal keeps it quiet for the snooze interval', function () {
      const a = act({ time: '12:30', priority: 'flexible' }); // 15 min snooze
      resetState([a]);
      // 14:00 - the real 12:30 slot is already in the past, as it would be for
      // a family member rehearsing an evening task in the afternoon
      freeze(todayAt(14, 0));
      testNow(a); advance(3500); checkSchedule();
      eq(state.testLog[a.id].status, 'alarming');
      currentView = 'elderly'; renderAlarmOverlay();
      handleAlarmSnooze();
      currentView = 'family';
      eq(state.testLog[a.id].status, 'delayed');
      advance(2000); checkSchedule();
      eq(state.testLog[a.id].status, 'delayed', 'must not ring again two seconds after a 15 minute snooze');
    });

    test('TST-05', 'An ignored rehearsal expires quietly without alerting the family', function () {
      const a = act({ time: '23:00', graceMinutes: 5 });
      resetState([a]);
      freeze(todayAt(10, 0));
      testNow(a); advance(3500); checkSchedule();
      advance(6 * MIN); checkSchedule();
      ok(!state.testLog[a.id], 'the rehearsal should have been dropped');
      eq(state.notifications.length, 0, 'a rehearsal must never notify the family');
    });

    test('TST-06', 'Asking for help during a rehearsal does not alarm the family', function () {
      const a = act({ time: '23:00' });
      resetState([a]);
      freeze(todayAt(10, 0));
      testNow(a); advance(3500); checkSchedule();
      currentView = 'elderly'; renderAlarmOverlay();
      handleAlarmHelp();
      currentView = 'family';
      eq(state.notifications.length, 0, 'a rehearsal must never notify the family');
      ok(!state.testLog[a.id]);
    });
  });

  /* ======================================================================
     SUITE: FORM - add / edit validation
     ====================================================================== */
  suite('FORM', function () {

    function fill(values) {
      openForm(values.id);
      if ('name' in values) document.getElementById('fName').value = values.name;
      if ('time' in values) document.getElementById('fTime').value = values.time;
      if ('priority' in values) {
        document.getElementById('fPriority').value = values.priority;
        updatePriorityHelp();
      }
      if ('grace' in values) document.getElementById('fGrace').value = values.grace;
      if ('gifUrl' in values) document.getElementById('fGifUrl').value = values.gifUrl;
      submitForm();
    }

    test('FRM-01', 'A named activity is saved with all of its settings', function () {
      resetState([]);
      freeze(todayAt(10, 0));
      fill({ name: 'Evening pills', time: '19:45', priority: 'critical', grace: 15 });
      eq(state.activities.length, 1);
      const a = state.activities[0];
      eq([a.name, a.time, a.priority, a.graceMinutes], ['Evening pills', '19:45', 'critical', 15]);
    });

    test('FRM-02', 'An unnamed activity is refused and the error is shown', function () {
      resetState([]);
      freeze(todayAt(10, 0));
      fill({ name: '   ' });
      eq(state.activities.length, 0, 'nothing should be saved');
      eq(document.getElementById('fNameError').classList.contains('hidden'), false, 'the error must be visible');
      closeForm();
    });

    test('FRM-03', 'Editing an activity updates it in place instead of duplicating it', function () {
      const a = act({ name: 'Old name', time: '09:00' });
      resetState([a]);
      freeze(todayAt(10, 0));
      fill({ id: a.id, name: 'New name', time: '10:15' });
      eq(state.activities.length, 1);
      eq(state.activities[0].id, a.id);
      eq([state.activities[0].name, state.activities[0].time], ['New name', '10:15']);
    });

    test('FRM-04', 'A grace window of zero or less is rejected', function () {
      resetState([]);
      freeze(todayAt(10, 0));
      fill({ name: 'Zero grace', grace: '0' });
      ok(state.activities[0].graceMinutes >= 1, 'grace must be at least a minute, got ' + state.activities[0].graceMinutes);
    });

    test('FRM-05', 'A grace window beyond the allowed maximum is rejected', function () {
      resetState([]);
      freeze(todayAt(10, 0));
      fill({ name: 'Huge grace', grace: '9999' });
      const g = state.activities[0].graceMinutes;
      ok(g <= 180, 'the form advertises a 180 minute maximum but stored ' + g);
    });

    test('FRM-06', 'Choosing a priority loads its recommended grace window', function () {
      resetState([]);
      freeze(todayAt(10, 0));
      openForm();
      document.getElementById('fPriority').value = 'critical';
      updatePriorityHelp();
      eq(document.getElementById('fGrace').value, '10');
      ok(/keeps sounding/.test(document.getElementById('priorityHelpText').textContent));
      closeForm();
    });

    test('FRM-07', 'At least one weekday always stays selected', function () {
      resetState([]);
      freeze(todayAt(10, 0));
      openForm();
      selectedDays = [3];
      toggleDay(3);
      ok(selectedDays.length >= 1, 'the last remaining day must not be removable');
      closeForm();
    });

    test('FRM-08', 'Repeat days are stored in a stable, sorted order', function () {
      resetState([]);
      freeze(todayAt(10, 0));
      openForm();
      selectedDays = [];
      toggleDay(5); toggleDay(1); toggleDay(3);
      document.getElementById('fName').value = 'Odd order';
      submitForm();
      const days = state.activities[0].days;
      eq(days, [...days].sort((x, y) => x - y), 'days should be stored sorted');
    });

    test('FRM-09', 'A name containing markup is rendered as text, never as HTML', function () {
      resetState([]);
      freeze(todayAt(10, 0));
      fill({ name: '<img src=x onerror="window.__xss=1">Pills' });
      renderFamily();
      const html = document.getElementById('existingList').innerHTML;
      ok(!/<img src=x/.test(html), 'raw markup leaked into the DOM');
      ok(!window.__xss, 'injected script executed');
      ok(/&lt;img/.test(html), 'the name should appear escaped');
    });

    test('FRM-10', 'Cancelling the form discards the entry', function () {
      resetState([]);
      freeze(todayAt(10, 0));
      openForm();
      document.getElementById('fName').value = 'Discard me';
      closeForm();
      eq(state.activities.length, 0);
    });
  });

  /* ======================================================================
     SUITE: LOCK - the legal-document gate
     ====================================================================== */
  suite('LOCK', function () {

    test('LCK-01', 'With no document uploaded the four protected screens stay shut', function () {
      resetState([]);
      state.legalDocuments = [];
      freeze(todayAt(10, 0));
      ['upcoming', 'existing', 'addRemove', 'notifications'].forEach(s => {
        goFamilyScreen(s);
        eq(familyScreen, 'home', s + ' should have been refused');
      });
    });

    test('LCK-02', 'The legal screen itself stays reachable while locked', function () {
      resetState([]);
      state.legalDocuments = [];
      freeze(todayAt(10, 0));
      goFamilyScreen('legal');
      eq(familyScreen, 'legal');
      goFamilyHome();
    });

    test('LCK-03', 'Uploading a document opens up the rest of the app', function () {
      resetState([]);
      freeze(todayAt(10, 0));
      eq(legalUnlocked(), true);
      goFamilyScreen('addRemove');
      eq(familyScreen, 'addRemove');
      goFamilyHome();
    });

    test('LCK-04', 'Removing the last document locks up again and closes the open screen', function () {
      resetState([]);
      freeze(todayAt(10, 0));
      goFamilyScreen('addRemove');
      deleteLegalDocument('doc1');
      confirmDelete();
      eq(legalUnlocked(), false);
      eq(familyScreen, 'home', 'the user should be pushed off the now-locked screen');
    });

    test('LCK-05', 'Locked navigation buttons are marked as unavailable to assistive tech', function () {
      resetState([]);
      state.legalDocuments = [];
      freeze(todayAt(10, 0));
      renderFamily();
      const pill = document.getElementById('navPillUpcoming');
      ok(pill.disabled === true || pill.getAttribute('aria-disabled') === 'true',
        'a locked button must expose its state, not only a grey colour');
    });
  });

  /* ======================================================================
     SUITE: PERSIST - surviving a reload
     ====================================================================== */
  suite('PERSIST', function () {

    test('PER-01', 'The app has a working storage backend', function () {
      ok(typeof storageBackend === 'object' && storageBackend &&
         typeof storageBackend.set === 'function' && typeof storageBackend.get === 'function',
        'there is nowhere to save the schedule');
      ok(storageBackend.name !== 'memory',
        'storage fell back to memory only, so the schedule will not survive a reload');
    });

    test('PER-02', 'Saving the schedule does not raise an error', function () {
      resetState([act({ name: 'Persisted' })]);
      let failed = null;
      const realError = console.error;
      console.error = (...a) => { failed = a.join(' '); };
      try { saveState(); } finally { console.error = realError; }
      // saveState is async; give the microtask queue a turn
      ok(failed === null, 'saveState reported: ' + failed);
    });

    test('PER-03', 'A saved schedule can be read back', async function () {
      const previous = await storageBackend.get(STORAGE_KEY);   // put it back afterwards
      try {
        resetState([act({ name: 'Persisted task', time: '07:30' })]);
        await saveState();
        const raw = await storageBackend.get(STORAGE_KEY);
        ok(raw, 'nothing was written to storage');
        const parsed = JSON.parse(raw);
        eq(parsed.activities.map(a => a.name), ['Persisted task']);
        eq(parsed.legalDocuments.length, 1, 'the unlock document should be saved too');
      } finally {
        if (previous != null) await storageBackend.set(STORAGE_KEY, previous);
      }
    });
  });

  /* ======================================================================
     SUITE: FORMAT - the small display helpers
     ====================================================================== */
  suite('FORMAT', function () {

    test('FMT-01', 'Midnight and noon are labelled correctly', function () {
      eq(formatTime('00:00'), '12:00 AM');
      eq(formatTime('12:00'), '12:00 PM');
      eq(formatTime('23:59'), '11:59 PM');
      eq(formatTime('09:05'), '9:05 AM');
    });

    test('FMT-02', 'A task on all seven days reads as "Every day"', function () {
      eq(daysLabel([0, 1, 2, 3, 4, 5, 6]), 'Every day');
      eq(daysLabel([1, 3]), 'Mon, Wed');
    });

    test('FMT-03', 'File sizes are shown in sensible units', function () {
      eq(formatFileSize(512), '512 B');
      eq(formatFileSize(2048), '2 KB');
      eq(formatFileSize(5 * 1024 * 1024), '5.0 MB');
    });

    test('FMT-04', 'Ordinal dates are spelled correctly, including the teens', function () {
      eq(ordinalSuffix(1), 'ST'); eq(ordinalSuffix(2), 'ND'); eq(ordinalSuffix(3), 'RD');
      eq(ordinalSuffix(4), 'TH'); eq(ordinalSuffix(11), 'TH'); eq(ordinalSuffix(12), 'TH');
      eq(ordinalSuffix(13), 'TH'); eq(ordinalSuffix(21), 'ST'); eq(ordinalSuffix(22), 'ND');
    });

    test('FMT-05', 'Every HTML-significant character is escaped', function () {
      eq(escapeHtml('<a href="x">&\'</a>'),
        '&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;');
    });
  });

  /* ======================================================================
     SUITE: NOTIF - the family notification list
     ====================================================================== */
  suite('NOTIF', function () {

    test('NTF-01', 'The badge counts only unread items from today', function () {
      resetState([]);
      freeze(todayAt(15, 0));
      state.notifications = [
        { id: 'n1', activityName: 'A', type: 'missed', time: frozenAt, date: todayStr(), seen: false },
        { id: 'n2', activityName: 'B', type: 'missed', time: frozenAt, date: todayStr(), seen: true },
        { id: 'n3', activityName: 'C', type: 'missed', time: frozenAt, date: '2020-01-01', seen: false }
      ];
      updateBellBadge();
      const badge = document.getElementById('bellBadgeHome');
      eq(badge.textContent, '1');
      eq(badge.classList.contains('hidden'), false);
    });

    test('NTF-02', 'With nothing unread the badge is hidden', function () {
      resetState([]);
      freeze(todayAt(15, 0));
      state.notifications = [];
      updateBellBadge();
      eq(document.getElementById('bellBadgeHome').classList.contains('hidden'), true);
    });

    test('NTF-03', '"Mark all as read" clears today without rewriting history', function () {
      resetState([]);
      freeze(todayAt(15, 0));
      state.notifications = [
        { id: 'n1', activityName: 'Today', type: 'missed', time: frozenAt, date: todayStr(), seen: false },
        { id: 'n2', activityName: 'Yesterday', type: 'missed', time: frozenAt, date: '2020-01-01', seen: false }
      ];
      markAllNotifsSeen();
      eq(state.notifications[0].seen, true, "today's item should be read");
      eq(state.notifications[1].seen, false,
        'an older day was silently marked read from the today screen');
    });

    test('NTF-04', 'Help requests and misses are worded differently', function () {
      const a = act({ name: 'Walk' });
      resetState([a]);
      freeze(todayAt(12, 30)); checkSchedule();
      requestHelp(a);
      goFamilyScreen('notifications');
      renderFamily();
      const html = document.getElementById('notifList').textContent;
      ok(/needs help/.test(html), 'expected help wording, got: ' + html);
      goFamilyHome();
    });
  });

  /* ======================================================================
     SUITE: RENDER - what each screen shows
     ====================================================================== */
  suite('RENDER', function () {

    test('RND-01', 'Upcoming lists only unresolved tasks for today', function () {
      const done = act({ name: 'Breakfast', time: '08:00' });
      const open = act({ name: 'Lunch', time: '12:30' });
      const offDay = act({ name: 'Church', time: '10:00', days: [(new RealDate().getDay() + 3) % 7] });
      resetState([done, open, offDay]);
      freeze(todayAt(9, 0)); checkSchedule();
      markDone(done);
      renderFamily();
      const txt = document.getElementById('upcomingList').textContent;
      ok(/Lunch/.test(txt), 'the open task should be listed');
      ok(!/Breakfast/.test(txt), 'a completed task should be gone');
      ok(!/Church/.test(txt), 'an off-day task should not be listed');
    });

    test('RND-02', 'Upcoming shows a friendly note when the day is clear', function () {
      resetState([]);
      freeze(todayAt(9, 0));
      renderFamily();
      ok(/Nothing left/.test(document.getElementById('upcomingList').textContent));
    });

    test('RND-03', 'Existing lists every task with its days and priority', function () {
      const a = act({ name: 'Lunch', time: '12:30', priority: 'important', days: [1, 2] });
      resetState([a]);
      freeze(todayAt(9, 0));
      renderFamily();
      const txt = document.getElementById('existingList').textContent;
      ok(/Lunch/.test(txt) && /Important/.test(txt) && /Mon, Tue/.test(txt), 'got: ' + txt);
    });

    test('RND-04', 'Existing does not show an off-day task as if it were still to come', function () {
      const offDay = (new RealDate().getDay() + 2) % 7;
      const a = act({ name: 'Physio', time: '08:00', days: [offDay] });
      resetState([a]);
      freeze(todayAt(20, 0)); checkSchedule();
      renderFamily();
      const row = document.getElementById('existingList').innerHTML;
      ok(/Physio/.test(row));
      ok(!/task-row done/.test(row), 'an off-day task must not read as done');
    });

    test('RND-05', 'The task list is ordered by time of day', function () {
      resetState([
        act({ name: 'Dinner', time: '18:00' }),
        act({ name: 'Breakfast', time: '07:00' }),
        act({ name: 'Lunch', time: '12:30' })
      ]);
      freeze(todayAt(6, 0));
      renderFamily();
      const txt = document.getElementById('existingList').textContent;
      ok(txt.indexOf('Breakfast') < txt.indexOf('Lunch') && txt.indexOf('Lunch') < txt.indexOf('Dinner'),
        'wrong order: ' + txt.replace(/\s+/g, ' '));
    });

    test('RND-06', 'A missed task is shown with the alert icon, not the done icon', function () {
      const a = act({ name: 'Pills', time: '08:00', graceMinutes: 5 });
      resetState([a]);
      freeze(todayAt(8, 0)); checkSchedule();
      advance(10 * MIN); checkSchedule();
      renderFamily();
      const html = document.getElementById('existingList').innerHTML;
      ok(!/task-row done/.test(html), 'a missed task must not be styled as done');
    });

    test('RND-07', 'The date pill shows today on every screen', function () {
      resetState([]);
      freeze(todayAt(9, 0));
      renderFamily();
      const expected = todayPillText();
      ['upcomingDatePill', 'existingDatePill', 'addRemoveDatePill', 'notifDatePill', 'legalDatePill']
        .forEach(id => eq(document.getElementById(id).textContent, expected, id));
    });

    test('RND-08', 'Rendering a screen does not quietly rewrite stored history', function () {
      const a = act({ time: '23:30' });
      resetState([a]);
      freeze(todayAt(9, 0));
      state.statusLog = {};                    // clear anything the reset itself drew
      const before = JSON.stringify(state.statusLog);
      renderFamily();
      eq(JSON.stringify(state.statusLog), before,
        'drawing the screen created status entries as a side effect');
    });
  });

  /* ======================================================================
     SUITE: ELDER - the loved one's screen
     ====================================================================== */
  suite('ELDER', function () {

    test('ELD-01', 'The screen stays calm and empty when nothing is due', function () {
      resetState([act({ time: '23:00' })]);
      freeze(todayAt(9, 0));
      currentView = 'elderly';
      renderAlarmOverlay();
      eq(document.getElementById('alarmOverlay').classList.contains('hidden'), true);
      currentView = 'family';
    });

    test('ELD-02', 'A due task takes over the screen with its name', function () {
      const a = act({ name: 'Take your pills', time: '12:30' });
      resetState([a]);
      freeze(todayAt(12, 30)); checkSchedule();
      currentView = 'elderly';
      renderAlarmOverlay();
      eq(document.getElementById('alarmOverlay').classList.contains('hidden'), false);
      eq(document.getElementById('alarmTitle').textContent, 'Take your pills');
      currentView = 'family';
    });

    test('ELD-03', 'A critical alarm offers no snooze button', function () {
      const a = act({ name: 'Insulin', priority: 'critical', time: '12:30' });
      resetState([a]);
      freeze(todayAt(12, 30)); checkSchedule();
      currentView = 'elderly';
      renderAlarmOverlay();
      eq(document.getElementById('alarmSnoozeBtnWrap').innerHTML.trim(), '');
      currentView = 'family';
    });

    test('ELD-04', 'A flexible alarm offers a snooze button', function () {
      const a = act({ name: 'Walk', priority: 'flexible', time: '12:30' });
      resetState([a]);
      freeze(todayAt(12, 30)); checkSchedule();
      currentView = 'elderly';
      renderAlarmOverlay();
      ok(/Snooze/.test(document.getElementById('alarmSnoozeBtnWrap').innerHTML));
      currentView = 'family';
    });

    test('ELD-05', 'Finishing from the alarm marks the task done and confirms it', function () {
      const a = act({ name: 'Lunch', time: '12:30' });
      resetState([a]);
      freeze(todayAt(12, 30)); checkSchedule();
      currentView = 'elderly';
      renderAlarmOverlay();
      handleAlarmDone();
      eq(statusOf(a).status, 'done');
      renderAlarmOverlay();
      eq(document.getElementById('confirmModeContent').classList.contains('hidden'), false,
        'the reassuring tick should be shown');
      currentView = 'family';
    });

    test('ELD-06', 'The confirmation clears itself and returns to the calm screen', function () {
      const a = act({ name: 'Lunch', time: '12:30' });
      resetState([a]);
      freeze(todayAt(12, 30)); checkSchedule();
      currentView = 'elderly';
      renderAlarmOverlay();
      handleAlarmDone();
      advance(3000);
      renderAlarmOverlay();
      eq(document.getElementById('alarmOverlay').classList.contains('hidden'), true);
      currentView = 'family';
    });

    test('ELD-07', 'The alarm never appears on the family device', function () {
      const a = act({ name: 'Lunch', time: '12:30' });
      resetState([a]);
      freeze(todayAt(12, 30)); checkSchedule();
      currentView = 'family';
      renderAlarmOverlay();
      eq(document.getElementById('alarmOverlay').classList.contains('hidden'), true);
    });

    test('ELD-08', 'The alarm shows the picture chosen for the task', function () {
      const a = act({ name: 'Lunch', time: '12:30', gifUrl: 'http://127.0.0.1:8765/testing/fixtures/lunch.gif' });
      resetState([a]);
      freeze(todayAt(12, 30)); checkSchedule();
      currentView = 'elderly';
      renderAlarmOverlay();
      const img = document.getElementById('alarmGif');
      eq(img.getAttribute('src'), a.gifUrl);
      eq(img.style.display, 'block');
      currentView = 'family';
    });

    test('ELD-09', 'A task with no picture leaves no broken image behind', function () {
      const withGif = act({ name: 'With', time: '08:00', gifUrl: 'http://127.0.0.1:8765/testing/fixtures/lunch.gif' });
      const without = act({ name: 'Without', time: '09:00' });
      resetState([withGif, without]);
      freeze(todayAt(8, 0)); checkSchedule();
      currentView = 'elderly'; renderAlarmOverlay();
      handleAlarmDone();
      advance(60 * MIN); checkSchedule();
      renderAlarmOverlay();
      const img = document.getElementById('alarmGif');
      eq(document.getElementById('alarmTitle').textContent, 'Without');
      ok(!img.getAttribute('src'), 'the previous task\'s picture is still loaded');
      currentView = 'family';
    });
  });

  /* ======================================================================
     SUITE: ALARM - what the loved one actually experiences
     ====================================================================== */
  suite('ALARM', function () {

    test('ALM-01', 'A critical alarm keeps sounding until it is confirmed, as promised', function () {
      const a = act({ name: 'Insulin', priority: 'critical', time: '08:00' });
      delete a.graceMinutes;                   // use the priority default
      resetState([a]);
      freeze(todayAt(8, 0)); checkSchedule();
      currentView = 'elderly';
      advance(30 * MIN); checkSchedule();
      const still = getActiveAlarm();
      currentView = 'family';
      ok(still, 'the promise shown to the family is "' + PRIORITY_CONFIG.critical.help.split('.')[0] +
        '", but the alarm went silent after ' + PRIORITY_CONFIG.critical.grace + ' minutes');
    });

    test('ALM-02', 'The snooze button survives long enough to be pressed', function () {
      const a = act({ name: 'Walk', priority: 'flexible', time: '08:00', graceMinutes: 600 });
      resetState([a]);
      freeze(todayAt(8, 0)); checkSchedule();
      currentView = 'elderly';
      renderAlarmOverlay();
      const first = document.querySelector('#alarmSnoozeBtnWrap button');
      renderAlarmOverlay();                    // the next one-second tick
      const second = document.querySelector('#alarmSnoozeBtnWrap button');
      currentView = 'family';
      ok(first && second, 'a snooze button should be present both times');
      ok(first === second,
        'the button is torn down and rebuilt on every tick, so it loses keyboard focus once a second');
    });

    test('ALM-03', 'A task whose time passed hours ago is not rung as if it were due now', function () {
      const a = act({ name: 'Lunch', time: '12:30', graceMinutes: 20 });
      resetState([a]);
      // the tablet is switched on at 20:00, long after the 12:30 slot
      freeze(todayAt(20, 0)); checkSchedule();
      const st = statusOf(a);
      eq(st.status, 'missed',
        'lunch was rung at 20:00 with a fresh 20 minute grace window instead of being reported missed');
    });

    test('ALM-04', 'The family is told about a miss on the day it happened, not hours later', function () {
      const a = act({ name: 'Lunch', time: '12:30', graceMinutes: 20 });
      resetState([a]);
      freeze(todayAt(20, 0)); checkSchedule();
      ok(state.notifications.length === 1, 'no notification was raised when the app opened after the slot');
      const raisedAt = state.notifications[0].time;
      // the family reads a time next to each item, so it must be the time the
      // task was actually missed, not the time the tablet was switched on
      const shownAt = new RealDate(raisedAt);
      eq([shownAt.getHours(), shownAt.getMinutes()], [12, 50],
        'the list would show ' + shownAt.getHours() + ':' + shownAt.getMinutes() +
        ', which is when the app noticed rather than when lunch was missed');
    });

    test('ALM-05', 'The confirmation tick is not shown when nothing was just finished', function () {
      const a = act({ time: '23:00' });
      resetState([a]);
      currentView = 'elderly';
      // a device whose clock was corrected backwards after a task was finished
      freeze(todayAt(12, 0));
      lastCompletedActivity = a;
      lastCompletedAt = todayAt(14, 0);        // "finished" two hours in the future
      renderAlarmOverlay();
      const shown = !document.getElementById('alarmOverlay').classList.contains('hidden');
      currentView = 'family';
      lastCompletedActivity = null; lastCompletedAt = 0;
      eq(shown, false, 'a negative elapsed time counts as "just finished" and shows a stray tick');
    });
  });

  /* ======================================================================
     SUITE: A11Y - accessibility basics for an elderly-facing product
     ====================================================================== */
  suite('A11Y', function () {

    test('ACC-01', 'The page can be pinch-zoomed', function () {
      const meta = document.querySelector('meta[name="viewport"]').content;
      ok(!/maximum-scale\s*=\s*1/.test(meta) && !/user-scalable\s*=\s*no/.test(meta),
        'zoom is blocked by the viewport tag: ' + meta);
    });

    test('ACC-02', 'The repeat-day picker can be operated from a keyboard', function () {
      openForm();
      const chips = document.querySelectorAll('#dayPicker .day-chip');
      ok(chips.length === 7, 'expected seven day chips');
      const first = chips[0];
      const reachable = first.tagName === 'BUTTON' || first.tabIndex >= 0;
      closeForm();
      ok(reachable, 'the day chips are plain divs, so keyboard and screen-reader users cannot set repeats');
    });

    test('ACC-03', 'The repeat-day picker reports its on/off state', function () {
      openForm();
      const chip = document.querySelector('#dayPicker .day-chip');
      const labelled = chip.hasAttribute('aria-pressed') || chip.hasAttribute('aria-checked');
      closeForm();
      ok(labelled, 'selected days are conveyed by colour alone');
    });

    test('ACC-04', 'Each weekday chip has a distinguishable label', function () {
      openForm();
      const labels = [...document.querySelectorAll('#dayPicker .day-chip')]
        .map(c => (c.getAttribute('aria-label') || c.textContent).trim());
      closeForm();
      eq(new Set(labels).size, 7, 'the chips read as ' + labels.join(',') + ' - Sat/Sun and Tue/Thu are ambiguous');
    });

    test('ACC-05', 'Modal dialogs announce themselves as dialogs', function () {
      const form = document.getElementById('formModal');
      ok(form.getAttribute('role') === 'dialog' || form.querySelector('[role="dialog"]'),
        'the add/edit sheet is not exposed as a dialog');
    });

    test('ACC-06', 'Toast messages are announced to screen readers', function () {
      const stack = document.getElementById('toastStack');
      ok(stack.getAttribute('aria-live') || stack.getAttribute('role') === 'status',
        'toasts are the only feedback for a refused action, and they are silent to screen readers');
    });

    test('ACC-07', 'The alarm screen is announced when it takes over', function () {
      const overlay = document.getElementById('alarmOverlay');
      ok(overlay.getAttribute('role') || overlay.getAttribute('aria-live'),
        'the alarm takeover is invisible to assistive technology');
    });
  });

  /* ======================================================================
     SUITE: HOUSE - housekeeping and long-run behaviour
     ====================================================================== */
  suite('HOUSE', function () {

    test('HSE-01', 'Old day records are not kept for ever', function () {
      resetState([act({ time: '12:30' })]);
      freeze(todayAt(9, 0));
      for (let i = 1; i <= 400; i++) state.statusLog['2020-01-01|old' + i] = { status: 'done' };
      const before = Object.keys(state.statusLog).length;
      pruneHistory();
      const after = Object.keys(state.statusLog).length;
      ok(after < before, 'nothing prunes finished days, so the record grows without limit (' + after + ' entries)');
    });

    test('HSE-06', 'Pruning keeps recent days and only drops genuinely old ones', function () {
      resetState([]);
      freeze(todayAt(9, 0));
      const y = new RealDate(frozenAt); y.setDate(y.getDate() - 1);
      const yStr = y.getFullYear() + '-' + String(y.getMonth() + 1).padStart(2, '0') + '-' + String(y.getDate()).padStart(2, '0');
      state.statusLog[yStr + '|keep'] = { status: 'done' };
      state.statusLog['2019-05-01|drop'] = { status: 'done' };
      pruneHistory();
      ok(state.statusLog[yStr + '|keep'], "yesterday's record should be kept");
      ok(!state.statusLog['2019-05-01|drop'], 'a record from years ago should be dropped');
    });

    test('HSE-02', 'The notification history is capped', function () {
      resetState([]);
      freeze(todayAt(9, 0));
      const a = act({ name: 'Spam' });
      state.activities = [a];
      for (let i = 0; i < 300; i++) addNotification(a, 'missed');
      ok(state.notifications.length <= 200, 'kept ' + state.notifications.length + ' notifications');
      pruneHistory();
      ok(state.notifications.length <= 200, 'still ' + state.notifications.length + ' after pruning');
    });

    test('HSE-03', 'Deleting a task also clears its pending rehearsal', function () {
      const a = act({ time: '12:30' });
      resetState([a]);
      freeze(todayAt(10, 0));
      testNow(a);
      deleteActivity(a.id);
      confirmDelete();
      ok(!state.testLog[a.id], 'a rehearsal was left behind for a task that no longer exists');
    });

    test('HSE-04', 'Cancelling a delete keeps the task', function () {
      const a = act({ name: 'Keep me' });
      resetState([a]);
      freeze(todayAt(10, 0));
      deleteActivity(a.id);
      closeDeleteModal();
      confirmDelete();
      eq(state.activities.length, 1, 'the task should still be there');
    });

    test('HSE-05', 'A rehearsal for a deleted task cannot ring', function () {
      const a = act({ time: '12:30' });
      resetState([a]);
      freeze(todayAt(10, 0));
      testNow(a);
      state.activities = [];
      advance(4000);
      checkSchedule();
      eq(getActiveAlarm(), null);
    });
  });

  /* ---------------------------------------------------------------- output */
  /* Injecting this file runs the whole suite once. To run it again, fetch and
     inject it again - that is what rerun() does. */
  function rerun() {
    return fetch(SRC_URL, { cache: 'no-store' })
      .then(r => r.text())
      .then(src => {
        const el = document.createElement('script');
        el.textContent = src;
        document.body.appendChild(el);
        el.remove();
        return window.SL_TESTS.run();
      });
  }

  function summarise(only) {
    const rows = only ? results.filter(r => r.suite === only) : results;
    const failed = rows.filter(r => r.status === 'fail');
    const summary = {
      total: rows.length,
      passed: rows.length - failed.length,
      failed: failed.length,
      bySuite: {},
      failures: failed.map(f => ({ id: f.id, suite: f.suite, title: f.title, detail: f.detail })),
      all: rows
    };
    rows.forEach(r => {
      const s = summary.bySuite[r.suite] || (summary.bySuite[r.suite] = { pass: 0, fail: 0 });
      s[r.status]++;
    });
    return summary;
  }

  window.SL_TESTS = { results, summarise, rerun, run: runAll, registered: queue.length, last: null };
  return window.SL_TESTS;
})();
