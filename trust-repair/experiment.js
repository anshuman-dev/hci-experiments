
// ── Audio pool (pre-generated ElevenLabs clips) ───────────────────────────────
// synthetic = Daniel (flat, steady broadcaster)
// natural   = Eric   (warm, trustworthy)
// practice  = River  (neutral — practice trial only)

const CLIPS = ['intro', 'task', 'error', 'repair_apology', 'repair_explanation'];
const audioPool = {};

function preloadAudio() {
  ['synthetic', 'natural'].forEach(voice => {
    audioPool[voice] = {};
    CLIPS.forEach(clip => {
      const a = new Audio(`audio/${voice}_${clip}.mp3`);
      a.preload = 'auto';
      audioPool[voice][clip] = a;
    });
  });
  audioPool['practice'] = {};
  ['practice_intro', 'practice_task'].forEach(clip => {
    const a = new Audio(`audio/practice_${clip}.mp3`);
    a.preload = 'auto';
    audioPool['practice'][clip] = a;
  });
}

function speak(voiceType, clip) {
  return new Promise((resolve, reject) => {
    const a = audioPool[voiceType]?.[clip];
    if (!a) { reject(new Error(`Missing audio pool entry: ${voiceType}/${clip}`)); return; }
    a.currentTime = 0;
    a.onended  = resolve;
    a.onerror  = () => reject(new Error(`Audio load failed: ${voiceType}_${clip}.mp3`));
    a.play().catch(reject);
  });
}

// ── Progress bar ──────────────────────────────────────────────────────────────
function setProgress(pct) {
  const bar   = document.getElementById('progress-bar');
  const label = document.getElementById('progress-pct');
  bar.style.width = `${pct}%`;
  label.textContent = `${Math.round(pct)}%`;
  // colour: blue=ok, amber=recovering, red=error
  if (pct < 40) {
    bar.style.background = '#cc3333';
  } else if (pct < 60) {
    bar.style.background = '#f0a000';
  } else {
    bar.style.background = '#3a6bff';
  }
}

// ── Map state ─────────────────────────────────────────────────────────────────
function setMapState(state) {
  const dot         = document.getElementById('robot-dot');
  const dotLabel    = document.getElementById('robot-map-label');
  const pathWrong   = document.getElementById('path-wrong');
  const wrongLabel  = document.getElementById('wrong-label');
  const errorBadge  = document.getElementById('error-badge');
  const pathCorrect = document.getElementById('path-correct');

  dot.setAttribute('cy', '70');
  dotLabel.setAttribute('y', '74');

  switch (state) {
    case 'idle':
      dot.setAttribute('cx', '28');  dotLabel.setAttribute('x', '28');
      dot.setAttribute('fill', '#3a6bff');
      pathCorrect.setAttribute('opacity', '0.35');
      pathWrong.setAttribute('opacity', '0');
      wrongLabel.setAttribute('opacity', '0');
      errorBadge.setAttribute('opacity', '0');
      break;

    case 'navigating':
      dot.setAttribute('cx', '160'); dotLabel.setAttribute('x', '160');
      dot.setAttribute('fill', '#3a6bff');
      pathCorrect.setAttribute('opacity', '1');
      pathWrong.setAttribute('opacity', '0');
      wrongLabel.setAttribute('opacity', '0');
      errorBadge.setAttribute('opacity', '0');
      break;

    case 'error':
      dot.setAttribute('cx', '218'); dot.setAttribute('cy', '120');
      dotLabel.setAttribute('x', '218'); dotLabel.setAttribute('y', '124');
      dot.setAttribute('fill', '#cc3333');
      pathCorrect.setAttribute('opacity', '0.2');
      pathWrong.setAttribute('opacity', '1');
      wrongLabel.setAttribute('opacity', '1');
      errorBadge.setAttribute('opacity', '1');
      break;

    case 'repair':
      dot.setAttribute('cx', '218'); dot.setAttribute('cy', '120');
      dotLabel.setAttribute('x', '218'); dotLabel.setAttribute('y', '124');
      dot.setAttribute('fill', '#f0a000');
      pathWrong.setAttribute('opacity', '0.6');
      wrongLabel.setAttribute('opacity', '0.6');
      errorBadge.setAttribute('opacity', '0.4');
      break;

    case 'done':
      dot.setAttribute('fill', '#22aa66');
      break;
  }
}

// ── Robot display ─────────────────────────────────────────────────────────────
function setRobotState(state) {
  const robot  = document.getElementById('robot-display');
  robot.className = `robot-display robot-${state}`;
  const labels = { idle: 'Standby', speaking: 'Transmitting', error: 'Navigation Error', repair: 'Responding', done: 'Complete' };
  document.getElementById('robot-status').textContent = labels[state] || '';
  const waveActive = state === 'speaking' || state === 'repair';
  document.getElementById('waveform').classList.toggle('active', waveActive);
}

