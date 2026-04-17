// Sounding Robots-inspired approach signal (Orthmann et al. 2023)
// Mapping: distance → pitch (urgency) + rhythm (directionality)
// Far away: low pitch, slow pulse. Close: high pitch, fast pulse.

let audioCtx = null;
let pulseTimeout = null;
let isPlaying = false;

export function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioCtx;
}

export function resumeAudio() {
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

// distance: 0 (touching) to SIGNAL_START_DISTANCE (far)
export function playApproachPulse(distance, maxDistance) {
  if (!audioCtx) return;
  const ctx = audioCtx;

  const t = Math.max(0, Math.min(1, 1 - distance / maxDistance)); // 0 = far, 1 = close

  // Orthmann et al. mappings:
  // - urgency → pitch (200 Hz far, 800 Hz close)
  // - speed → pulse rate (slow far, fast close)
  const freq = 200 + t * 600;
  const pulseInterval = 800 - t * 650; // ms between pulses: 800ms far, 150ms close
  const duration = 0.06 + t * 0.06;    // pulse length

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const now = ctx.currentTime;

  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq, now);
  osc.frequency.linearRampToValueAtTime(freq * 1.1, now + duration); // slight upward sweep = "moving toward"

  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.5, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + duration + 0.01);

  return pulseInterval;
}

export function startApproachSignal(getDistance, maxDistance) {
  if (isPlaying) return;
  isPlaying = true;

  function pulse() {
    if (!isPlaying) return;
    const dist = getDistance();
    if (dist !== null) {
      // Robot within signal range — play pulse and schedule next at tempo matching distance
      const interval = playApproachPulse(dist, maxDistance);
      pulseTimeout = setTimeout(pulse, interval);
    } else {
      // Robot still far — keep polling every 250 ms until it enters range
      pulseTimeout = setTimeout(pulse, 250);
    }
  }
  pulse();
}

export function stopApproachSignal() {
  isPlaying = false;
  if (pulseTimeout) {
    clearTimeout(pulseTimeout);
    pulseTimeout = null;
  }
}
