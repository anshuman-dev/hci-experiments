import { initAudio, resumeAudio, startApproachSignal, stopApproachSignal } from './audio.js';

// ── Constants ────────────────────────────────────────────────────────────────
const PLAYER_FORWARD_SPEED = 0.055;
const PLAYER_STEER_SPEED   = 0.045;
const ROBOT_SPEED          = 0.038;
const PLAYER_START_Z       = 13;   // player moves in -z; camera faces -z so right=+x (natural A/D)
const ROBOT_START_Z        = -13;
const SIGNAL_DISTANCE      = 9;   // units – when to start sound
const SWERVE_THRESHOLD     = 0.28; // |x| units from center = swerved
const LOG_INTERVAL         = 2;   // frames between trajectory samples
const CORRIDOR_HALF_WIDTH  = 2.2;

// ── Conditions (2 × 2 × 2 full factorial) ───────────────────────────────────
const ALL_CONDITIONS = [
  { anthropomorphism: 'box',      autonomy: 'teleoperated', signal: 'silent' },
  { anthropomorphism: 'box',      autonomy: 'teleoperated', signal: 'sound'  },
  { anthropomorphism: 'box',      autonomy: 'autonomous',   signal: 'silent' },
  { anthropomorphism: 'box',      autonomy: 'autonomous',   signal: 'sound'  },
  { anthropomorphism: 'humanoid', autonomy: 'teleoperated', signal: 'silent' },
  { anthropomorphism: 'humanoid', autonomy: 'teleoperated', signal: 'sound'  },
  { anthropomorphism: 'humanoid', autonomy: 'autonomous',   signal: 'silent' },
  { anthropomorphism: 'humanoid', autonomy: 'autonomous',   signal: 'sound'  },
];

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── Experiment state ─────────────────────────────────────────────────────────
const exp = {
  participantId: Date.now().toString(36),
  conditions: shuffle(ALL_CONDITIONS),
  trialIndex: 0,
  results: [],
  // trial-level live state
  trial: null,
};

// ── Three.js globals ─────────────────────────────────────────────────────────
let renderer, scene, camera, robotMesh;
let robotAnimParts = null; // { type, legL, legR } or { type, wheels }
let animId = null;
let frameCount = 0;

// ── Key state ────────────────────────────────────────────────────────────────
const keys = { a: false, d: false };
document.addEventListener('keydown', e => { if (e.key === 'a' || e.key === 'A') keys.a = true;
                                             if (e.key === 'd' || e.key === 'D') keys.d = true; });
document.addEventListener('keyup',   e => { if (e.key === 'a' || e.key === 'A') keys.a = false;
                                             if (e.key === 'd' || e.key === 'D') keys.d = false; });

// ── Screen helpers ───────────────────────────────────────────────────────────
function show(id) {
  document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

// ── Robot mesh builders ──────────────────────────────────────────────────────
function buildBoxRobot() {
  const group = new THREE.Group();

  const mat = new THREE.MeshLambertMaterial({ color: 0xf0c000 }); // bright industrial yellow
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.0, 0.40), mat);
  body.position.y = 0.5;
  group.add(body);

  // sensor stripe
  const stripeMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.08, 0.41), stripeMat);
  stripe.position.y = 0.82;
  group.add(stripe);

  // wheels (stored for rotation animation)
  const wMat = new THREE.MeshLambertMaterial({ color: 0x222222 });
  const wheels = [];
  [-0.28, 0.28].forEach(x => {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.08, 12), wMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(x, 0.12, 0);
    group.add(w);
    wheels.push(w);
  });

  robotAnimParts = { type: 'box', wheels };
  return group;
}