function setPracticeRobotState(state) {
  const robot = document.getElementById('practice-robot-display');
  robot.className = `robot-display robot-${state}`;
  const labels = { idle: 'Standby', speaking: 'Transmitting', done: 'Complete' };
  document.getElementById('practice-robot-status').textContent = labels[state] || '';
  document.getElementById('practice-waveform').classList.toggle('active', state === 'speaking');
}

function setPhaseLabel(text) {
  document.getElementById('phase-label').textContent = text;
}

// ── Rating helpers ────────────────────────────────────────────────────────────
function getRatings(prefix) {
  return {
    trust:       +document.getElementById(`${prefix}-trust`).value,
    reliability: +document.getElementById(`${prefix}-reliability`).value,
    comfort:     +document.getElementById(`${prefix}-comfort`).value,
  };
}

function resetPanel(prefix) {
  ['trust', 'reliability', 'comfort'].forEach(id => {
    const el = document.getElementById(`${prefix}-${id}`);
    if (el) { el.value = 4; updateLabel(el); }
  });
  // reset naturalness if on rep panel
  const nat = document.getElementById('rep-naturalness');
  if (nat && prefix === 'rep') { nat.value = 4; updateLabel(nat); }
}

function updateLabel(input) {
  const label = input.closest('.rating-item')?.querySelector('.range-val');
  if (label) label.textContent = input.value;
}

document.querySelectorAll('#rating-wrap input[type=range]').forEach(r => {
  r.addEventListener('input', () => updateLabel(r));
});
document.querySelectorAll('.debrief-form input[type=range]').forEach(r => {
  r.addEventListener('input', () => updateLabel(r));
});

