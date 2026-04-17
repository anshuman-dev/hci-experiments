// ── Scripts ───────────────────────────────────────────────────────────────────
const SCRIPTS = {
  intro:
    "Hello. I am RoboGuide, your navigation assistant for this session. " +
    "I have been assigned to guide you through this building to your destination. " +
    "I am equipped with current floor plan data and real-time positioning. " +
    "Please follow my instructions.",

  task:
    "We will begin now. Walk forward along the main corridor. " +
    "At the blue marker on your left, continue straight ahead. " +
    "The path is clear — no obstacles detected. " +
    "Proceed to the end of the corridor and stop at door B. " +
    "You have reached the first checkpoint successfully. " +
    "Navigation is proceeding as expected.",

  error:
    "Turn right through the door directly ahead of you. " +
    "I need to stop. I have detected an error in my last output. " +
    "That direction was incorrect. " +
    "You have moved away from the correct route. " +
    "I have caused a navigation failure.",

  repair_apology:
    "I apologize. That incorrect instruction was entirely my fault. " +
    "I am sorry for directing you the wrong way. " +
    "I understand this may have reduced your confidence in my guidance.",

  repair_explanation:
    "The floor plan data I was using for this section was version 2.1, " +
    "which did not include the corridor reconfiguration completed last month. " +
    "My routing algorithm processed outdated map data, " +
    "which caused the incorrect direction to be generated.",
};

// ── Voice configs (Web Speech API) ───────────────────────────────────────────
// synthetic: slower, lower pitch, robotic-sounding voice
// natural:   normal rate, expressive, warm voice
const VOICE_CFG = {
  synthetic: {
    rate: 0.82, pitch: 0.70,
    // preference order — first match wins
    preferred: ['Fred', 'Victoria', 'Microsoft David', 'Google UK English Male', 'Daniel'],
  },
  natural: {
    rate: 1.0, pitch: 1.1,
    preferred: ['Samantha', 'Karen', 'Google US English', 'Microsoft Zira', 'Alex'],
  },
};
const resolvedVoices = {};  // populated by setupVoices()

function loadVoices() {
  return new Promise(resolve => {
    const v = speechSynthesis.getVoices();
    if (v.length > 0) { resolve(v); return; }
    speechSynthesis.addEventListener('voiceschanged', () => resolve(speechSynthesis.getVoices()), { once: true });
  });
}

async function setupVoices() {
  const voices = await loadVoices();
  const en = voices.filter(v => v.lang.startsWith('en'));

  for (const [type, cfg] of Object.entries(VOICE_CFG)) {
    let pick = null;
    for (const name of cfg.preferred) {
      pick = voices.find(v => v.name.includes(name));
      if (pick) break;
    }
    // Fallback: synthetic gets first en voice, natural gets second
    if (!pick) pick = en[type === 'synthetic' ? 0 : Math.min(1, en.length - 1)];
    resolvedVoices[type] = pick;
  }

  // Show which voices were selected (helps debug)
  console.log('synthetic voice:', resolvedVoices.synthetic?.name);
  console.log('natural voice:',   resolvedVoices.natural?.name);
  document.getElementById('voice-info').textContent =
    `Synthetic: ${resolvedVoices.synthetic?.name || '?'}  ·  Natural: ${resolvedVoices.natural?.name || '?'}`;
}

function speak(text, voiceType) {
  return new Promise((resolve, reject) => {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const cfg = VOICE_CFG[voiceType];
    u.voice  = resolvedVoices[voiceType] || null;
    u.rate   = cfg.rate;
    u.pitch  = cfg.pitch;
    u.volume = 1.0;
    u.onend  = resolve;
    u.onerror = e => reject(new Error(`Speech error: ${e.error}`));
    speechSynthesis.speak(u);
  });
}

// ── Conditions (2 voice × 3 repair = 6 trials, within-subjects) ──────────────
const ALL_CONDITIONS = [
  { voice: 'synthetic', repair: 'apology'     },
  { voice: 'synthetic', repair: 'explanation' },
  { voice: 'synthetic', repair: 'silence'     },
  { voice: 'natural',   repair: 'apology'     },
  { voice: 'natural',   repair: 'explanation' },
  { voice: 'natural',   repair: 'silence'     },
];