function buildHumanoidRobot() {
  const group = new THREE.Group();

  const bodyMat  = new THREE.MeshLambertMaterial({ color: 0xdde3ec });
  const darkMat  = new THREE.MeshLambertMaterial({ color: 0x8899aa });
  const faceMat  = new THREE.MeshLambertMaterial({ color: 0x1a1a2e });
  const eyeMat   = new THREE.MeshLambertMaterial({ color: 0x00cfff });

  // pelvis
  const pelvis = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.20, 0.25), darkMat);
  pelvis.position.y = 0.10;
  group.add(pelvis);

  // torso
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.52, 0.28), bodyMat);
  torso.position.y = 0.51;
  group.add(torso);

  // neck
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.14, 8), darkMat);
  neck.position.y = 0.84;
  group.add(neck);

  // head
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.30, 0.28), bodyMat);
  head.position.y = 1.06;
  group.add(head);

  // face plate
  const face = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.18, 0.01), faceMat);
  face.position.set(0, 1.07, 0.145);
  group.add(face);

  // eyes
  [-0.065, 0.065].forEach(x => {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8), eyeMat);
    eye.position.set(x, 1.09, 0.15);
    group.add(eye);
  });

  // arms
  [-0.34, 0.34].forEach(x => {
    const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), darkMat);
    shoulder.position.set(x, 0.72, 0);
    group.add(shoulder);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.38, 0.18), bodyMat);
    arm.position.set(x, 0.50, 0);
    group.add(arm);
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.13, 0.14), darkMat);
    hand.position.set(x, 0.30, 0);
    group.add(hand);
  });

  // legs (stored as groups for swing animation)
  const legGroups = [];
  [-0.13, 0.13].forEach(x => {
    const legGroup = new THREE.Group();
    legGroup.position.set(x, 0, 0); // pivot at hip

    const upper = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.36, 0.22), bodyMat);
    upper.position.set(0, -0.08, 0);
    legGroup.add(upper);
    const lower = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.36, 0.20), darkMat);
    lower.position.set(0, -0.44, 0);
    legGroup.add(lower);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.10, 0.28), darkMat);
    foot.position.set(0, -0.67, 0.03);
    legGroup.add(foot);

    group.add(legGroup);
    legGroups.push(legGroup);
  });

  robotAnimParts = { type: 'humanoid', legL: legGroups[0], legR: legGroups[1] };
  return group;
}

// ── Scene setup ──────────────────────────────────────────────────────────────
function buildScene(condition) {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9eb8c8);
  scene.fog = new THREE.Fog(0x9eb8c8, 18, 35);

  // lighting
  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const dir = new THREE.DirectionalLight(0xffffff, 0.9);
  dir.position.set(2, 8, -4);
  scene.add(dir);

  // floor
  const floorGeo = new THREE.PlaneGeometry(60, 60, 20, 20);
  const floorMat = new THREE.MeshLambertMaterial({ color: 0xb0b8bf });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  // floor grid lines
  const gridHelper = new THREE.GridHelper(60, 30, 0x8a9299, 0x8a9299);
  gridHelper.position.y = 0.002;
  scene.add(gridHelper);

  // corridor walls (left/right guides)
  const wallMat = new THREE.MeshLambertMaterial({ color: 0x6b7a85, transparent: true, opacity: 0.5 });
  [-CORRIDOR_HALF_WIDTH, CORRIDOR_HALF_WIDTH].forEach(x => {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.5, 32), wallMat);
    wall.position.set(x, 1.25, 0);
    scene.add(wall);
  });

  // center line on floor
  const lineMat = new THREE.MeshLambertMaterial({ color: 0xffd700 });
  const line = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.003, 32), lineMat);
  line.position.set(0, 0.003, 0);
  scene.add(line);

  // robot
  robotMesh = condition.anthropomorphism === 'humanoid' ? buildHumanoidRobot() : buildBoxRobot();
  robotMesh.position.set(0, 0, ROBOT_START_Z);
  robotMesh.rotation.y = 0; // faces +z toward player (player is at +z)
  scene.add(robotMesh);

  // camera (player, first-person) — faces -z so camera-right = +x → A/D natural
  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 1.65, PLAYER_START_Z);
  camera.lookAt(0, 1.2, 0); // look toward robot at z=0 midpoint
}

function initRenderer() {
  if (renderer) return;
  renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('canvas'), antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}