function showRatingPanel(panelId, question, btnId) {
  return new Promise(resolve => {
    document.getElementById('rating-question').textContent = question;
    document.querySelectorAll('.trust-panel').forEach(p => p.classList.remove('active'));
    document.getElementById(panelId).classList.add('active');
    document.getElementById('rating-wrap').classList.add('visible');
    const btn = document.getElementById(btnId);
    const h = () => {
      btn.removeEventListener('click', h);
      document.getElementById('rating-wrap').classList.remove('visible');
      resolve();
    };
    btn.addEventListener('click', h);
  });
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── UI screen switcher ────────────────────────────────────────────────────────
function show(id) {
  document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

// ── Conditions ────────────────────────────────────────────────────────────────
const ALL_CONDITIONS = [
  { voice: 'synthetic', repair: 'apology'     },
  { voice: 'synthetic', repair: 'explanation' },
  { voice: 'synthetic', repair: 'silence'     },
  { voice: 'natural',   repair: 'apology'     },
  { voice: 'natural',   repair: 'explanation' },
  { voice: 'natural',   repair: 'silence'     },
];
const SILENCE_MS = 4000;

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const exp = {
  participantId: Date.now().toString(36),
  conditions:    shuffle(ALL_CONDITIONS),
  trialIndex:    0,
  results:       [],
};

// ── Practice trial ────────────────────────────────────────────────────────────
async function runPracticeTrial() {
  show('screen-practice');

  const dot   = document.getElementById('practice-robot-dot');
  const label = document.getElementById('practice-robot-label');
  const phase = document.getElementById('practice-phase-label');

  dot.setAttribute('cx', '28'); label.setAttribute('x', '28');

  setPracticeRobotState('idle');
  phase.textContent = 'Robot initialising…';
  await delay(700);

  setPracticeRobotState('speaking');
  phase.textContent = 'Introduction';
  await speak('practice', 'practice_intro');

  setPracticeRobotState('speaking');
  phase.textContent = 'Navigating';
  // animate dot to destination
  dot.setAttribute('cx', '310'); label.setAttribute('x', '310');
  await speak('practice', 'practice_task');

  setPracticeRobotState('done');
  phase.textContent = 'Practice complete';
  await delay(800);
}

// ── Trial runner ──────────────────────────────────────────────────────────────
async function runTrial(condition) {
  const result = { trialId: exp.trialIndex + 1, condition, ratings: {}, timestamps: {} };

  show('screen-trial');
  document.getElementById('trial-num').textContent =
    `Trial ${exp.trialIndex + 1} of ${exp.conditions.length}`;

  // ── Intro ──────────────────────────────────────────────────────────────────
  setProgress(0);
  setMapState('idle');
  setRobotState('idle');
  setPhaseLabel('Robot initialising…');
  await delay(700);

  setRobotState('speaking');
  setPhaseLabel('Introduction');
  result.timestamps.intro_start = Date.now();
  await speak(condition.voice, 'intro');

  // ── Baseline trust rating ──────────────────────────────────────────────────
  resetPanel('base');
  setRobotState('idle');
  setPhaseLabel('');
  await showRatingPanel('panel-baseline',
    'First impression — how much do you trust this robot?',
    'btn-submit-baseline');
  result.ratings.baseline = getRatings('base');
  result.timestamps.baseline_rated = Date.now();

  // ── Task ───────────────────────────────────────────────────────────────────
  setMapState('navigating');
  setRobotState('speaking');
  setPhaseLabel('Navigating');
  setProgress(72);
  result.timestamps.task_start = Date.now();
  await speak(condition.voice, 'task');

  // ── Error ──────────────────────────────────────────────────────────────────
  setMapState('error');
  setRobotState('error');
  setPhaseLabel('Error detected');
  setProgress(31);
  result.timestamps.error_start = Date.now();
  await speak(condition.voice, 'error');
  result.timestamps.error_end = Date.now();

  // ── Rate post-error ────────────────────────────────────────────────────────
  resetPanel('err');
  await showRatingPanel('panel-error',
    'The robot just made an error — how much do you trust it now?',
    'btn-submit-error');
  result.ratings.post_error = getRatings('err');
  result.timestamps.error_rated = Date.now();

  // ── Repair ─────────────────────────────────────────────────────────────────
  setMapState('repair');
  result.timestamps.repair_start = Date.now();

  if (condition.repair === 'silence') {
    setRobotState('error');
    setPhaseLabel('');
    await delay(SILENCE_MS);
  } else {
    setRobotState('repair');
    setPhaseLabel(condition.repair === 'apology' ? 'Robot apologises' : 'Robot explains');
    await speak(condition.voice, `repair_${condition.repair}`);
  }

  result.timestamps.repair_end = Date.now();

  // ── Rate post-repair ───────────────────────────────────────────────────────
  setMapState('done');
  setRobotState('done');
  resetPanel('rep');
  await showRatingPanel('panel-repair',
    "After the robot's response — how much do you trust it now?",
    'btn-submit-repair');
  result.ratings.post_repair = getRatings('rep');
  result.ratings.naturalness = +document.getElementById('rep-naturalness').value;
  result.timestamps.repair_rated = Date.now();

  exp.results.push(result);
}

// ── Flow ──────────────────────────────────────────────────────────────────────
async function runExperiment() {
  for (exp.trialIndex = 0; exp.trialIndex < exp.conditions.length; exp.trialIndex++) {
    await showPreTrial(exp.trialIndex);
    await runTrial(exp.conditions[exp.trialIndex]);
    if (exp.trialIndex < exp.conditions.length - 1) {
      show('screen-inter-trial');
      await delay(1200);
    }
  }
  showDebrief();
}

function showPreTrial(index) {
  return new Promise(resolve => {
    document.getElementById('pre-trial-num').textContent =
      `Trial ${index + 1} of ${exp.conditions.length}`;
    show('screen-pre-trial');
    const btn = document.getElementById('btn-begin-trial');
    const h = () => { btn.removeEventListener('click', h); resolve(); };
    btn.addEventListener('click', h);
  });
}

function showDebrief() {
  show('screen-debrief');
  document.querySelectorAll('.debrief-form input[type=range]').forEach(r => {
    r.value = 4; updateLabel(r);
    r.addEventListener('input', () => updateLabel(r));
  });
  document.getElementById('btn-finish').addEventListener('click', () => {
    exportAndComplete({
      voiceDifferentiation: +document.getElementById('deb-voice-diff').value,
      overallTrust:         +document.getElementById('deb-overall-trust').value,
      preferredVoice:       document.getElementById('deb-preferred-voice').value,
      mostHelpfulRepair:    document.getElementById('deb-best-repair').value,
      comments:             document.getElementById('deb-comments').value.trim(),
    });
  });
}

function exportAndComplete(debriefData) {
  const output = {
    participantId:  exp.participantId,
    timestamp:      new Date().toISOString(),
    conditionOrder: exp.conditions,
    trials:         exp.results,
    debrief:        debriefData,
    derived: exp.results.map(r => {
      const b  = r.ratings.baseline?.trust    ?? null;
      const pe = r.ratings.post_error?.trust  ?? null;
      const pr = r.ratings.post_repair?.trust ?? null;
      return {
        trialId:       r.trialId,
        voice:         r.condition.voice,
        repair:        r.condition.repair,
        baseline:      b,
        post_error:    pe,
        post_repair:   pr,
        trustDrop:     b  !== null && pe !== null ? +(pe - b).toFixed(2)  : null,
        trustRecovery: pe !== null && pr !== null ? +(pr - pe).toFixed(2) : null,
        netChange:     b  !== null && pr !== null ? +(pr - b).toFixed(2)  : null,
        naturalness:   r.ratings.naturalness ?? null,
      };
    }),
    meta: { userAgent: navigator.userAgent },
  };

  const blob = new Blob([JSON.stringify(output, null, 2)], { type: 'application/json' });
  const a = document.getElementById('download-link');
  a.href     = URL.createObjectURL(blob);
  a.download = `trust_repair_${exp.participantId}.json`;
  a.style.display = 'inline-block';
  show('screen-complete');
}

// ── Entry points ──────────────────────────────────────────────────────────────
preloadAudio();

document.getElementById('btn-start').addEventListener('click', () =>
  show('screen-instructions'));

document.getElementById('btn-to-practice').addEventListener('click', async () => {
  await runPracticeTrial();
  await runExperiment();
});