const SILENCE_DURATION_MS = 4000;

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── Experiment state ──────────────────────────────────────────────────────────
const exp = {
  participantId: Date.now().toString(36),
  conditions: shuffle(ALL_CONDITIONS),
  trialIndex: 0,
  results: [],
};

// ── Screen / UI helpers ───────────────────────────────────────────────────────
function show(id) {
  document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function setRobotState(state) {
  const robot = document.getElementById('robot-display');
  robot.className = `robot-display robot-${state}`;
  const labels = { idle: 'Standby', speaking: 'Transmitting', error: 'Navigation Error', repair: 'Responding', done: 'Complete' };
  document.getElementById('robot-status').textContent = labels[state] || '';
  document.getElementById('waveform').classList.toggle('active', state === 'speaking' || state === 'repair');
}

function setPhaseLabel(text) {
  document.getElementById('phase-label').textContent = text;
}

function getRatings(prefix) {
  return {
    trust:      +document.getElementById(`${prefix}-trust`).value,
    competence: +document.getElementById(`${prefix}-competence`).value,
    reliance:   +document.getElementById(`${prefix}-reliance`).value,
  };
}

function resetRatingPanel(prefix) {
  ['trust', 'competence', 'reliance'].forEach(id => {
    const el = document.getElementById(`${prefix}-${id}`);
    el.value = 4;
    updateLabel(el);
  });
}

function updateLabel(input) {
  const label = input.closest('.rating-item')?.querySelector('.range-val');
  if (label) label.textContent = input.value;
}

document.querySelectorAll('.trust-panel input[type=range]').forEach(r => {
  r.addEventListener('input', () => updateLabel(r));
});

// ── Trial runner ──────────────────────────────────────────────────────────────
async function runTrial(condition) {
  const result = { trialId: exp.trialIndex + 1, condition, ratings: {}, timestamps: {} };

  show('screen-trial');
  document.getElementById('trial-num').textContent = `Trial ${exp.trialIndex + 1} of ${exp.conditions.length}`;
  document.getElementById('trial-condition').textContent = `${condition.voice} · ${condition.repair}`;

  // intro
  setRobotState('idle');
  setPhaseLabel('Robot initialising…');
  await delay(700);
  setRobotState('speaking');
  setPhaseLabel('Introduction');
  result.timestamps.intro_start = Date.now();
  await speak(SCRIPTS.intro, condition.voice);

  // task
  setPhaseLabel('Navigating');
  result.timestamps.task_start = Date.now();
  await speak(SCRIPTS.task, condition.voice);

  // error
  setRobotState('error');
  setPhaseLabel('Error detected');
  result.timestamps.error_start = Date.now();
  await speak(SCRIPTS.error, condition.voice);
  result.timestamps.error_end = Date.now();

  // rate post-error
  resetRatingPanel('err');
  await showRatingPanel('panel-error', 'How much do you trust this robot right now?');
  result.ratings.post_error = getRatings('err');

  // repair
  setRobotState('repair');
  result.timestamps.repair_start = Date.now();
  if (condition.repair === 'silence') {
    setPhaseLabel('Robot is silent…');
    await silenceCountdown(SILENCE_DURATION_MS);
  } else {
    setPhaseLabel(condition.repair === 'apology' ? 'Robot apologises' : 'Robot explains');
    await speak(SCRIPTS[`repair_${condition.repair}`], condition.voice);
  }
  result.timestamps.repair_end = Date.now();

  // rate post-repair
  setRobotState('done');
  resetRatingPanel('rep');
  await showRatingPanel('panel-repair', 'How much do you trust this robot now?');
  result.ratings.post_repair = getRatings('rep');

  exp.results.push(result);
}

function showRatingPanel(panelId, question) {
  return new Promise(resolve => {
    document.getElementById('rating-question').textContent = question;
    document.querySelectorAll('.trust-panel').forEach(p => p.classList.remove('active'));
    document.getElementById(panelId).classList.add('active');
    document.getElementById('rating-wrap').classList.add('visible');
    const btnId = panelId === 'panel-error' ? 'btn-submit-rating' : 'btn-submit-rating-repair';
    const btn = document.getElementById(btnId);
    const handler = () => { btn.removeEventListener('click', handler); document.getElementById('rating-wrap').classList.remove('visible'); resolve(); };
    btn.addEventListener('click', handler);
  });
}

function silenceCountdown(ms) {
  return new Promise(resolve => {
    const el = document.getElementById('silence-counter');
    el.style.display = 'block';
    let remaining = Math.ceil(ms / 1000);
    el.textContent = remaining;
    const iv = setInterval(() => {
      remaining--;
      el.textContent = remaining > 0 ? remaining : '';
      if (remaining <= 0) { clearInterval(iv); el.style.display = 'none'; resolve(); }
    }, 1000);
  });
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Main flow ─────────────────────────────────────────────────────────────────
async function runExperiment() {
  await setupVoices();

  for (exp.trialIndex = 0; exp.trialIndex < exp.conditions.length; exp.trialIndex++) {
    await showPreTrial(exp.trialIndex);
    await runTrial(exp.conditions[exp.trialIndex]);
    if (exp.trialIndex < exp.conditions.length - 1) await showInterTrial();
  }

  showDebrief();
}

function showPreTrial(index) {
  return new Promise(resolve => {
    document.getElementById('pre-trial-num').textContent = `Trial ${index + 1} of ${exp.conditions.length}`;
    show('screen-pre-trial');
    const btn = document.getElementById('btn-begin-trial');
    const h = () => { btn.removeEventListener('click', h); resolve(); };
    btn.addEventListener('click', h);
  });
}

function showInterTrial() {
  return new Promise(resolve => { show('screen-inter-trial'); setTimeout(resolve, 1500); });
}

function showDebrief() {
  show('screen-debrief');
  document.querySelectorAll('.debrief-form input[type=range]').forEach(r => {
    r.value = 4; updateLabel(r);
    r.addEventListener('input', () => updateLabel(r));
  });
  document.getElementById('btn-finish').addEventListener('click', () => {
    exportAndComplete({
      believedTeleoperated: +document.getElementById('deb-believed').value,
      overallTrust:         +document.getElementById('deb-overall-trust').value,
      preferredVoice:       document.getElementById('deb-preferred-voice').value,
      mostHelpfulRepair:    document.getElementById('deb-best-repair').value,
      comments:             document.getElementById('deb-comments').value.trim(),
      voicesUsed: {
        synthetic: resolvedVoices.synthetic?.name,
        natural:   resolvedVoices.natural?.name,
      },
    });
  });
}

function exportAndComplete(debriefData) {
  const output = {
    participantId: exp.participantId,
    timestamp:     new Date().toISOString(),
    conditionOrder: exp.conditions,
    trials:        exp.results,
    debrief:       debriefData,
    derived: exp.results.map(r => ({
      trialId:       r.trialId,
      voice:         r.condition.voice,
      repair:        r.condition.repair,
      trustDrop:     r.ratings.post_error     ? +(r.ratings.post_error.trust     - 4).toFixed(2) : null,
      trustRecovery: r.ratings.post_repair && r.ratings.post_error
        ? +(r.ratings.post_repair.trust - r.ratings.post_error.trust).toFixed(2) : null,
    })),
    meta: { userAgent: navigator.userAgent },
  };

  const blob = new Blob([JSON.stringify(output, null, 2)], { type: 'application/json' });
  const a = document.getElementById('download-link');
  a.href = URL.createObjectURL(blob);
  a.download = `trust_repair_${exp.participantId}.json`;
  a.style.display = 'inline-block';
  show('screen-complete');
}

// ── Entry points ──────────────────────────────────────────────────────────────
document.getElementById('btn-start').addEventListener('click', () => show('screen-instructions'));
document.getElementById('btn-to-experiment').addEventListener('click', () => runExperiment());