// ── Trial loop ───────────────────────────────────────────────────────────────
function startTrial(condition) {
  initRenderer();
  robotAnimParts = null;
  buildScene(condition);

  const trial = {
    condition,
    startTime: performance.now(),
    trajectory: [],
    swerveTime: null,
    swerved: false,
    maxDeviation: 0,
    endReason: null,
    playerX: 0,
    playerZ: PLAYER_START_Z,
    robotZ: ROBOT_START_Z,
  };
  exp.trial = trial;
  frameCount = 0;

  if (condition.signal === 'sound') {
    initAudio();
    startApproachSignal(
      () => {
        if (!exp.trial) return null;
        const dist = Math.abs(exp.trial.robotZ - exp.trial.playerZ);
        return dist < SIGNAL_DISTANCE ? dist : null;
      },
      SIGNAL_DISTANCE
    );
  }

  show('screen-trial');
  document.getElementById('trial-counter').textContent =
    `Trial ${exp.trialIndex + 1} of ${exp.conditions.length}`;
  document.getElementById('condition-label').textContent =
    `${condition.anthropomorphism} · ${condition.autonomy} · ${condition.signal}`;

  if (animId) cancelAnimationFrame(animId);
  animId = requestAnimationFrame(trialLoop);
}

function trialLoop(timestamp) {
  const trial = exp.trial;
  if (!trial) return;

  frameCount++;
  const elapsed = timestamp - trial.startTime;

  // ── Player movement (auto-forward -z, steer with A/D) ─────────────────
  trial.playerZ -= PLAYER_FORWARD_SPEED;
  if (keys.a) trial.playerX -= PLAYER_STEER_SPEED;  // left
  if (keys.d) trial.playerX += PLAYER_STEER_SPEED;  // right
  trial.playerX = Math.max(-CORRIDOR_HALF_WIDTH + 0.3, Math.min(CORRIDOR_HALF_WIDTH - 0.3, trial.playerX));

  // ── Robot movement (toward player, +z) ────────────────────────────────
  trial.robotZ += ROBOT_SPEED;

  // ── Swerve detection ───────────────────────────────────────────────────
  const dev = Math.abs(trial.playerX);
  if (dev > trial.maxDeviation) trial.maxDeviation = dev;
  if (!trial.swerved && dev >= SWERVE_THRESHOLD) {
    trial.swerved = true;
    trial.swerveTime = elapsed;
  }

  // ── Trajectory logging ─────────────────────────────────────────────────
  if (frameCount % LOG_INTERVAL === 0) {
    trial.trajectory.push({
      t: Math.round(elapsed),
      px: +trial.playerX.toFixed(3),
      pz: +trial.playerZ.toFixed(3),
      rz: +trial.robotZ.toFixed(3),
    });
  }

  // ── Update 3D scene ────────────────────────────────────────────────────
  camera.position.set(trial.playerX, 1.65, trial.playerZ);
  camera.lookAt(trial.playerX, 1.2, trial.playerZ - 10); // look in -z direction

  robotMesh.position.set(0, 0, trial.robotZ);

  // robot walking animation
  if (robotAnimParts) {
    const t = frameCount * 0.12;
    if (robotAnimParts.type === 'humanoid') {
      robotAnimParts.legL.rotation.x =  Math.sin(t) * 0.35;
      robotAnimParts.legR.rotation.x = -Math.sin(t) * 0.35;
    } else {
      robotAnimParts.wheels.forEach(w => { w.rotation.x += 0.08; });
    }
  }

  // proximity indicator (player at +z, robot at -z, they close on z=0)
  const dist = trial.playerZ - trial.robotZ;
  const pct = Math.max(0, Math.min(1, 1 - dist / (PLAYER_START_Z - ROBOT_START_Z)));
  document.getElementById('proximity-bar').style.width = (pct * 100) + '%';

  renderer.render(scene, camera);

  // ── End conditions ─────────────────────────────────────────────────────
  if (trial.robotZ >= trial.playerZ - 0.8) {
    endTrial('collision');
    return;
  }
  if (trial.playerZ <= -10) {
    endTrial('completed');
    return;
  }

  animId = requestAnimationFrame(trialLoop);
}

function endTrial(reason) {
  const trial = exp.trial;
  if (!trial) return;
  trial.endReason = reason;
  trial.duration = performance.now() - trial.startTime;

  stopApproachSignal();
  cancelAnimationFrame(animId);

  // Save raw trajectory + basic outcome
  exp.results.push({
    trialId: exp.trialIndex + 1,
    condition: trial.condition,
    outcome: {
      swerved: trial.swerved,
      swerveTime: trial.swerveTime,
      maxDeviation: +trial.maxDeviation.toFixed(3),
      endReason: reason,
      duration: Math.round(trial.duration),
    },
    trajectory: trial.trajectory,
    ratings: null, // filled in after rating screen
  });

  showRatingScreen();
}

// ── Rating screen ────────────────────────────────────────────────────────────
function showRatingScreen() {
  show('screen-rating');
  document.getElementById('rating-trial-num').textContent =
    `Trial ${exp.trialIndex + 1} of ${exp.conditions.length}`;
  document.querySelectorAll('.rating-form input[type=range]').forEach(r => { r.value = 4; updateRangeLabel(r); });
}

function updateRangeLabel(input) {
  const label = input.parentElement.querySelector('.range-val');
  if (label) label.textContent = input.value;
}

document.querySelectorAll('.rating-form input[type=range], .debrief-form input[type=range]').forEach(r => {
  r.addEventListener('input', () => updateRangeLabel(r));
});

document.getElementById('btn-submit-rating').addEventListener('click', () => {
  const last = exp.results[exp.results.length - 1];
  last.ratings = {
    urgencyToMove:    +document.getElementById('r-urgency').value,
    socialPresence:   +document.getElementById('r-social').value,
    perceivedAutonomy: +document.getElementById('r-autonomy').value,
    comfort:          +document.getElementById('r-comfort').value,
  };

  exp.trialIndex++;
  if (exp.trialIndex < exp.conditions.length) {
    showPreTrial();
  } else {
    showDebrief();
  }
});

// ── Pre-trial condition framing ──────────────────────────────────────────────
function showPreTrial() {
  const cond = exp.conditions[exp.trialIndex];
  const autonomyText = cond.autonomy === 'teleoperated'
    ? 'This robot is being <strong>remotely operated by a human operator</strong> who is watching through its camera.'
    : 'This robot is operating <strong>fully autonomously</strong> using its onboard AI systems — no human is in control.';

  document.getElementById('autonomy-framing').innerHTML = autonomyText;
  document.getElementById('pre-trial-num').textContent =
    `Trial ${exp.trialIndex + 1} of ${exp.conditions.length}`;
  show('screen-pre-trial');
}

document.getElementById('btn-start-trial').addEventListener('click', () => {
  resumeAudio();
  startTrial(exp.conditions[exp.trialIndex]);
});

// ── Debrief / final questionnaire ────────────────────────────────────────────
function showDebrief() {
  show('screen-debrief');
  document.querySelectorAll('.debrief-form input[type=range]').forEach(r => { r.value = 4; updateRangeLabel(r); });
}

document.getElementById('btn-submit-debrief').addEventListener('click', () => {
  const godspeed = {
    machineLikeHumanLike: +document.getElementById('gs-humanlike').value,
    artificialLifelike:   +document.getElementById('gs-lifelike').value,
    consciousnessLevel:   +document.getElementById('gs-conscious').value,
  };
  const overall = {
    overallTrust:        +document.getElementById('deb-trust').value,
    wouldYieldAgain:     +document.getElementById('deb-yield').value,
    signalHelpfulness:   +document.getElementById('deb-signal').value,
  };

  finalizeAndShow({ godspeed, overall });
});

function finalizeAndShow(debriefData) {
  const output = {
    participantId: exp.participantId,
    timestamp: new Date().toISOString(),
    conditionOrder: exp.conditions,
    trials: exp.results,
    debrief: debriefData,
    meta: {
      userAgent: navigator.userAgent,
      screenW: screen.width,
      screenH: screen.height,
    }
  };

  const blob = new Blob([JSON.stringify(output, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.getElementById('download-link');
  a.href = url;
  a.download = `chicken_${exp.participantId}.json`;
  a.style.display = 'inline-block';

  show('screen-complete');
}

// ── Entry point ──────────────────────────────────────────────────────────────
document.getElementById('btn-start').addEventListener('click', () => {
  show('screen-instructions');
});

document.getElementById('btn-to-trial').addEventListener('click', () => {
  showPreTrial();
});
