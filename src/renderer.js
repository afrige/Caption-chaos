// Caption Chaos
//
// Real microphone recording.
// Original player audio.
// No TTS. No pitch shifting. No voice processing.
// Discord OAuth profile integration.

/* =========================================================
   HELPERS
   ========================================================= */

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const clamp = (value, min, max) =>
  Math.min(max, Math.max(min, value));

const pad2 = (value) => String(value).padStart(2, '0');

function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (character) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    })[character]
  );
}


/* =========================================================
   STATE
   ========================================================= */

const current = { scene: 'hub' };

let timer = null;
let seconds = 15;

let recording = false;

let mediaRecorder = null;
let mediaStream = null;

let recordedChunks = [];
let recordedBlob = null;
let recordedUrl = null;

let mascotVoice = true;

let typeTimer = null;

let currentMascotAudio = null;

/* the five second mic test lives on the settings page */
let testRecorder = null;
let testStream = null;
let testTimer = null;
let testChunks = [];

let calm = false;

let round = 1;
let score = 0;
let playerSlot = -1;


/* =========================================================
   DIFFICULTY / MODE / CUSTOM RULES
   ========================================================= */

const DIFFICULTIES = {
  easy:      { label: 'Easy',      rounds: 5,  seconds: 20, players: 4, chaos: 0 },
  normal:    { label: 'Normal',    rounds: 5,  seconds: 15, players: 4, chaos: 25 },
  hard:      { label: 'Hard',      rounds: 7,  seconds: 10, players: 6, chaos: 55 },
  nightmare: { label: 'Nightmare', rounds: 10, seconds: 7,  players: 8, chaos: 100 }
};

const MODES = {
  classic: { label: 'Classic', secondsScale: 1,   multiplier: 1 },
  blitz:   { label: 'Blitz',   secondsScale: 0.5, multiplier: 1.5 },
  turn:    { label: 'Turn',    secondsScale: 0.85, multiplier: 1.2 },
  custom:  { label: 'Custom',  secondsScale: 1,   multiplier: 1 }
};

const LIMITS = {
  rounds:  { min: 1, max: 15, step: 1 },
  seconds: { min: 3, max: 45, step: 1 },
  players: { min: 2, max: 8,  step: 1 }
};

const rules = {
  difficulty: 'normal',
  mode: 'classic',
  rounds: 5,
  seconds: 15,
  players: 4,
  chaos: 25,
  anonymous: true,
  playback: true
};

// chaos level picks how many submissions come back to vote on
function submissionCount() {
  return clamp(
    2 + Math.round(rules.players / 2) + Math.round(rules.chaos / 40),
    2,
    8
  );
}

// difficulty and mode are folded in once, at round start
function applyRules() {
  const base = DIFFICULTIES[rules.difficulty];
  const mode = MODES[rules.mode];

  if (rules.mode === 'custom') {
    rules.rounds = clamp(rules.rounds, LIMITS.rounds.min, LIMITS.rounds.max);
    rules.seconds = clamp(rules.seconds, LIMITS.seconds.min, LIMITS.seconds.max);
    rules.players = clamp(rules.players, LIMITS.players.min, LIMITS.players.max);
  } else {
    rules.rounds = base.rounds;
    rules.players = base.players;
    rules.seconds = Math.max(
      LIMITS.seconds.min,
      Math.round(base.seconds * mode.secondsScale)
    );
  }

  rules.chaos = clamp(rules.chaos, 0, 100);

  // the hub shows the rules, so it has to hear about every change
  paintPlayRule();
}


/* the hub's Play card mirrors the rules you have actually chosen */
function paintPlayRule() {
  const label = $('#playRule');
  if (label) {
    const difficulty = DIFFICULTIES[rules.difficulty]?.label || 'Normal';
    const mode = MODES[rules.mode]?.label || 'Classic';

    label.textContent =
      `${difficulty} · ${mode} · ${rules.rounds} rounds · ${rules.seconds}s`;
  }

  const row = $('#quickDiff');
  if (row) {
    // the "3s" readout has to come from the mode's seconds scale, not the
    // difficulty's raw value, or Blitz would lie
    const scale = MODES[rules.mode]?.secondsScale ?? 1;

    row.innerHTML = Object.entries(DIFFICULTIES).map(([key, d]) => {
      const seconds = Math.max(
        LIMITS.seconds.min,
        Math.round(d.seconds * scale)
      );

      return `<button class="quick-btn${
        key === rules.difficulty ? ' on' : ''
      }" data-diff="${key}" type="button">
        <b>${escapeHtml(d.label)}</b>
        <small>${d.rounds}r · ${seconds}s</small>
      </button>`;
    }).join('');
  }
}


/* =========================================================
   TOASTS
   ========================================================= */

function toast(message) {
  const stack = $('#toastStack');
  if (!stack) return;

  const element = document.createElement('div');
  element.className = 'toast';
  element.textContent = message;

  stack.appendChild(element);

  setTimeout(() => {
    element.classList.add('out');
    setTimeout(() => element.remove(), 350);
  }, 2400);
}


/* =========================================================
   BACKDROP
   ========================================================= */

(function initBackdrop() {

  const webp = $('#bgWebp');
  const video = $('#bgVideo');

  if (webp) {
    if (webp.complete && webp.naturalWidth) {
      webp.classList.add('ready');
    } else {
      webp.addEventListener('load', () => webp.classList.add('ready'), {
        once: true
      });
    }
  }

  if (!video) return;

  // optional real footage; if it will not load the generated loop stays
  video.src = '../assets/media/hero.mp4';

  video.addEventListener('loadeddata', () => {
    video.classList.add('ready');
    if (webp) webp.classList.remove('ready');
  }, { once: true });

  video.addEventListener('error', () => {
    video.removeAttribute('src');
  }, { once: true });

})();


/* =========================================================
   PARTICLES
   Soft, slow, cute: wide diffuse haloes with a small bright
   core, plus a few drifting motes. Nothing is a hard dot.
   ========================================================= */

(function initParticles() {

  const canvas = $('#fx');
  if (!canvas) return;

  const context = canvas.getContext('2d');

  // purple family plus white, all low alpha
  const TINTS = [
    [190, 150, 255],
    [150, 100, 240],
    [120, 70, 200],
    [235, 225, 255],
    [255, 255, 255]
  ];

  let motes = [];
  let width = 0;
  let height = 0;

  function build() {
    const count = calm ? 0 : clamp(Math.round((width * height) / 30000), 0, 90);

    motes = Array.from({ length: count }, () => {
      // a few larger, very soft haloes and many small ones
      const big = Math.random() > 0.82;

      return {
        x: Math.random() * width,
        y: Math.random() * height,
        core: big ? 1.6 + Math.random() * 2.4 : 0.7 + Math.random() * 1.3,
        halo: big ? 26 + Math.random() * 46 : 12 + Math.random() * 22,
        speed: 0.05 + Math.random() * 0.20,
        drift: (Math.random() - 0.5) * 0.14,
        phase: Math.random() * Math.PI * 2,
        wobble: 0.004 + Math.random() * 0.010,
        alpha: big ? 0.16 + Math.random() * 0.12 : 0.22 + Math.random() * 0.20,
        tint: TINTS[Math.floor(Math.random() * TINTS.length)]
      };
    });
  }

  function resize() {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);

    width = canvas.clientWidth;
    height = canvas.clientHeight;

    canvas.width = Math.floor(width * ratio);
    canvas.height = Math.floor(height * ratio);

    context.setTransform(ratio, 0, 0, ratio, 0, 0);

    build();
  }

  function drawMote(mote) {
    const pulse = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(mote.phase * 1.4));

    const alpha = mote.alpha * pulse;
    const [r, g, b] = mote.tint;

    // wide soft halo
    const halo = context.createRadialGradient(
      mote.x, mote.y, 0,
      mote.x, mote.y, mote.halo
    );

    halo.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${alpha * 0.55})`);
    halo.addColorStop(0.45, `rgba(${r}, ${g}, ${b}, ${alpha * 0.16})`);
    halo.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);

    context.fillStyle = halo;
    context.fillRect(
      mote.x - mote.halo, mote.y - mote.halo,
      mote.halo * 2, mote.halo * 2
    );

    // small bright core
    const core = context.createRadialGradient(
      mote.x, mote.y, 0,
      mote.x, mote.y, mote.core * 3.2
    );

    core.addColorStop(0, `rgba(255, 255, 255, ${alpha * 0.85})`);
    core.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);

    context.fillStyle = core;
    context.fillRect(
      mote.x - mote.core * 3.2, mote.y - mote.core * 3.2,
      mote.core * 6.4, mote.core * 6.4
    );
  }

  function frame() {
    context.clearRect(0, 0, width, height);

    // soft-focus: the whole field gets a slight blur pass
    context.filter = 'blur(1.5px)';
    context.globalCompositeOperation = 'lighter';

    for (const mote of motes) {
      mote.y -= mote.speed;
      mote.phase += mote.wobble;
      mote.x += mote.drift + Math.sin(mote.phase) * 0.10;

      const pad = mote.halo + 10;

      if (mote.y < -pad) {
        mote.y = height + pad;
        mote.x = Math.random() * width;
      }
      if (mote.x < -pad) mote.x = width + pad;
      if (mote.x > width + pad) mote.x = -pad;

      drawMote(mote);
    }

    context.globalCompositeOperation = 'source-over';
    context.filter = 'none';

    requestAnimationFrame(frame);
  }

  window.addEventListener('resize', resize);

  resize();
  requestAnimationFrame(frame);

  window.rebuildParticles = resize;

  // the Interface settings tab can switch the whole field off
  window.setParticleVisibility = (visible) => {
    canvas.style.display = visible ? '' : 'none';
  };

})();


/* =========================================================
   SCENES
   There is no nav bar. The hub is a board of tiles, each
   opening its own screen, and a round hides all chrome.
   ========================================================= */

const GAME_SCENES = ['play', 'vote', 'winner', 'summary'];

function go(scene) {
  const target = $('#' + scene);
  if (!target) return;

  $$('.scene').forEach((element) => element.classList.remove('active'));
  target.classList.add('active');

  $('#stage').scrollTop = 0;

  const inGame = GAME_SCENES.includes(scene);
  $('#app').classList.toggle('in-game', inGame);

  current.scene = scene;

  if (scene === 'play') {
    resetRound();
    countdown();
  }

  if (scene === 'winner') celebrate();

  // the library and the studio tray both read from storage
  if (scene === 'mypacks') renderMyPacks();
  if (scene === 'packs') paintPackThumbs();
  if (scene === 'hub') paintPlayRule();

  // device labels need a fresh read each time you open the sound check,
  // which now lives inside the unified settings page
  if (scene === 'settings') listDevices();
}

$$('[data-scene]').forEach((button) => {
  button.addEventListener('click', () => go(button.dataset.scene));
});


/* =========================================================
   WINNER CONFETTI
   ========================================================= */

function celebrate() {
  const field = $('#winnerConfetti');
  if (!field || calm) return;

  field.innerHTML = '';

  for (let i = 0; i < 48; i++) {
    const bit = document.createElement('i');

    bit.style.left = `${Math.random() * 100}%`;
    bit.style.top = `${-6 - Math.random() * 18}%`;
    bit.style.animationDelay = `${Math.random() * 1.5}s`;
    bit.style.animationDuration = `${2 + Math.random() * 1.8}s`;

    field.appendChild(bit);
  }
}


/* =========================================================
   VOICY AUDIO
   ========================================================= */

function stopMascotAudio() {
  if (currentMascotAudio) {
    try {
      currentMascotAudio.pause();
      currentMascotAudio.currentTime = 0;
    } catch {}

    currentMascotAudio = null;
  }

  const portrait = $('.dialogue-portrait img');
  if (portrait) portrait.classList.remove('talking');

  $('#dialogue')?.classList.remove('is-talking');
}

function playVoicyRecording(audioSrc = '../assets/voicy/voicy.wav') {
  if (!mascotVoice) return null;

  stopMascotAudio();

  const audio = new Audio(audioSrc);
  audio.preload = 'auto';
  currentMascotAudio = audio;

  const portrait = $('.dialogue-portrait img');
  if (portrait) portrait.classList.add('talking');

  $('#dialogue')?.classList.add('is-talking');

  const clearTalking = () => {
    if (currentMascotAudio !== audio) return;

    currentMascotAudio = null;
    portrait?.classList.remove('talking');
    $('#dialogue')?.classList.remove('is-talking');
  };

  audio.addEventListener('ended', clearTalking);

  // assets/voicy/voicy.wav does not ship, so the load fails. Without this
  // the mascot would sit in the talking state forever, because "ended"
  // never fires for an element that never played.
  audio.addEventListener('error', clearTalking);

  audio.play().catch(clearTalking);

  return audio;
}

/* --------------------------------------------------------------
   Synthesised blips. assets/voicy/blip.wav does not ship, so the
   typewriter would be silent. WebAudio tones also stay in step
   with the per-character cadence.
   -------------------------------------------------------------- */

let blipContext = null;

function getBlipContext() {
  if (blipContext) return blipContext;

  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return null;

  blipContext = new AudioContext();

  // Chromium keeps the context suspended until a real gesture
  const resume = () => {
    if (blipContext.state === 'suspended') {
      blipContext.resume().catch(() => {});
    }
  };

  window.addEventListener('pointerdown', resume, { once: true });
  window.addEventListener('keydown', resume, { once: true });

  return blipContext;
}

function playVoicyBlip() {
  const context = getBlipContext();
  if (!context) return;

  const now = context.currentTime;

  const oscillator = context.createOscillator();
  const gain = context.createGain();

  oscillator.type = 'sine';

  const step = [0, 2, 4, 7, 9, 12][Math.floor(Math.random() * 6)];
  const base = 460 + step * 20;

  oscillator.frequency.setValueAtTime(base, now);
  oscillator.frequency.exponentialRampToValueAtTime(base * 1.3, now + 0.05);

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.05, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.07);

  oscillator.connect(gain);
  gain.connect(context.destination);

  oscillator.start(now);
  oscillator.stop(now + 0.08);

  oscillator.onended = () => {
    oscillator.disconnect();
    gain.disconnect();
  };
}


/* Reading speed, not a fixed tick.

   A step's copy is a paragraph rather than a sentence, so a flat
   per-character delay made a long one take over three seconds to land.
   The tick is chosen so the whole string lands in about `target`
   milliseconds, clamped so a two-word line still reads as typed rather
   than printed and a long one does not turn into a blur. */
function typingSpeed(length, target = 1400, min = 6, max = 30) {
  if (!length) return max;
  return Math.max(min, Math.min(max, Math.round(target / length)));
}

/* =========================================================
   THE DIALOGUE
   ========================================================= */

/* =========================================================
   THE DIALOGUE

   One box, one typewriter, one portrait. Voicy's own lines and the
   tour's steps both go through here, so there is no second copy of
   the markup's rules anywhere - which is what caused a second Voicy
   to appear under the first.

   The portrait sits BEHIND the panel. It is a negative z-index child
   of the box, so the part of it standing above the top edge shows
   and the part that would fall inside the panel is painted over.

   That is also why the box must never set overflow: a scroll
   container clips the part of the portrait that is supposed to show.
   ========================================================= */

function typeInto(target, text, { speed = 32, onChar, onDone } = {}) {
  if (!target) {
    onDone?.();
    return null;
  }

  clearInterval(typeTimer);
  typeTimer = null;

  target.textContent = '';

  if (!text) {
    onDone?.();
    return null;
  }

  let index = 0;

  typeTimer = setInterval(() => {
    if (index >= text.length) {
      clearInterval(typeTimer);
      typeTimer = null;
      onDone?.();
      return;
    }

    const character = text[index];
    target.textContent += character;
    index++;

    if (
      onChar &&
      character.trim() !== '' &&
      !/[.,!?;:'"()[\]{}\-—…]/.test(character)
    ) {
      onChar();
    }
  }, speed);

  return typeTimer;
}

/* 'speech' | 'tour' | 'end' */
function setDialogueMode(mode) {
  const box = $('#dialogue');
  if (!box) return;

  box.classList.toggle('is-tour', mode !== 'speech');
  box.classList.remove('is-waiting');

  $('#dialogueBody')?.classList.toggle('hidden', mode !== 'speech');
  $('#dialogueTour')?.classList.toggle('hidden', mode !== 'tour');
  $('#dialogueEnd')?.classList.toggle('hidden', mode !== 'end');
  $('#dialogueSkip')?.classList.toggle('hidden', mode !== 'speech');
}

function openDialogue(mode = 'speech') {
  $('#dialogue')?.classList.remove('hidden');
  setDialogueMode(mode);
}

function closeDialogue() {
  clearInterval(typeTimer);
  typeTimer = null;

  hideTourPointer();

  $('#dialogue')?.classList.add('hidden');
  setDialogueMode('speech');
}

/* =========================================================
   VOICY DIALOGUE
   ========================================================= */

function mascotSay(
  text,
  audioSrc = '../assets/voicy/voicy.wav',
  autoPlay = true
) {
  const dialogue = $('#dialogue');
  const box = $('#dialogueText');

  if (!dialogue || !box) return;

  stopMascotAudio();
  openDialogue('speech');

  typeInto(box, text, { onChar: playVoicyBlip });
}

function finishMascotDialogue() {
  clearInterval(typeTimer);
  typeTimer = null;
  stopMascotAudio();
}

$('#dialogueSkip')?.addEventListener('click', () => {
  finishMascotDialogue();
  closeDialogue();
});


/* =========================================================
   MICROPHONE
   ========================================================= */

async function requestMicrophone() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Microphone recording is unavailable.');
  }

  return navigator.mediaDevices.getUserMedia({ audio: true });
}

function getRecordingMimeType() {
  const formats = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4'
  ];

  for (const format of formats) {
    if (
      window.MediaRecorder &&
      MediaRecorder.isTypeSupported &&
      MediaRecorder.isTypeSupported(format)
    ) {
      return format;
    }
  }

  return '';
}

function setMicState(colour, label) {
  const state = $('#micState');
  if (!state) return;

  state.innerHTML =
    `<span class="dot" style="background:${colour}"></span> ${label}`;
}

function stopStream() {
  if (mediaStream) {
    mediaStream.getTracks().forEach((track) => track.stop());
    mediaStream = null;
  }
}


/* =========================================================
   RECORDING
   ========================================================= */

async function startRecording() {
  if (recording) return;

  try {
    mediaStream = await requestMicrophone();

    recordedChunks = [];
    recordedBlob = null;

    if (recordedUrl) {
      URL.revokeObjectURL(recordedUrl);
      recordedUrl = null;
    }

    const mimeType = getRecordingMimeType();

    mediaRecorder = mimeType
      ? new MediaRecorder(mediaStream, { mimeType })
      : new MediaRecorder(mediaStream);

    mediaRecorder.addEventListener('dataavailable', (event) => {
      if (event.data && event.data.size > 0) recordedChunks.push(event.data);
    });

    mediaRecorder.addEventListener('stop', () => {
      const finalType =
        mediaRecorder?.mimeType || mimeType || 'audio/webm';

      recordedBlob = new Blob(recordedChunks, { type: finalType });
      recordedUrl = URL.createObjectURL(recordedBlob);
      recordedChunks = [];

      stopStream();

      showRecordedPreview();
    });

    mediaRecorder.start();

    recording = true;

    $('#recordBtn')?.classList.add('hidden');
    $('#submitBtn')?.classList.remove('hidden');
    $('#wave')?.classList.add('live');

    setMicState('var(--rec)', 'Recording your actual voice');

    mascotSay('Okay. Clock is running. Cook.');

    startTimer();

  } catch (error) {
    console.error('Microphone error:', error);

    recording = false;

    setMicState('var(--rec)', 'Microphone access denied');

    toast('Microphone access is required to record your caption.');

    mascotSay('Microphone access is required before you can record.');
  }
}

function stopRecording(autoSubmit = false) {
  if (!recording) return;

  recording = false;

  clearInterval(timer);
  timer = null;

  setMicState('var(--live)', 'Caption recorded');

  $('#wave')?.classList.remove('live');

  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  } else {
    stopStream();
  }

  $('#recordBtn')?.classList.remove('hidden');
  $('#submitBtn')?.classList.add('hidden');

  if (autoSubmit) {
    setTimeout(() => submitCaption(), 400);
  }
}

function showRecordedPreview() {
  const preview = $('#captionPreview');

  if (!preview || !recordedUrl) return;

  preview.classList.remove('hidden');

  preview.innerHTML = `
    <div class="field">
      <span>Your recording</span>
      <audio controls preload="metadata" src="${recordedUrl}"></audio>
    </div>
  `;
}


/* =========================================================
   TIMER
   ========================================================= */

function startTimer() {
  clearInterval(timer);

  timer = setInterval(() => {
    seconds--;

    if ($('#timer')) $('#timer').textContent = pad2(Math.max(seconds, 0));

    $('#timerWrap')?.classList.toggle('urgent', seconds <= 5);

    if (seconds <= 0) {
      clearInterval(timer);
      timer = null;
      stopRecording(true);
    }
  }, 1000);
}


/* =========================================================
   ROUND RESET
   ========================================================= */

function resetRound() {
  clearInterval(timer);
  timer = null;

  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    try { mediaRecorder.stop(); } catch {}
  }

  stopStream();

  recording = false;
  seconds = rules.seconds;

  if ($('#timer')) $('#timer').textContent = pad2(seconds);
  $('#timerWrap')?.classList.remove('urgent');

  $('#roundNo').textContent = pad2(round);
  $('#roundTotal').textContent = pad2(rules.rounds);
  $('#gsPlayers').textContent = rules.players;
  $('#promptRound').textContent = `Round ${round} of ${rules.rounds}`;

  $('#recordBtn')?.classList.remove('hidden');
  $('#submitBtn')?.classList.add('hidden');
  $('#captionPreview')?.classList.add('hidden');
  $('#wave')?.classList.remove('live');

  setMicState('var(--live)', 'Microphone ready');

  if ($('#captionPreview')) $('#captionPreview').innerHTML = '';

  recordedChunks = [];
  recordedBlob = null;

  if (recordedUrl) {
    URL.revokeObjectURL(recordedUrl);
    recordedUrl = null;
  }

  if ($('#wave')) {
    $('#wave').innerHTML = Array.from(
      { length: 30 },
      (_, i) => `<i style="
        --h:${8 + Math.random() * 58}px;
        animation-delay:${i * -0.035}s
      "></i>`
    ).join('');
  }
}


/* =========================================================
   RECORD / SUBMIT
   ========================================================= */

$('#recordBtn')?.addEventListener('click', startRecording);

$('#submitBtn')?.addEventListener('click', () => {
  stopRecording(false);
  setTimeout(() => submitCaption(), 400);
});

function submitCaption() {
  if (!recordedBlob || !recordedUrl) {
    toast('Record a caption first.');
    return;
  }

  toast('Voice locked • anonymous submission created');

  setTimeout(() => {
    buildVotes(recordedUrl);
    go('vote');

    mascotSay(
      `${submissionCount()} captions. One winner. Do not embarrass yourself.`
    );
  }, 500);
}


/* =========================================================
   PLAYER RECORDING
   ========================================================= */

function playPlayerRecording(url, button) {
  if (!url) return;

  $$('.player-audio').forEach((audio) => {
    try {
      audio.pause();
      audio.currentTime = 0;
    } catch {}
  });

  $$('.audio.playing').forEach((btn) => {
    btn.classList.remove('playing');
    btn.textContent = '▶';
  });

  let audio = document.querySelector(
    `.player-audio[data-url="${CSS.escape(url)}"]`
  );

  if (!audio) {
    audio = document.createElement('audio');
    audio.className = 'player-audio';
    audio.preload = 'auto';
    audio.src = url;
    audio.dataset.url = url;
    audio.style.display = 'none';
    document.body.appendChild(audio);
  }

  audio.currentTime = 0;

  audio.play().catch(() => {
    toast('Could not play this recording.');
  });

  if (button) {
    button.classList.add('playing');
    button.textContent = '■';

    audio.addEventListener('ended', () => {
      button.classList.remove('playing');
      button.textContent = '▶';
    }, { once: true });
  }
}


/* =========================================================
   VOTING
   ========================================================= */

const FAKE_CAPTIONS = [
  'BRO WHAT IS HE LOOKING AT',
  'he just remembered he left the oven on',
  'me when someone says powerscaling',
  'that banana is judging my life choices',
  'nobody expected the fourth wall to move',
  'this is fine. everything is fine.',
  'the WiFi died mid-sentence and so did I',
  'POV: you opened the fridge again'
];

function buildVotes(myRecordingUrl) {
  const total = submissionCount();

  const submissions = Array.from({ length: total - 1 }, (_, i) => ({
    text: FAKE_CAPTIONS[i % FAKE_CAPTIONS.length],
    audio: null
  }));

  if (rules.anonymous !== false || total > 1) {
    submissions.push({
      text: 'YOUR ANONYMOUS RECORDING',
      audio: rules.playback ? myRecordingUrl : null,
      mine: true
    });
  }

  for (let i = submissions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [submissions[i], submissions[j]] = [submissions[j], submissions[i]];
  }

  // remember where the player's own caption landed after the shuffle
  playerSlot = submissions.findIndex((s) => s.mine);

  const list = $('#submissionList');
  if (!list) return;

  list.innerHTML = submissions.map((submission, index) => {
    const audioButton = submission.audio
      ? `<button class="audio"
           data-player-audio="${encodeURIComponent(submission.audio)}"
           aria-label="Play anonymous recording">▶</button>`
      : `<button class="audio"
           data-text="${encodeURIComponent(submission.text)}"
           aria-label="Play caption">▶</button>`;

    return `
      <div class="submission" style="animation-delay:${index * 0.07}s">
        <div class="num">${pad2(index + 1)}</div>
        <div>
          ${audioButton}
          <span class="sub-text">${escapeHtml(submission.text)}</span>
          <div class="sub-meta">${
            rules.anonymous ? 'Anonymous' : 'Named'
          } • Original recording</div>
        </div>
        <button class="vote" data-vote="${index}">Vote</button>
      </div>
    `;
  }).join('');

  $$('.audio').forEach((button) => {
    button.addEventListener('click', () => {
      const playerAudio = button.dataset.playerAudio;

      if (playerAudio) {
        playPlayerRecording(decodeURIComponent(playerAudio), button);
        return;
      }

      mascotSay(decodeURIComponent(button.dataset.text || ''));
    });
  });

  $$('.vote').forEach((button) => {
    button.addEventListener('click', () => {
      $$('.vote').forEach((voteButton) => {
        voteButton.disabled = true;
      });

      button.classList.add('selected');

      // you backed your own caption if it is the one you just made
      if (button.dataset.vote === String(playerSlot)) {
        score += 1;
        toast('Vote locked in • your pick was on the money');
      } else {
        toast('Vote locked in');
      }

      setTimeout(() => {
        const winner =
          list.querySelectorAll('.sub-text')[button.dataset.vote];

        if ($('#winnerText') && winner) {
          $('#winnerText').textContent = `"${winner.textContent}"`;
        }

        go('winner');
        mascotSay('That one won. Congratulations.');
      }, 500);
    });
  });
}


/* =========================================================
   MODE SELECT UI
   ========================================================= */

function syncRuleInputs() {
  if ($('#ruleRounds')) $('#ruleRounds').textContent = rules.rounds;
  if ($('#ruleSeconds')) $('#ruleSeconds').textContent = rules.seconds;
  if ($('#rulePlayers')) $('#rulePlayers').textContent = rules.players;
  if ($('#ruleChaos')) $('#ruleChaos').value = rules.chaos;
  if ($('#ruleChaosValue')) $('#ruleChaosValue').textContent = rules.chaos;

  $('#ruleAnon')?.classList.toggle('on', rules.anonymous);
  $('#rulePlayback')?.classList.toggle('on', rules.playback);

  // the custom panel only exists in custom mode
  const block = $('#customBlock');
  if (block) block.hidden = rules.mode !== 'custom';
}

function syncSummary() {
  const diff = DIFFICULTIES[rules.difficulty];
  const mode = MODES[rules.mode];

  if ($('#diffSummary')) {
    $('#diffSummary').textContent =
      `Rounds ${diff.rounds} · ${diff.seconds}s · ${diff.players} players · Chaos ${diff.chaos}`;
  }

  if ($('#startSummary')) {
    $('#startSummary').textContent =
      `${diff.label} · ${mode.label} · ${rules.rounds} rounds · ${rules.seconds}s · ${rules.players} players · Chaos ${rules.chaos}`;
  }

  if ($('#gsDiff')) $('#gsDiff').textContent = diff.label;
  if ($('#gsMode')) $('#gsMode').textContent = mode.label;

  syncRuleInputs();
}

function setDifficulty(key, { speak = true } = {}) {
  if (!DIFFICULTIES[key]) return;

  rules.difficulty = key;

  // every surface that shows the difficulty, not just the one clicked
  $$('.diff-card').forEach((card) => {
    card.classList.toggle('selected', card.dataset.diff === key);
  });

  applyRules();
  syncSummary();
  paintPlayRule();

  if (speak) mascotSay(`${DIFFICULTIES[key].label} it is. Good luck.`);
}

function setMode(key) {
  if (!MODES[key]) return;

  rules.mode = key;

  $$('.gmode').forEach((card) => {
    card.classList.toggle('selected', card.dataset.mode === key);
  });

  applyRules();
  syncSummary();
  paintPlayRule();
}

$$('.diff-card').forEach((card) => {
  card.addEventListener('click', () => {
    setDifficulty(card.dataset.diff);
  });
});

$$('.gmode').forEach((card) => {
  card.addEventListener('click', () => {
    setMode(card.dataset.mode);
  });
});

$$('.stepper').forEach((stepper) => {
  stepper.addEventListener('click', (event) => {
    const step = event.target.closest('.step');
    if (!step) return;

    const key = stepper.dataset.rule;
    const limit = LIMITS[key];

    rules[key] = clamp(
      rules[key] + Number(step.dataset.dir) * limit.step,
      limit.min,
      limit.max
    );

    syncSummary();
  });
});

$('#ruleChaos')?.addEventListener('input', (event) => {
  rules.chaos = Number(event.target.value);
  syncSummary();
});

$('#ruleAnon')?.addEventListener('click', () => {
  rules.anonymous = !rules.anonymous;
  syncRuleInputs();
});

$('#rulePlayback')?.addEventListener('click', () => {
  rules.playback = !rules.playback;
  syncRuleInputs();
});

$('#startRound')?.addEventListener('click', () => {
  applyRules();

  round = 1;
  score = 0;

  // new salt each match so stored prints cannot be joined across rounds
  if (typeof resetVoiceprints === 'function') resetVoiceprints();

  syncSummary();
  go('play');

  mascotSay(
    `Round one. ${rules.seconds} seconds. ${
      rules.chaos > 60 ? 'No mercy.' : 'Do not embarrass yourself.'
    }`
  );
});

$('#nextRound')?.addEventListener('click', () => {
  round++;

  if (round > rules.rounds) {
    showSummary();
    mascotSay('That is the whole match. You survived.');
    return;
  }

  go('play');
  mascotSay(`Round ${round}. Keep going.`);
});

$('#quitRound')?.addEventListener('click', () => {
  clearInterval(timer);
  timer = null;

  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    try { mediaRecorder.stop(); } catch {}
  }

  stopStream();
  recording = false;

  if (round > 1) {
    showSummary();
  } else {
    go('hub');
  }

  mascotSay('Match abandoned. No judgement.');
});


/* =========================================================
   PACK STUDIO
   ========================================================= */

function loadPacks() {
  try {
    const list = JSON.parse(localStorage.getItem(PACKS_KEY) || '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function savePacks(list) {
  localStorage.setItem(PACKS_KEY, JSON.stringify(list.slice(0, 30)));
}

$('#publishPack')?.addEventListener('click', () => {
  const name = $('#packName')?.value.trim() || 'Untitled Pack';
  const description = $('#packDescription')?.value.trim() || '';

  const list = loadPacks();

  list.unshift({
    id: `${Date.now()}`,
    name,
    description,
    plays: 0,
    images: $$('#packThumbs .thumb').length,
    at: Date.now()
  });

  savePacks(list);

  // the profile badge counter follows the real list
  if (typeof profile !== 'undefined') {
    profile.packs = list.length;
    saveProfile();
  }

  // a draft that has been published is no longer a draft
  localStorage.removeItem('cc-draft');

  toast('PACK PUBLISHED');

  setTimeout(() => go('mypacks'), 650);

  mascotSay('Your pack is live.');
});

/* the studio's image tray is real, so a published pack knows how many
   images it carries. Files cannot be read from a plain input without a
   file dialog, so each click stands in a generated card - enough for the
   count to mean something. */
const PACK_ART = [
  'WHAT.', '◕‿◕', 'NO.', '¯\\_(ツ)_/¯', 'SUS', '???', 'LOL', 'o_O',
  'BRUH', 'cat.jpg', 'erm', 'yep.', '!?!', '>:3', 'bruh', '¯\\_(ツ)_/¯'
];

function paintPackThumbs() {
  const count = $('#packCount');
  if (count) {
    const n = $$('#packThumbs .thumb').length;
    count.textContent = String(n);
  }
}

$('#packUpload')?.addEventListener('click', () => {
  const tray = $('#packThumbs');
  if (!tray) return;

  if ($$('#packThumbs .thumb').length >= 24) {
    toast('That is a big pack. Twenty four is plenty.');
    return;
  }

  const art = PACK_ART[$$('#packThumbs .thumb').length % PACK_ART.length];
  const index = $$('#packThumbs .thumb').length;

  const thumb = document.createElement('div');
  thumb.className = `thumb art-${(index % 4) + 1}`;
  thumb.innerHTML =
    `<span>${escapeHtml(art)}</span><button class="thumb-x" type="button">×</button>`;

  tray.appendChild(thumb);
  paintPackThumbs();
});

document.addEventListener('click', (event) => {
  const remove = event.target.closest('.thumb-x');
  if (!remove) return;

  remove.closest('.thumb')?.remove();
  paintPackThumbs();
});

/* the library is drawn from storage, not from markup */
function renderMyPacks() {
  const list = $('#myPackList');
  if (!list) return;

  const packs = loadPacks();

  if (!packs.length) {
    list.innerHTML = `
      <div class="device-empty">
        Nothing published yet. Open Pack Studio and ship one.
      </div>
    `;
    return;
  }

  list.innerHTML = packs.map((pack, i) => `
    <div class="lib-row panel">
      <div class="lib-art art-${(i % 4) + 1}">${escapeHtml(pack.name.slice(0, 2))}</div>
      <div class="lib-info">
        <b>${escapeHtml(pack.name)}</b>
        <small>
          Published ${escapeHtml(timeAgo(pack.at))} ·
          ${Number(pack.plays || 0)} plays ·
          ${Number(pack.images || 0)} images
        </small>
      </div>
      <span class="badge badge-live">Live</span>
      <button class="btn btn-ghost btn-sm"
        data-unpublish="${escapeHtml(pack.id)}" type="button">
        <span>Remove</span>
      </button>
    </div>
  `).join('');
}

document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-unpublish]');
  if (!button) return;

  const id = button.dataset.unpublish;

  savePacks(loadPacks().filter((pack) => String(pack.id) !== id));

  if (typeof profile !== 'undefined') {
    profile.packs = loadPacks().length;
    saveProfile();
  }

  renderMyPacks();

  toast('Pack removed from your library.');
});

$('#saveDraft')?.addEventListener('click', () => {
  localStorage.setItem('cc-draft', $('#packName')?.value || 'Untitled Pack');

  toast('Draft saved locally.');
  mascotSay('Draft saved.');
});


/* =========================================================
   GUIDE
   ========================================================= */

$('#tutorialNext')?.addEventListener('click', () => {
  const lines = [
    'See an image. Easy.',
    'You get a countdown. That is the whole timer.',
    'I play the original recordings. No fake voices.',
    'Then everyone votes.',
    'Highest score wins.'
  ];

  const button = $('#tutorialNext');

  let number = Number(button.dataset.n || 0) + 1;
  button.dataset.n = number;

  const line = lines[Math.min(number - 1, lines.length - 1)];

  if ($('#tutorialLine')) $('#tutorialLine').textContent = line;

  mascotSay(line);
});


/* =========================================================
   VOICY VOICE TOGGLE
   ========================================================= */

$('#ttsButton')?.addEventListener('click', () => {
  mascotVoice = !mascotVoice;

  if ($('#ttsState')) {
    $('#ttsState').textContent = mascotVoice ? 'On' : 'Off';
  }

  if (!mascotVoice) stopMascotAudio();

  toast(mascotVoice ? 'Voicy voice on' : 'Voicy voice off');
});


/* =========================================================
   SETTINGS MODAL
   ========================================================= */

// the Settings button now opens the settings page - it is bound in
// initUnifiedSettings() further down


/* =========================================================
   ACCOUNT / LOGIN
   Twitch and Gmail are UI only for now. Guest sign-in is real
   but local - it just writes to localStorage.
   ========================================================= */

(function initAccount() {

  const button = $('#loginBtn');
  const pop = $('#loginPop');

  if (!button || !pop) return;

  function closePop() {
    pop.classList.remove('open');
  }

  // signed in means "open my profile"; not signed in means
  // "show me how to sign in". isAccountLinked() reads the real state
  // rather than the footer's text, which used to always read as signed in.
  button.addEventListener('click', (event) => {
    event.stopPropagation();

    if (isAccountLinked()) {
      go('profile');
      return;
    }

    pop.classList.toggle('open');
  });

  document.addEventListener('click', (event) => {
    if (!$('#account')?.contains(event.target)) closePop();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closePop();
  });

  const notWired = (provider) => {
    closePop();
    toast(`${provider} sign-in is not connected yet.`);
  };

  $('#loginTwitch')?.addEventListener('click', () => notWired('Twitch'));
  $('#loginGoogle')?.addEventListener('click', () => notWired('Gmail'));

  function showSignedIn() {
    // paintAccountChips owns this markup, and it reads `profile`, so it
    // must only run once the whole script has been evaluated.
    if (document.readyState === 'loading') return;

    paintAccountChips();
  }

  $('#loginGuest')?.addEventListener('click', () => {
    const name = localStorage.getItem('cc-guest') || 'Guest';

    localStorage.setItem('cc-guest', name);

    showSignedIn(name);
    closePop();

    if (typeof saveProfile === 'function') saveProfile();

    toast(`Playing as ${name}`);
  });

  // nothing to paint here - the startup hook calls paintAccountChips once
  // the profile module has been evaluated

})();


/* =========================================================
   MODALS
   ========================================================= */

['#creditsModal'].forEach((selector) => {
  const modal = $(selector);
  if (!modal) return;

  $$('[data-close]', modal).forEach((element) => {
    element.addEventListener('click', () => {
      modal.classList.remove('open');
      modal.setAttribute('aria-hidden', 'true');
    });
  });
});

// Credits lives on the hub board now that the top bar is gone
$('#creditsRow')?.addEventListener('click', () => {
  $('#creditsModal')?.classList.add('open');
});

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;

  $('#creditsModal')?.classList.remove('open');
});


/* =========================================================
   DISCORD PROFILE
   ========================================================= */

// the last Discord user we were told about, or null while unlinked.
// Tested with === null rather than by sniffing the preload bridge,
// because the bridge always exposes onDiscordUser as a function.
let discordUser = null;

// has this player locked in an identity? a guest sign-in, a linked
// Discord account, or simply having named themselves in the editor.
// read from storage rather than from `profile`, which is declared much
// further down and would be in its temporal dead zone this early.
function isAccountLinked() {
  if (localStorage.getItem('cc-guest')) return true;
  if (discordUser) return true;

  try {
    const saved = JSON.parse(localStorage.getItem('cc-profile') || 'null');
    // 'Guest' is the untouched default, so it does not count as naming
    // yourself. DEFAULT_PROFILE is not referenced here on purpose - it is
    // declared far below this function.
    return Boolean(saved?.name && saved.name !== 'Guest');
  } catch {
    return false;
  }
}

function setDiscordProfile(user) {
  discordUser = user || null;

  const avatar = $('#discordAvatar');
  const displayName = $('#discordDisplayName');
  const username = $('#discordUsername');
  const connectButton = $('#connectDiscordBtn');

  if (!avatar || !displayName || !username || !connectButton) return;

  if (!user) {
    // no Discord, but a guest sign-in still counts as a local identity
    if (isAccountLinked()) {
      avatar.src = avatarSource();
      displayName.textContent = profile.name;
      username.textContent = profile.handle;
    } else {
      avatar.src = '../assets/Mascot.png';
      displayName.textContent = 'Not connected';
      username.textContent = 'Link Discord';
    }

    connectButton.textContent = 'Connect';
    connectButton.disabled = false;
    return;
  }

  displayName.textContent =
    user.global_name || user.username || 'Discord User';

  username.textContent = user.username
    ? `@${user.username}`
    : 'Discord account';

  if (user.avatar_url) avatar.src = user.avatar_url;

  connectButton.textContent = 'Connected';
  connectButton.disabled = true;
}

$('#connectDiscordBtn')?.addEventListener('click', async () => {
  const button = $('#connectDiscordBtn');

  try {
    button.disabled = true;
    button.textContent = 'Connecting…';

    const result = await window.captionChaos.connectDiscord();

    if (!result || !result.success) {
      throw new Error(
        result?.error || 'Could not start Discord authorization.'
      );
    }
  } catch (error) {
    console.error('[Caption Chaos] Discord connection failed:', error);

    button.disabled = false;
    button.textContent = 'Connect';

    toast('Discord connection could not be started.');
  }
});

if (window.captionChaos?.onDiscordUser) {
  window.captionChaos.onDiscordUser((user) => {
    setDiscordProfile(user);
    toast(`Connected as ${user.global_name || user.username}`);
  });
}

if (window.captionChaos?.onDiscordError) {
  window.captionChaos.onDiscordError((message) => {
    console.error('[Caption Chaos] Discord OAuth error:', message);

    const button = $('#connectDiscordBtn');

    if (button) {
      button.disabled = false;
      button.textContent = 'Connect';
    }

    toast('Discord authorization failed.');
  });
}


/* =========================================================
   BOOT SEQUENCE
   A stepped loader: the bar creeps toward each target rather
   than jumping, the checklist ticks off in order, the percent
   counter climbs, and a tip rotates underneath.
   ========================================================= */

const BOOT_STEPS = [
  { at: 18, label: 'Waking up Voicy' },
  { at: 42, label: 'Loading pack library' },
  { at: 68, label: 'Tuning microphones' },
  { at: 90, label: 'Warming the room' },
  { at: 100, label: 'Ready' }
];

const BOOT_TIPS = [
  'Ten seconds is not long. Say it anyway.',
  'Anonymous submissions are on by default. Blame is optional.',
  'Nightmare gives you seven seconds and eight other people.',
  'Custom mode lets you write the rules. Nobody will stop you.',
  'Your real voice is the caption. There is no filter on it.',
  'The room decides. Try not to take it personally.'
];

(function initBootSparks() {

  const field = $('#bootSparks');
  if (!field) return;

  const COUNT = 26;

  for (let i = 0; i < COUNT; i++) {
    const spark = document.createElement('i');

    const size = 3 + Math.random() * 7;

    spark.style.width = `${size}px`;
    spark.style.height = `${size}px`;
    spark.style.left = `${Math.random() * 100}%`;
    spark.style.top = `${20 + Math.random() * 85}%`;
    spark.style.animationDuration = `${5 + Math.random() * 7}s`;
    spark.style.animationDelay = `${-Math.random() * 10}s`;

    field.appendChild(spark);
  }

})();

(async function boot() {

  const bootScreen = $('#boot');
  const bar = $('#bootBar');
  const status = $('#bootStatus');
  const percent = $('#bootPercent');
  const steps = $('#bootSteps');
  const tipText = $('#bootTipText');
  const enter = $('#bootEnter');
  const hint = $('#bootHint');

  applyRules();
  syncSummary();

  if (!bootScreen) {
    $('#app')?.classList.add('live');
    return;
  }

  const stepItems = steps ? [...steps.querySelectorAll('li')] : [];

  // walk the bar up to a target, easing the last stretch so it never
  // looks like it is fighting the finish line
  function creepTo(target, duration) {
    if (!bar) return Promise.resolve();

    const from = parseFloat(bar.style.width) || 0;
    const started = performance.now();

    return new Promise((resolve) => {
      function frame(now) {
        const t = Math.min(1, (now - started) / duration);
        const eased = 1 - Math.pow(1 - t, 2.2);

        const value = from + (target - from) * eased;
        const rounded = Math.round(value);

        bar.style.width = `${rounded}%`;

        if (percent) percent.textContent = `${rounded}%`;

        if (t < 1) {
          requestAnimationFrame(frame);
        } else {
          bar.style.width = `${target}%`;
          if (percent) percent.textContent = `${target}%`;
          resolve();
        }
      }

      requestAnimationFrame(frame);
    });
  }

  // tips rotate while the bar fills
  let tipIndex = 0;

  const tipTimer = tipText
    ? setInterval(() => {
        tipIndex = (tipIndex + 1) % BOOT_TIPS.length;
        tipText.textContent = BOOT_TIPS[tipIndex];

        // retrigger the little entry animation
        tipText.style.animation = 'none';
        void tipText.offsetWidth;
        tipText.style.animation = '';
      }, 2600)
    : null;

  await wait(340);

  for (let i = 0; i < BOOT_STEPS.length; i++) {
    const step = BOOT_STEPS[i];

    if (status) status.textContent = step.label;

    stepItems.forEach((item, index) => {
      item.classList.toggle('active', index === i);
      if (index < i) item.classList.add('done');
    });

    await creepTo(step.at, step.at === 100 ? 520 : 700);
  }

  stepItems.forEach((item) => {
    item.classList.remove('active');
    item.classList.add('done');
  });

  if (status) status.textContent = 'Ready';

  if (tipTimer) clearInterval(tipTimer);

  enter?.classList.add('ready');
  hint?.classList.add('show');

  let entered = false;

  async function enterApp() {
    if (entered) return;
    entered = true;

    bootScreen.classList.add('dismissed');
    $('#app')?.classList.add('live');
    $('#app')?.setAttribute('aria-hidden', 'false');

    setTimeout(() => bootScreen.remove(), 850);

    setTimeout(() => {
      mascotSay('Welcome to Caption Chaos. I am Voicy.');
    }, 650);
  }

  enter?.addEventListener('click', enterApp);

  document.addEventListener('keydown', function onKey(event) {
    if (event.code === 'Space' || event.code === 'Enter') {
      event.preventDefault();
      document.removeEventListener('keydown', onKey);
      enterApp();
    }
  });

})();


/* =========================================================
   CLEANUP
   ========================================================= */

window.addEventListener('beforeunload', () => {
  clearInterval(timer);
  clearInterval(typeTimer);

  stopMascotAudio();

  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    try { mediaRecorder.stop(); } catch {}
  }

  stopStream();

  if (recordedUrl) URL.revokeObjectURL(recordedUrl);

  stopEverything();
});


/* =========================================================
   STARTUP
   ========================================================= */

window.addEventListener('load', () => {
  setDiscordProfile(null);
  resetRound();
  paintAccountChips();
  paintPlayRule();

  const guest = localStorage.getItem('cc-guest');
  if (guest && $('#footSub')) $('#footSub').textContent = 'Signed in as guest';
});


/* =========================================================
   AUDIO ENGINE
   One context, one stream, everything hangs off it: the live
   level meter, the device lists, the five second mic test and
   the speech to text recorder.
   ========================================================= */

const audio = {
  ctx: null,
  stream: null,
  source: null,
  analyser: null,
  gain: null,
  echo: null,
  data: null,

  monitoring: false,

  inputId: localStorage.getItem('cc-input') || '',
  outputId: localStorage.getItem('cc-output') || '',
  gainDb: Number(localStorage.getItem('cc-gain') || 0),
  gateDb: Number(localStorage.getItem('cc-gate') || -50),

  peak: 0,
  peakHold: 0,
  floor: -90,
  raf: null
};

const toDb = (rms) => (rms > 0 ? 20 * Math.log10(rms) : -Infinity);
const dbToGain = (db) => Math.pow(10, db / 20);

// dBFS onto 0..100, with -60 dBFS as the floor of the meter
const meterPct = (db) =>
  Math.max(0, Math.min(100, ((db + 60) / 60) * 100));

function ensureAudioContext() {
  if (!audio.ctx) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return null;

    audio.ctx = new AudioContext();

    // Chromium suspends until a real gesture
    const resume = () => {
      if (audio.ctx.state === 'suspended') {
        audio.ctx.resume().catch(() => {});
      }
    };

    window.addEventListener('pointerdown', resume, { once: true });
    window.addEventListener('keydown', resume, { once: true });
  }

  if (audio.ctx.state === 'suspended') {
    audio.ctx.resume().catch(() => {});
  }

  return audio.ctx;
}

function setMeter(pct, peakPct) {
  const fill = $('#vuFill');
  const peak = $('#vuPeak');

  if (fill) fill.style.width = `${pct}%`;

  if (peak) {
    peak.style.left = `${peakPct}%`;
    peak.style.opacity = peakPct > 1 ? '1' : '0';
  }
}

function drawScope(buffer) {
  const canvas = $('#scope');
  if (!canvas) return;

  const context = canvas.getContext('2d');
  const { width, height } = canvas;

  context.clearRect(0, 0, width, height);

  if (!buffer) return;

  context.strokeStyle = 'rgba(255,255,255,0.08)';
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(0, height / 2);
  context.lineTo(width, height / 2);
  context.stroke();

  context.beginPath();

  const step = Math.floor(buffer.length / width) || 1;

  for (let x = 0, i = 0; x < width; x++, i += step) {
    const v = (buffer[i] - 128) / 128;
    const y = height / 2 + v * (height / 2 - 6);

    if (x === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }

  context.strokeStyle = '#cbb0ff';
  context.lineWidth = 2;
  context.shadowColor = 'rgba(168,116,255,0.7)';
  context.shadowBlur = 10;
  context.stroke();
  context.shadowBlur = 0;
}

function drawMeter() {
  if (!audio.monitoring || !audio.analyser) return;

  audio.analyser.getByteTimeDomainData(audio.data);

  let sum = 0;
  for (let i = 0; i < audio.data.length; i++) {
    const v = (audio.data[i] - 128) / 128;
    sum += v * v;
  }

  const rms = Math.sqrt(sum / audio.data.length);
  const db = toDb(rms);

  // the floor creeps toward what it hears
  if (db > -60) {
    audio.floor = audio.floor * 0.995 + db * 0.005;
  }

  // the meter stays at zero below the gate so it reads honestly
  const pct = db > audio.gateDb ? meterPct(db) : 0;

  audio.peak = Math.max(audio.peak * 0.94, pct);
  if (pct >= audio.peak) audio.peakHold = performance.now();

  const held = performance.now() - audio.peakHold < 1200
    ? audio.peak
    : audio.peak * 0.97;

  setMeter(pct, held);

  // the mic test has its own small meter
  const testFill = $('#testVuFill');
  if (testFill) testFill.style.width = `${pct}%`;

  const fmt = (v) => (Number.isFinite(v) ? v.toFixed(1) : '-inf');

  const now = $('#dbNow');
  const peakDb = $('#dbPeak');
  const floorDb = $('#dbFloor');

  if (now) now.textContent = fmt(db);
  if (peakDb) {
    peakDb.textContent = fmt(
      20 * Math.log10(Math.max(audio.peak / 100, 0.0001) / 0.9)
    );
  }
  if (floorDb) floorDb.textContent = fmt(audio.floor);

  audio.raf = requestAnimationFrame(drawMeter);
}

async function startMonitor() {
  const context = ensureAudioContext();
  if (!context) return;

  const state = $('#meterState');

  try {
    stopMonitor();

    audio.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        ...(audio.inputId ? { deviceId: { exact: audio.inputId } } : {})
      }
    });

    audio.source = context.createMediaStreamSource(audio.stream);
    audio.analyser = context.createAnalyser();
    audio.analyser.fftSize = 2048;
    audio.analyser.smoothingTimeConstant = 0.75;

    audio.gain = context.createGain();
    audio.gain.gain.value = dbToGain(audio.gainDb);

    audio.source.connect(audio.analyser);
    audio.analyser.connect(audio.gain);

    // only reaches the speakers when the monitor switch is on
    audio.echo = context.createGain();
    audio.echo.gain.value =
      $('#monitorEcho')?.classList.contains('on') ? 1 : 0;

    audio.gain.connect(audio.echo);
    audio.echo.connect(context.destination);

    audio.data = new Uint8Array(audio.analyser.fftSize);
    audio.monitoring = true;

    if (state) {
      state.textContent = 'Monitoring';
      state.classList.add('live');
    }

    drawMeter();
  } catch (error) {
    console.error('Monitor error:', error);

    if (state) {
      state.textContent = 'Blocked';
      state.classList.remove('live');
    }

    toast('Microphone permission is required to monitor.');
  }
}

function stopMonitor() {
  audio.monitoring = false;

  cancelAnimationFrame(audio.raf);
  audio.raf = null;

  [
    ['source', audio.source],
    ['gain', audio.gain],
    ['echo', audio.echo],
    ['analyser', audio.analyser]
  ].forEach(([, node]) => {
    if (node) {
      try { node.disconnect(); } catch {}
    }
  });

  audio.source = null;
  audio.gain = null;
  audio.echo = null;
  audio.analyser = null;

  if (audio.stream) {
    audio.stream.getTracks().forEach((t) => t.stop());
    audio.stream = null;
  }

  const state = $('#meterState');
  if (state) {
    state.textContent = 'Idle';
    state.classList.remove('live');
  }

  setMeter(0, 0);

  const testFill = $('#testVuFill');
  if (testFill) testFill.style.width = '0%';
}

async function applyOutput(deviceId) {
  const context = ensureAudioContext();
  if (!context || typeof context.setSinkId !== 'function') return;

  try {
    await context.setSinkId(deviceId || '');
  } catch (error) {
    console.error('setSinkId failed:', error);
  }
}

async function listDevices() {
  if (!navigator.mediaDevices?.enumerateDevices) return [];

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    renderDevices(devices);
    return devices;
  } catch (error) {
    console.error('enumerateDevices failed:', error);
    return [];
  }
}

function renderDevices(devices) {
  const build = (list, selectedId, fallback) => {
    if (!list.length) {
      return `<div class="device-empty">No ${fallback} found</div>`;
    }

    return list.map((device, index) => {
      const name = device.label || `${fallback} ${index + 1}`;
      const on = device.deviceId === selectedId;

      return `<button class="device${on ? ' selected' : ''}" type="button"
        data-kind="${device.kind}" data-id="${escapeHtml(device.deviceId)}">
        <span class="device-dot"></span>
        <span class="device-name">${escapeHtml(name)}</span>
      </button>`;
    }).join('');
  };

  const inputList = $('#inputList');
  const outputList = $('#outputList');

  if (inputList) {
    inputList.innerHTML = build(
      devices.filter((d) => d.kind === 'audioinput'),
      audio.inputId,
      'Microphone'
    );
  }

  if (outputList) {
    outputList.innerHTML = build(
      devices.filter((d) => d.kind === 'audiooutput'),
      audio.outputId,
      'Speaker'
    );
  }

  $$('.device').forEach((button) => {
    button.addEventListener('click', () => {
      const { kind, id } = button.dataset;

      if (kind === 'audioinput') {
        audio.inputId = id;
        localStorage.setItem('cc-input', id);

        if (audio.monitoring) startMonitor();
      } else {
        audio.outputId = id;
        localStorage.setItem('cc-output', id);
        applyOutput(id);
      }

      listDevices();
    });
  });
}

/* everything that can be making noise, stopped in one go */
function stopEverything() {
  stopMonitor();
  stopStt();

  clearInterval(testTimer);
  testTimer = null;

  if (testRecorder && testRecorder.state !== 'inactive') {
    try { testRecorder.stop(); } catch {}
  }
  testRecorder = null;

  if (testStream) {
    testStream.getTracks().forEach((t) => t.stop());
    testStream = null;
  }

  testChunks = [];
}

/* gain, gate, monitor switch, rescan */
$('#rescanDevices')?.addEventListener('click', () => listDevices());

$('#micGain')?.addEventListener('input', (event) => {
  audio.gainDb = Number(event.target.value);
  localStorage.setItem('cc-gain', String(audio.gainDb));

  if ($('#gainValue')) {
    $('#gainValue').textContent = `${audio.gainDb} dB`;
  }

  if (audio.gain) audio.gain.gain.value = dbToGain(audio.gainDb);
});

$('#noiseGate')?.addEventListener('input', (event) => {
  audio.gateDb = Number(event.target.value);
  localStorage.setItem('cc-gate', String(audio.gateDb));

  if ($('#gateValue')) {
    $('#gateValue').textContent = `${audio.gateDb} dB`;
  }
});

$('#monitorEcho')?.addEventListener('click', (event) => {
  const on = event.currentTarget.classList.toggle('on');

  if (audio.echo) audio.echo.gain.value = on ? 1 : 0;

  if (on && !audio.monitoring) startMonitor();
});

if ($('#gainValue')) $('#gainValue').textContent = `${audio.gainDb} dB`;
if ($('#gateValue')) $('#gateValue').textContent = `${audio.gateDb} dB`;

// device labels only appear after permission is granted, so ask once
navigator.mediaDevices
  ?.getUserMedia({ audio: true })
  .then((stream) => {
    stream.getTracks().forEach((t) => t.stop());
    listDevices();
  })
  .catch(() => listDevices());



/* =========================================================
   SPEECH TO TEXT
   Two engines. The browser engine is Web Speech, which is the
   only one that needs no setup - but it hands your audio to a
   remote recogniser, which is exactly the thing the privacy
   block warns about. The endpoint engine posts a blob to a
   URL you control, so an on-device server is one field away.
   ========================================================= */

const STT = {
  engine: localStorage.getItem('cc-stt-engine') || 'browser',
  endpoint: localStorage.getItem('cc-stt-endpoint') || '',

  recognition: null,
  recorder: null,
  stream: null,
  chunks: [],
  timer: null,
  busy: false
};

function sttEngineLabel() {
  return STT.engine === 'browser' ? 'Browser (Web Speech)' : 'Custom endpoint';
}

// does this build actually have Web Speech?
function hasWebSpeech() {
  return Boolean(
    window.SpeechRecognition || window.webkitSpeechRecognition
  );
}

function paintSttStatus() {
  const pill = $('#sttStatus');
  if (!pill) return;

  if (STT.engine === 'browser') {
    if (hasWebSpeech()) {
      pill.textContent = 'Browser ready';
      pill.classList.add('live');
    } else {
      pill.textContent = 'Not available';
      pill.classList.remove('live');
    }
    return;
  }

  if (STT.endpoint) {
    pill.textContent = 'Endpoint set';
    pill.classList.add('live');
  } else {
    pill.textContent = 'Needs a URL';
    pill.classList.remove('live');
  }
}

function setSttText(value) {
  const box = $('#sttText');
  if (box) box.value = value;
}

function setSttLatency(value) {
  const el = $('#sttLatency');
  if (el) el.textContent = value || '';
}

function sttFail(message) {
  setSttLatency('');
  toast(message);
}

/* ---- browser engine ---- */

function sttListen() {
  if (STT.busy) return;

  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) {
    sttFail('This build has no Web Speech engine. Pick a custom endpoint.');
    return;
  }

  const context = ensureAudioContext();
  if (context) context.resume().catch(() => {});

  const recognition = new Recognition();

  recognition.lang = 'en-US';
  recognition.interimResults = true;
  recognition.continuous = false;

  const started = performance.now();
  let finalText = '';

  STT.busy = true;
  setSttLatency('listening…');

  recognition.onresult = (event) => {
    let interim = '';

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const chunk = event.results[i][0].transcript;
      if (event.results[i].isFinal) finalText += chunk;
      else interim += chunk;
    }

    setSttText((finalText + interim).trim());
  };

  recognition.onerror = (event) => {
    STT.busy = false;
    setSttLatency('');

    if (event.error === 'not-allowed') {
      sttFail('Microphone permission was refused.');
    } else if (event.error === 'network') {
      sttFail('The browser recogniser needs network access. Try a custom endpoint.');
    } else {
      sttFail(`Recogniser error: ${event.error}`);
    }
  };

  recognition.onend = () => {
    STT.busy = false;

    const seconds = ((performance.now() - started) / 1000).toFixed(1);

    if (finalText.trim()) {
      setSttLatency(`${seconds}s · browser engine · audio left the device`);
    } else {
      setSttLatency('');
    }
  };

  STT.recognition = recognition;

  try {
    recognition.start();
  } catch (error) {
    STT.busy = false;
    sttFail('Could not start the recogniser.');
  }
}

function sttStopListening() {
  try {
    STT.recognition?.stop();
  } catch {}
  STT.recognition = null;
  STT.busy = false;
}

/* ---- custom endpoint engine ---- */

/* Transcribe a recorded blob with whatever engine is configured.
   Returns { text, engine, detail } or { text: '', error }.

   The browser engine cannot do this: Web Speech only listens to the live
   stream, it has no way to read a finished recording. So a blob needs the
   custom endpoint, and the caller is told which one ran. */
async function transcribeBlob(blob) {
  if (!blob?.size) {
    return { text: '', error: 'nothing recorded' };
  }

  if (STT.engine === 'browser') {
    return {
      text: '',
      error:
        'The browser recogniser cannot transcribe a finished recording - it ' +
        'only listens live. Pick a custom endpoint in Settings to use the ' +
        'practice round, or just trust that the mic is working: the meter ' +
        'above is the real signal.'
    };
  }

  if (!STT.endpoint) {
    return {
      text: '',
      error:
        'No endpoint is set. Settings has one, and the browser engine needs ' +
        'network access.'
    };
  }

  const started = performance.now();

  try {
    const form = new FormData();
    form.append('file', blob, 'caption.webm');
    form.append('model', 'whisper-1');

    const response = await fetch(STT.endpoint, {
      method: 'POST',
      body: form
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();
    const seconds = ((performance.now() - started) / 1000).toFixed(1);

    return {
      text: data.text || data.transcript || '',
      engine: 'endpoint',
      detail: `${seconds}s · your audio went to ${hostOf(STT.endpoint)}`
    };
  } catch (error) {
    return { text: '', error: `Transcription failed: ${error.message}` };
  }
}

async function sttRecordThenPost() {
  if (STT.busy) return;

  if (!STT.endpoint) {
    sttFail('Add an endpoint URL first.');
    return;
  }

  STT.busy = true;
  setSttLatency('recording…');

  try {
    STT.stream = await navigator.mediaDevices.getUserMedia({
      audio: audio.inputId
        ? { deviceId: { exact: audio.inputId } }
        : true
    });

    STT.chunks = [];

    const mime = getRecordingMimeType();
    STT.recorder = mime
      ? new MediaRecorder(STT.stream, { mimeType: mime })
      : new MediaRecorder(STT.stream);

    STT.recorder.addEventListener('dataavailable', (e) => {
      if (e.data && e.data.size) STT.chunks.push(e.data);
    });

    const started = performance.now();

    STT.recorder.onstop = async () => {
      const blob = new Blob(STT.chunks, {
        type: STT.recorder.mimeType || 'audio/webm'
      });

      STT.chunks = [];
      STT.stream?.getTracks().forEach((t) => t.stop());
      STT.stream = null;

      setSttLatency('transcribing…');

      try {
        const form = new FormData();
        form.append('file', blob, 'caption.webm');
        form.append('model', 'whisper-1');

        const response = await fetch(STT.endpoint, {
          method: 'POST',
          body: form
        });

        const seconds = ((performance.now() - started) / 1000).toFixed(1);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        const text = data.text || data.transcript || '';

        setSttText(text);
        setSttLatency(
          `${seconds}s · endpoint engine · your audio went to ${hostOf(STT.endpoint)}`
        );

        if (text) guardAgainstVoiceprint(blob, text);
      } catch (error) {
        setSttLatency('');
        sttFail(`Transcription failed: ${error.message}`);
      }
    };

    STT.recorder.start();

    let left = 6;
    setSttLatency(`recording… ${left}`);

    STT.timer = setInterval(() => {
      left -= 1;
      if (left <= 0) {
        if (STT.recorder && STT.recorder.state !== 'inactive') {
          STT.recorder.stop();
        }
      } else {
        setSttLatency(`recording… ${left}`);
      }
    }, 1000);
  } catch (error) {
    STT.busy = false;
    setSttLatency('');
    sttFail('Microphone permission is required.');
  }
}

function hostOf(url) {
  try {
    return new URL(url).host;
  } catch {
    return 'your endpoint';
  }
}

function stopStt() {
  sttStopListening();

  clearInterval(STT.timer);
  STT.timer = null;

  if (STT.recorder && STT.recorder.state !== 'inactive') {
    STT.recorder.stop();
  }
  STT.recorder = null;

  if (STT.stream) {
    STT.stream.getTracks().forEach((t) => t.stop());
    STT.stream = null;
  }

  STT.busy = false;
  STT.chunks = [];
  setSttLatency('');
}


/* =========================================================
   VOICEPRINT GUARD
   The honest weakness in "anonymous": two captions from the
   same throat are recognisable by ear, so a player who talks
   the same way twice can be linked across rounds.

   This builds a coarse spectral fingerprint of each recording
   and compares it against the ones already in this round. It is
   a warning, not a guarantee - and the privacy panel says so.
   ========================================================= */

const VOICEPRINT = {
  // salt rotates per round so stored records cannot be joined up later
  salt: '',
  seen: []
};

function newVoiceprintSalt() {
  VOICEPRINT.salt = Math.random().toString(36).slice(2, 10);
  VOICEPRINT.seen = [];
}

function resetVoiceprints() {
  newVoiceprintSalt();
}

async function fingerprint(blob) {
  const context = ensureAudioContext();
  if (!context) return null;

  let buffer;

  try {
    buffer = await context.decodeAudioData(await blob.arrayBuffer());
  } catch {
    return null;
  }

  const channel = buffer.getChannelData(0);
  const bands = 12;
  const size = Math.floor(channel.length / bands) || 1;

  const vector = new Array(bands).fill(0);

  // per-band zero crossing rate, a cheap proxy for timbre
  for (let b = 0; b < bands; b++) {
    let crossings = 0;
    const start = b * size;
    const end = Math.min(start + size, channel.length);

    for (let i = start + 1; i < end; i++) {
      if ((channel[i - 1] < 0) !== (channel[i] < 0)) crossings++;
    }

    vector[b] = crossings / Math.max(1, end - start);
  }

  const norm = Math.hypot(...vector) || 1;

  return vector.map((v) => v / norm);
}

function similarity(a, b) {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return Math.max(0, Math.min(1, dot));
}

async function guardAgainstVoiceprint(blob, text) {
  if (!settings.anonGuard) return;

  const print = await fingerprint(blob);
  if (!print) return;

  let closest = 0;
  let match = null;

  for (const other of VOICEPRINT.seen) {
    const score = similarity(print, other.vector);
    if (score > closest) {
      closest = score;
      match = other;
    }
  }

  VOICEPRINT.seen.push({ vector: print, salt: VOICEPRINT.salt, text });

  if (closest > 0.93) {
    paintAnonStatus(
      true,
      'That sounds familiar',
      `Closest match this round scored ${(closest * 100).toFixed(0)}%` +
        (match?.text ? ` against "${match.text}"` : '') +
        '. Another player could link those two.'
    );

    toast('Voiceprint guard: that sounds like an earlier caption');
  }
}

/* the headline card in the privacy block */
function paintAnonStatus(warn, headline, detail) {
  const box = $('#anonStatus');
  const head = $('#anonHeadline');
  const note = $('#anonDetail');

  if (box) box.classList.toggle('warn', Boolean(warn));
  if (head) head.textContent = headline;
  if (note) note.textContent = detail;
}

function refreshAnonStatus() {
  if (!settings.anonTranscript) {
    paintAnonStatus(
      true,
      'Audio sharing is on',
      'Players receive your voice, not just the words'
    );
    return;
  }

  if (STT.engine === 'browser') {
    paintAnonStatus(
      true,
      'Transcript only, via the browser',
      'Audio goes to the remote recogniser before it becomes text'
    );
    return;
  }

  if (STT.endpoint) {
    const local = /localhost|127\.0\.0\.1/.test(STT.endpoint);

    paintAnonStatus(
      !local,
      local ? 'Transcript only, on device' : 'Transcript only, remote endpoint',
      local
        ? 'Your audio never leaves this machine'
        : `Your audio is posted to ${hostOf(STT.endpoint)}`
    );
    return;
  }

  paintAnonStatus(
    true,
    'Transcript only, engine not set',
    'Pick a speech to text engine to see what is sent'
  );
}


/* =========================================================
   CONTROLS
   A real rebind table. Keys are stored by KeyboardEvent.code
   so they stay on the same physical key across layouts.
   ========================================================= */

const ACTIONS = [
  { id: 'start',  label: 'Start recording',  hint: 'Begin your caption',        key: 'Space' },
  { id: 'submit', label: 'Submit caption',   hint: 'Send it to the room',      key: 'Enter' },
  { id: 'replay', label: 'Replay selection', hint: 'Hear the focused caption',  key: 'KeyR' },
  { id: 'vote',   label: 'Vote for a caption', hint: 'On the voting screen',     key: 'KeyV' },
  { id: 'next',   label: 'Next round',       hint: 'On the results screen',    key: 'KeyN' },
  { id: 'monitor', label: 'Toggle mic monitor', hint: 'Hear yourself live',     key: 'KeyM' },
  { id: 'transcribe', label: 'Transcribe caption', hint: 'Run the current recording', key: 'KeyT' },
  { id: 'skip',   label: 'Skip Voicy',       hint: 'Finish the line early',    key: 'Escape' }
];

const PRETTY = {
  Space: 'Space', Enter: 'Enter', Escape: 'Esc',
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→'
};

function keyName(code) {
  return PRETTY[code] || code.replace(/^Key/, '').replace(/^Digit/, '');
}

function loadKeys() {
  try {
    const saved = JSON.parse(localStorage.getItem('cc-keys') || '{}');

    ACTIONS.forEach((action) => {
      if (saved[action.id]) action.key = saved[action.id];
    });
  } catch {}
}

function saveKeys() {
  const map = {};

  ACTIONS.forEach((action) => {
    map[action.id] = action.key;
  });

  localStorage.setItem('cc-keys', JSON.stringify(map));
}

function actionFor(code) {
  return ACTIONS.find((action) => action.key === code);
}

function renderKeybinds() {
  const host = $('#keybinds');
  if (!host) return;

  host.innerHTML = ACTIONS.map((action) => `
    <div class="keybind">
      <div>
        <b>${escapeHtml(action.label)}</b>
        <small>${escapeHtml(action.hint)}</small>
      </div>
      <button class="keycap" data-action="${action.id}" type="button">
        ${escapeHtml(keyName(action.key))}
      </button>
    </div>
  `).join('');

  $$('.keycap').forEach((cap) => {
    cap.addEventListener('click', () => {
      cap.classList.add('listening');
      cap.textContent = 'Press a key…';
    });
  });
}

function isTyping(target) {
  if (!target) return false;

  const tag = target.tagName;

  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    target.isContentEditable
  );
}

let listeningAction = null;

document.addEventListener('keydown', (event) => {
  // rebinding takes priority over everything
  if (listeningAction) {
    event.preventDefault();
    event.stopPropagation();

    const action = ACTIONS.find((a) => a.id === listeningAction);

    if (action) {
      if (event.code !== 'Escape') action.key = event.code;
      saveKeys();
    }

    listeningAction = null;
    renderKeybinds();
    return;
  }

  if (isTyping(event.target)) return;

  const action = actionFor(event.code);
  if (!action) return;

  // let the boot screen keep its own space/enter handler
  if (document.getElementById('boot')) return;

  event.preventDefault();
  runAction(action.id);
});

function runAction(id) {
  switch (id) {
    case 'start':
      if (current.scene === 'play' && !$('#recordBtn')?.classList.contains('hidden')) {
        startRecording();
      } else if (current.scene === 'modes') {
        $('#startRound')?.click();
      }
      break;

    case 'submit':
      if (current.scene === 'play' && !$('#submitBtn')?.classList.contains('hidden')) {
        $('#submitBtn').click();
      } else if (current.scene === 'winner' || current.scene === 'summary') {
        $('#nextRound')?.click();
      }
      break;

    case 'replay':
      $('.audio.playing')?.click();
      break;

    case 'vote': {
      const votes = $$('.vote:not(:disabled)');
      if (votes.length) votes[0].click();
      break;
    }

    case 'next':
      $('#nextRound')?.click();
      break;

    case 'monitor':
      $('#monitorEcho')?.click();
      break;

    case 'transcribe':
      if (STT.engine === 'browser') sttListen();
      else sttRecordThenPost();
      break;

    case 'skip':
      if (!$('#dialogue').classList.contains('hidden')) {
        finishMascotDialogue();
        $('#dialogue').classList.add('hidden');
      } else if (current.scene !== 'hub') {
        go('hub');
      }
      break;
  }
}

function rebindFromClick(event) {
  const cap = event.target.closest('.keycap');
  if (!cap) return;

  event.preventDefault();
  listeningAction = cap.dataset.action;
}

document.addEventListener('click', rebindFromClick, true);

$('#resetKeys')?.addEventListener('click', () => {
  const defaults = {
    start: 'Space', submit: 'Enter', replay: 'KeyR', vote: 'KeyV',
    next: 'KeyN', monitor: 'KeyM', transcribe: 'KeyT', skip: 'Escape'
  };

  ACTIONS.forEach((action) => {
    action.key = defaults[action.id] || action.key;
  });

  saveKeys();
  renderKeybinds();
  toast('Keys reset to defaults.');
});

loadKeys();


/* =========================================================
   SETTINGS NAV - scroll spy
   ========================================================= */

(function initSettingsNav() {

  const links = $$('#settingsNav a');
  if (!links.length) return;

  links.forEach((link) => {
    link.addEventListener('click', (event) => {
      const target = $(link.getAttribute('href'));

      if (!target) return;

      event.preventDefault();

      target.scrollIntoView({ behavior: 'smooth', block: 'start' });

      links.forEach((other) => other.classList.toggle('on', other === link));
    });
  });

  const sections = links
    .map((link) => $(link.getAttribute('href')))
    .filter(Boolean);

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;

        links.forEach((link) => {
          link.classList.toggle(
            'on',
            link.getAttribute('href') === `#${entry.target.id}`
          );
        });
      });
    },
    { rootMargin: '-15% 0px -70% 0px', threshold: 0 }
  );

  sections.forEach((section) => observer.observe(section));

})();


/* =========================================================
   SETTINGS WIRING
   ========================================================= */

function initUnifiedSettings() {

  // speech to text engine picker
  const engineSelect = $('#sttEngine');
  const endpointField = $('#sttEndpointField');

  if (engineSelect) {
    engineSelect.innerHTML = `
      <option value="browser">Browser (Web Speech)</option>
      <option value="endpoint">Custom endpoint</option>
    `;

    engineSelect.value = STT.engine;

    engineSelect.addEventListener('change', () => {
      STT.engine = engineSelect.value;
      localStorage.setItem('cc-stt-engine', STT.engine);

      if (endpointField) {
        endpointField.classList.toggle(
          'hidden',
          STT.engine !== 'endpoint'
        );
      }

      paintSttStatus();
      refreshAnonStatus();
    });
  }

  if (endpointField) {
    endpointField.classList.toggle('hidden', STT.engine !== 'endpoint');
  }

  const endpointInput = $('#sttEndpoint');

  if (endpointInput) {
    endpointInput.value = STT.endpoint;

    endpointInput.addEventListener('input', () => {
      STT.endpoint = endpointInput.value.trim();
      localStorage.setItem('cc-stt-endpoint', STT.endpoint);

      paintSttStatus();
      refreshAnonStatus();
    });
  }

  $('#sttRecord')?.addEventListener('click', () => {
    if (STT.engine === 'browser') sttListen();
    else sttRecordThenPost();
  });

  $('#sttStop')?.addEventListener('click', stopStt);

  $('#sttCopy')?.addEventListener('click', async () => {
    const text = $('#sttText')?.value?.trim();

    if (!text) {
      toast('Nothing to copy yet.');
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      toast('Caption copied.');
    } catch {
      toast('Could not reach the clipboard.');
    }
  });

  $('#sttClear')?.addEventListener('click', () => {
    setSttText('');
    setSttLatency('');
  });

  // mic test: record five seconds, then play it straight back
  $('#micTestRecord')?.addEventListener('click', () => {
    if (testRecorder) {
      toast('Already recording.');
      return;
    }

    navigator.mediaDevices
      .getUserMedia({
        audio: audio.inputId
          ? { deviceId: { exact: audio.inputId } }
          : true
      })
      .then((stream) => {
        testStream = stream;
        testChunks = [];

        testRecorder = new MediaRecorder(stream);

        testRecorder.addEventListener('dataavailable', (e) => {
          if (e.data && e.data.size) testChunks.push(e.data);
        });

        testRecorder.addEventListener('stop', () => {
          const blob = new Blob(testChunks, {
            type: testRecorder.mimeType
          });

          const player = $('#abAudio');
          const wrap = $('#abWrap');
          const fill = $('#testVuFill');
          const label = $('#testVuLabel');

          if (player) player.src = URL.createObjectURL(blob);
          if (wrap) wrap.classList.remove('hidden');
          if (fill) fill.style.width = '0%';
          if (label) label.textContent = 'Recorded. Play it back below.';

          testStream.getTracks().forEach((t) => t.stop());
          testStream = null;
          testRecorder = null;

          clearInterval(testTimer);
          testTimer = null;

          // this is a real recording, so run the same guard the game uses
          guardAgainstVoiceprint(blob, 'mic test');
        });

        testRecorder.start();

        let left = 5;
        if (label) label.textContent = `Recording… ${left}`;

        testTimer = setInterval(() => {
          left -= 1;

          if (left <= 0) {
            if (testRecorder && testRecorder.state !== 'inactive') {
              testRecorder.stop();
            }
          } else if (label) {
            label.textContent = `Recording… ${left}`;
          }
        }, 1000);
      })
      .catch(() => toast('Microphone permission is required.'));
  });

  $('#micTestStop')?.addEventListener('click', stopEverything);

  paintSttStatus();
  refreshAnonStatus();
  renderKeybinds();
  newVoiceprintSalt();

  // top bar Settings now opens the page, not a modal
  $('#settingsBtn')?.addEventListener('click', () => go('settings'));
}

// The settings store is declared further down the file, so this has to
// wait until the whole script has run or it hits the temporal dead zone.
if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', initUnifiedSettings, { once: true });
} else {
  initUnifiedSettings();
}


/* =========================================================
   SETTINGS STORE
   One object, one apply function, one loop over [data-set].
   Everything on the settings page binds through this.
   ========================================================= */

const settings = {
  // audio
  voice: true,
  blips: true,
  uiSfx: true,
  master: 80,

  // gameplay
  defaultDiff: 'normal',
  defaultMode: 'classic',
  countdown: true,
  timerWarn: true,
  anonDefault: true,

  // interface
  calm: false,
  backdrop: true,
  particles: true,
  scale: 100,

  // privacy
  anonTranscript: true,
  anonRotate: true,
  anonGuard: true,
  anonWipe: true
};

function applySetting(key) {
  switch (key) {
    case 'voice':
      mascotVoice = settings.voice;
      if (!settings.voice) stopMascotAudio();
      if ($('#ttsState')) {
        $('#ttsState').textContent = settings.voice ? 'On' : 'Off';
      }
      break;

    case 'calm':
      calm = settings.calm;
      document.body.classList.toggle('calm', calm);
      window.rebuildParticles?.();
      break;

    case 'backdrop':
      document.querySelectorAll('.backdrop-media').forEach((el) => {
        el.style.display = settings.backdrop ? '' : 'none';
      });
      break;

    case 'particles':
      window.setParticleVisibility?.(settings.particles && !calm);
      break;

    case 'scale':
      document.documentElement.style.fontSize =
        `${(settings.scale / 100) * 16}px`;
      break;

    case 'defaultDiff':
      setDifficulty(settings.defaultDiff, { speak: false });
      break;

    case 'defaultMode':
      setMode(settings.defaultMode);
      break;

    case 'anonDefault':
      rules.anonymous = settings.anonDefault;
      syncRuleInputs();
      break;

    // privacy switches - the headline card has to follow them
    case 'anonTranscript':
    case 'anonRotate':
    case 'anonGuard':
    case 'anonWipe':
      refreshAnonStatus();
      break;
  }
}

(function initSettingsStore() {

  // difficulty / mode pickers
  const diffSelect = $('[data-set="defaultDiff"]');
  const modeSelect = $('[data-set="defaultMode"]');

  if (diffSelect) {
    diffSelect.innerHTML = Object.entries(DIFFICULTIES)
      .map(([key, d]) => `<option value="${key}">${d.label}</option>`)
      .join('');
  }

  if (modeSelect) {
    modeSelect.innerHTML = Object.entries(MODES)
      .map(([key, m]) => `<option value="${key}">${m.label}</option>`)
      .join('');
  }

  $$('[data-set]').forEach((control) => {
    const key = control.dataset.set;

    // paint the current value
    if (control.classList.contains('toggle')) {
      control.classList.toggle('on', Boolean(settings[key]));
    } else {
      control.value = settings[key];
    }

    const event =
      control.tagName === 'SELECT' || control.type === 'range'
        ? 'input'
        : 'click';

    control.addEventListener(event, () => {
      if (control.classList.contains('toggle')) {
        // flip it here - the old generic .toggle loop went away with the modal
        settings[key] = control.classList.toggle('on');
      } else if (control.type === 'range') {
        settings[key] = Number(control.value);
      } else {
        settings[key] = control.value;
      }

      applySetting(key);
    });
  });

  // push everything once on load
  Object.keys(settings).forEach(applySetting);
})();

$('#settingsDiscord')?.addEventListener('click', () => {
  go('hub');
  $('#connectDiscordBtn')?.click();
});

$('#resetSettings')?.addEventListener('click', () => {
  const defaults = {
    voice: true, blips: true, uiSfx: true, master: 80,
    defaultDiff: 'normal', defaultMode: 'classic',
    countdown: true, timerWarn: true, anonDefault: true,
    calm: false, backdrop: true, particles: true, scale: 100,
    anonTranscript: true, anonRotate: true, anonGuard: true, anonWipe: true
  };

  Object.assign(settings, defaults);

  $$('[data-set]').forEach((control) => {
    const key = control.dataset.set;

    if (control.classList.contains('toggle')) {
      control.classList.toggle('on', Boolean(settings[key]));
    } else {
      control.value = settings[key];
    }
  });

  Object.keys(settings).forEach(applySetting);

  toast('Settings reset to defaults.');
});



/* =========================================================
   LEADERBOARD
   Cosmetic - there is no backend yet.
   ========================================================= */

const BOARD = [
  ['moth.exe', 41, '92%', 18420],
  ['pixelmilk', 33, '88%', 15980],
  ['gffin', 28, '81%', 14110],
  ['nightbus', 22, '76%', 12040],
  ['glitchrat', 19, '71%', 10880],
  ['softlaunch', 14, '64%', 9310],
  ['You', 9, '60%', 7420],
  ['lowpolywolf', 7, '52%', 6180]
];

/* a small three-step stand. The winning block is filled and the rest are
   outlines, so the podium reads at a glance without a medal emoji. */
function rankGlyph(place) {
  const heights = { 1: [4, 10, 16], 2: [4, 16, 10], 3: [16, 10, 4] };

  const bars = heights[place] || [10, 10, 10];
  const top = Math.max(...bars);

  const rects = bars.map((h, i) => {
    const x = 4 + i * 6;
    const y = 20 - h;

    return `<rect x="${x}" y="${y}" width="4" height="${h}" rx="1.4"${
      h === top ? ' fill="currentColor" stroke="none"' : ''
    }/>`;
  }).join('');

  return `<svg class="rank-glyph" viewBox="0 0 22 22" fill="none"
    stroke="currentColor" stroke-width="1.7" stroke-linecap="round"
    stroke-linejoin="round" aria-hidden="true">${rects}</svg>`;
}

(function initLeaderboard() {

  const podium = $('#podium');
  const rows = $('#boardRows');

  if (!podium || !rows) return;

  const order = [1, 0, 2];

  podium.innerHTML = order.map((i) => {
    const [name, wins, rate, score] = BOARD[i];

    return `<div class="pod p${i === 0 ? 1 : i === 1 ? 2 : 3}">
      <div class="pod-avatar">${rankGlyph(order.indexOf(i) + 1)}</div>
      <b>${escapeHtml(name)}</b>
      <small>${wins} wins · ${rate}</small>
      <span class="pod-score">${score.toLocaleString('en-US')}</span>
    </div>`;
  }).join('');

  rows.innerHTML = BOARD.map(([name, wins, rate, score], i) => `
    <div class="board-row${name === 'You' ? ' me' : ''}">
      <span class="board-rank">${i + 1}</span>
      <span class="board-name">${escapeHtml(name)}</span>
      <span class="board-num">${wins}</span>
      <span class="board-num">${rate}</span>
      <span class="board-score">${score.toLocaleString('en-US')}</span>
    </div>
  `).join('');

})();


/* =========================================================
   PROFILE
   Local only. Nothing here is sent anywhere, which is also why
   the room never sees it - the privacy card in the sidebar
   says so out loud.

   Achievements live in here rather than on their own screen.
   ========================================================= */

const PROFILE_KEY = 'cc-profile';
const PACKS_KEY = 'cc-packs';

// banner and avatar accents
const ACCENTS = [
  ['#a06bff', '#3a1e6e'],
  ['#7a5cff', '#241a5e'],
  ['#c86bff', '#5e1e6e'],
  ['#6b8cff', '#1e2e6e'],
  ['#b06bff', '#3a1e4e'],
  ['#8c6bff', '#2e1e6e']
];

const AVATARS = [
  '../assets/Mascot.png',
  '../assets/Icons/play.png',
  '../assets/Icons/favorite.png',
  '../assets/Icons/trophy.png',
  '../assets/Icons/medal.png',
  '../assets/Icons/mic.png'
];

/* the one place that answers "which image is this player's avatar", so
   the top bar, the footer, the profile card and the swatches cannot
   drift apart once a picture of their own is uploaded */
function avatarSource() {
  return profile.pfp || AVATARS[profile.avatar % AVATARS.length];
}

/* lightens a hex colour by a factor, for the banner's lit side */
function shade(hex, factor) {
  const value = parseInt(String(hex).replace('#', ''), 16);
  if (Number.isNaN(value)) return hex;

  const r = Math.min(255, Math.round(((value >> 16) & 255) * factor));
  const g = Math.min(255, Math.round(((value >> 8) & 255) * factor));
  const b = Math.min(255, Math.round((value & 255) * factor));

  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

/* =========================================================
   PROFILE IMAGES
   ========================================================= */

/* =========================================================
   PROFILE IMAGES

   A picture of your own and a banner, chosen from disk.

   Both are resized in the browser before they are stored. That is
   not a nicety: localStorage caps out around 5MB for the whole
   origin, and a modern phone photo is several megabytes on its
   own. A 256px JPEG is about twenty kilobytes and a 1200x280 one
   is about a hundred, so the profile stays a few hundred KB no
   matter what is dropped in.

   The resize is a centre crop, so the picture fills the frame
   instead of being squashed.
   ========================================================= */

const PFP_SIZE = 256;
const BANNER_W = 1200;
const BANNER_H = 280;

/* pending uploads, held until Save so Cancel really cancels */
let staged = { pfp: null, banner: null };

/* centre-crop a loaded image into a canvas and hand back a data URL */
function cropToDataUrl(source, width, height) {
  return new Promise((resolve, reject) => {
    const image = new Image();

    image.onload = () => {
      try {
        // cover: scale so the short side fills, then take the middle
        const scale = Math.max(width / image.width, height / image.height);

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingQuality = 'high';

        const dw = image.width * scale;
        const dh = image.height * scale;

        ctx.drawImage(
          image,
          (width - dw) / 2,
          (height - dh) / 2,
          dw,
          dh
        );

        // webp keeps the bytes down; png is the fallback for the rare
        // case where a build cannot encode it
        let out = '';
        try {
          out = canvas.toDataURL('image/webp', 0.82);
        } catch {
          out = '';
        }

        // some builds return "data:," when the codec is missing
        if (!out || out.length < 64) {
          out = canvas.toDataURL('image/jpeg', 0.82);
        }

        resolve(out);
      } catch (error) {
        reject(error);
      }
    };

    image.onerror = () => reject(new Error('that file could not be read'));
    image.src = source;
  });
}

function openFilePicker() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/webp,image/gif';

    input.addEventListener('change', () => {
      const file = input.files?.[0];
      resolve(file || null);
    });

    // if the dialog is dismissed, change never fires, so nothing leaks
    input.click();
  });
}

async function importImage(width, height, label) {
  let file;

  try {
    file = await openFilePicker();
  } catch {
    toast('Could not open the file dialog.');
    return null;
  }

  if (!file) return null;

  // a data URL of a 12MP photo is ~20MB of text, which is enough to
  // lock every write to storage, so read it as a blob URL instead
  const url = URL.createObjectURL(file);

  try {
    const data = await cropToDataUrl(url, width, height);

    const kb = Math.round((data.length * 0.75) / 1024);
    if (kb > 900) {
      toast('That image came out too large. Try a smaller one.');
      return null;
    }

    toast(`${label} set · ${kb} KB on this machine`);
    return data;
  } catch (error) {
    toast(error.message || 'That image could not be read.');
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/* ---- previews inside the editor ---- */

function paintUploads() {
  const slots = [
    ['#pfpPreview', staged.pfp, profile.pfp],
    ['#bannerPreview', staged.banner, profile.banner]
  ];

  slots.forEach(([selector, pending, saved]) => {
    const box = $(selector);
    if (!box) return;

    const src = pending ?? saved ?? null;

    box.innerHTML = src
      ? `<img src="${src}" alt="">`
      : '<span class="upload-empty">None</span>';
  });

  $('#clearPfp')?.classList.toggle('hidden', !(staged.pfp ?? profile.pfp));
  $('#clearBanner')?.classList.toggle('hidden', !(staged.banner ?? profile.banner));
}

function resetStaged() {
  staged = { pfp: null, banner: null };
}

const DEFAULT_PROFILE = {
  name: 'Guest',
  handle: '@guest',
  bio: '',
  pronouns: '',
  region: '',
  title: 'Local player',
  accent: 0,
  avatar: 0,
  pfp: null,
  banner: null,
  matches: 0,
  wins: 0,
  captions: 0,
  best: 0,
  streak: 0,
  bestStreak: 0,
  packs: 0,
  nightOwl: false,
  byDifficulty: { easy: 0, normal: 0, hard: 0, nightmare: 0 },
  byMode: { classic: 0, blitz: 0, turn: 0, custom: 0 },
  history: []
};

const profile = { ...DEFAULT_PROFILE, history: [] };

function loadProfile() {
  try {
    const saved = JSON.parse(localStorage.getItem(PROFILE_KEY) || 'null');

    if (saved) {
      Object.keys(DEFAULT_PROFILE).forEach((key) => {
        if (saved[key] !== undefined) profile[key] = saved[key];
      });

      if (!Array.isArray(profile.history)) profile.history = [];

      // a blob written by an older build has no breakdown, so fill the
      // gaps instead of replacing the whole map
      profile.byDifficulty = {
        ...DEFAULT_PROFILE.byDifficulty,
        ...(saved.byDifficulty || {})
      };

      profile.byMode = {
        ...DEFAULT_PROFILE.byMode,
        ...(saved.byMode || {})
      };
    }
  } catch {
    // a corrupt blob should not stop the app booting
  }

  // a guest sign-in from an older session is still this player
  const guest = localStorage.getItem('cc-guest');
  if (guest && profile.name === DEFAULT_PROFILE.name) {
    profile.name = guest;
    if (profile.handle === DEFAULT_PROFILE.handle) {
      profile.handle = `@${guest.toLowerCase().replace(/\W+/g, '')}`;
    }
  }
}

function saveProfile() {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    return true;
  } catch (error) {
    // the usual cause is the origin's ~5MB quota, which an uploaded
    // banner plus a full match history can edge towards
    const full = error?.name === 'QuotaExceededError' ||
                 error?.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
                 error?.code === 22;

    if (full) {
      toast('Not enough local storage left. Clear a pack or a match and try again.');
    } else {
      toast('Could not save the profile on this machine.');
    }

    return false;
  }
}

/* xp is derived, so it can never drift from the stats */
function profileLevel() {
  return Math.max(1, 1 + Math.floor((profile.wins + profile.captions) / 5));
}

function profileXpPct() {
  const need = 5;
  const into = (profile.wins + profile.captions) % need;
  return Math.round((into / need) * 100);
}

function paintAccent() {
  const [from, to] = ACCENTS[profile.accent % ACCENTS.length];

  const banner = $('#profileBanner');
  if (banner && profile.banner) {
    // an uploaded banner wins, and the ::before sheen still lays over it
    banner.style.backgroundImage = `url("${profile.banner}")`;
    banner.style.backgroundSize = 'cover';
    banner.style.backgroundPosition = 'center';
  } else if (banner) {
    // three stops so the banner has a lit side and a shaded side rather
    // than reading as one flat wash
    banner.style.background =
      `linear-gradient(118deg, ${from} 0%, ${shade(to, 1.15)} 58%, #100a1f 100%)`;
  }

  const avatar = $('#profileAvatar');
  if (avatar) {
    avatar.style.boxShadow = `0 0 0 2px ${from}, 0 18px 40px -14px ${from}`;
  }
}

const SIGN_IN_GLYPH =
  '<svg viewBox="0 0 24 24">' +
  '<circle cx="12" cy="8.5" r="3.6"/>' +
  '<path d="M4.8 20a7.4 7.4 0 0 1 14.4 0"/></svg>';

function paintAccountChips() {
  const avatarSrc = avatarSource();
  const linked = isAccountLinked();

  // top bar button
  const loginBtn = $('#loginBtn');
  if (loginBtn) {
    loginBtn.innerHTML = linked
      ? `<span class="hud-ico"><img src="${avatarSrc}" alt=""></span>
         <span>${escapeHtml(profile.name)}</span>`
      : `<span class="hud-ico">${SIGN_IN_GLYPH}</span>
         <span>Sign in</span>`;

    loginBtn.classList.toggle('signed', linked);
  }

  // once you are linked in, the footer chip opens your profile and the
  // separate sign-in button has nothing left to do
  $('#account')?.classList.toggle('is-linked', linked);

  // the footer chip belongs to setDiscordProfile, which knows whether
  // Discord is linked. Ask it to repaint rather than writing over it.
  setDiscordProfile(discordUser);

  if ($('#accountName')) $('#accountName').textContent = profile.name;
  if ($('#accountState')) $('#accountState').textContent = profile.handle;
}

function renderProfile() {
  const set = (selector, value) => {
    const el = $(selector);
    if (el) el.textContent = value;
  };

  set('#profileName', profile.name);
  set('#profileHandle', profile.handle);
  set('#profilePronouns', profile.pronouns);
  set('#profileRegion', profile.region);
  set('#profileTitle', profile.title);
  set('#profileLevel', profileLevel());

  const xp = $('#profileXp');
  if (xp) xp.style.width = `${profileXpPct()}%`;

  const avatar = $('#profileAvatar img');
  if (avatar) avatar.src = avatarSource();

  const bio = $('#profileBio');
  if (bio) {
    bio.textContent = profile.bio || 'Nothing here yet.';
    bio.classList.toggle('empty', !profile.bio);
  }

  // the separator dot is drawn by CSS, so a blank pronouns or region
  // field simply drops out of the bar instead of leaving a stray dot
  renderStats();
  renderAchievements();
  renderFeed();

  paintAccent();
  paintAccountChips();
}

function renderStats() {
  const grid = $('#statGrid');
  if (!grid) return;

  const rate = profile.matches
    ? Math.round((profile.wins / profile.matches) * 100)
    : 0;

  const boxes = [
    [profile.matches, 'Matches'],
    [profile.wins, 'Wins'],
    [`${rate}%`, 'Win rate'],
    [profile.captions, 'Captions'],
    [profile.best.toLocaleString('en-US'), 'Best score'],
    [profileLevel(), 'Level']
  ];

  grid.innerHTML = boxes.map(([value, label]) => `
    <div class="stat-box">
      <b>${escapeHtml(String(value))}</b>
      <small>${escapeHtml(label)}</small>
    </div>
  `).join('');
}

/* =========================================================
   ACHIEVEMENTS

   Each entry is [name, description, icon, have, need]. Progress
   is measured against the profile counters, so the grid is a
   real readout rather than a decorative grid. The last entry,
   "Full house", is derived from the rest, so it can never be
   out of step with them.

   The glyphs are inline SVG rather than emoji: the packaged app
   has no colour emoji font, so every emoji rendered as a blank
   white circle.
   ========================================================= */

const ACHIEVEMENT_ICONS = {
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/>' +
       '<path d="M5.5 11.5a6.5 6.5 0 0 0 13 0"/>' +
       '<path d="M12 18v3"/>',

  eye: '<path d="M2.5 12S6 6 12 6s9.5 6 9.5 6-3.5 6-9.5 6S2.5 12 2.5 12Z"/>' +
       '<path d="M14.2 12a2.2 2.2 0 1 1-4.4 0 2.2 2.2 0 0 1 4.4 0Z"/>',

  crown: '<path d="M4 18h16"/>' +
         '<path d="M4 18 3 8l5 3.5L12 5l4 6.5L21 8l-1 10Z"/>',

  crosshair: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4"/>' +
             '<rect x="7.5" y="7.5" width="9" height="9" rx="2.5"/>',

  bolt: '<path d="M13.5 3 6 13h5l-1.5 8L17 11h-5l1.5-8Z"/>',

  chevron: '<path d="M4 7l5 5-5 5"/>' +
           '<path d="M13 7l5 5-5 5"/>',

  bars: '<rect x="4" y="13" width="4" height="7" rx="1.5"/>' +
        '<rect x="10" y="8" width="4" height="12" rx="1.5"/>' +
        '<rect x="16" y="4" width="4" height="16" rx="1.5"/>',

  check: '<rect x="3.5" y="3.5" width="17" height="17" rx="5"/>' +
         '<path d="M8 12.2l2.8 2.8L16 9.6"/>',

  moon: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z"/>',

  box: '<path d="M12 3 4 7v10l8 4 8-4V7l-8-4Z"/>' +
       '<path d="M4 7l8 4 8-4M12 11v10"/>',

  layers: '<path d="M12 3 3 8l9 5 9-5-9-5Z"/>' +
          '<path d="M3 13l9 5 9-5"/>',

  star: '<path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1.1 5.9L12 16.9l-5.3 2.8 1.1-5.9-4.3-4.1 5.9-.8L12 3.5Z"/>'
};

function badgeIcon(name) {
  return `<svg class="ach-glyph" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" stroke-width="1.9" stroke-linecap="round"
    stroke-linejoin="round" aria-hidden="true">${
      ACHIEVEMENT_ICONS[name] || ACHIEVEMENT_ICONS.star
    }</svg>`;
}

function achievementList() {
  return [
    ['First take', 'Record your first caption', 'mic',
      profile.captions, 1],

    ['Room reader', 'Play 50 captions', 'eye',
      profile.captions, 50],

    ['Room legend', 'Play 250 captions', 'crown',
      profile.captions, 250],

    ['Sharp shooter', 'Win a round on Hard', 'crosshair',
      profile.byDifficulty.hard, 1],

    ['Speed demon', 'Win a round on Nightmare', 'bolt',
      profile.byDifficulty.nightmare, 1],

    ['Blitzed', 'Win a round on Blitz', 'chevron',
      profile.byMode.blitz, 1],

    ['Ten in a row', 'Ten wins without losing', 'bars',
      profile.bestStreak, 10],

    ['Clean sheet', 'Win a whole match', 'check',
      profile.wins, 1],

    ['Night owl', 'Play between 1am and 5am', 'moon',
      profile.nightOwl ? 1 : 0, 1],

    ['Pack author', 'Publish your first pack', 'box',
      profile.packs, 1],

    ['Prolific', 'Publish ten packs', 'layers',
      profile.packs, 10]
  ];
}

function renderAchievements() {
  const grid = $('#achieveGrid');
  if (!grid) return;

  const list = achievementList();

  const unlocked = list.filter(([, , , have, need]) => have >= need).length;

  const summary = $('#achieveSummary');
  if (summary) {
    summary.textContent = `${unlocked} of ${list.length + 1} unlocked`;
  }

  // the completionist badge counts itself out of the total it depends on
  const cards = list.map(([name, desc, icon, have, need]) => {
    const done = have >= need;
    const pct = Math.min(100, Math.round((have / need) * 100));

    return `
      <div class="ach${done ? '' : ' locked'}" title="${escapeHtml(desc)}">
        <div class="ach-top">
          <span class="ach-ico">${badgeIcon(icon)}</span>
          <div>
            <b>${escapeHtml(name)}</b>
            <small>${done ? 'Unlocked' : escapeHtml(desc)}</small>
          </div>
        </div>
        <div class="ach-bar">
          <i style="width:${pct}%"></i>
        </div>
      </div>
    `;
  });

  const fullHouse = unlocked >= list.length;

  cards.push(`
    <div class="ach${fullHouse ? '' : ' locked'}" title="Unlock every other badge">
      <div class="ach-top">
        <span class="ach-ico">${badgeIcon('star')}</span>
        <div>
          <b>Full house</b>
          <small>${
            fullHouse
              ? 'Unlocked'
              : `Unlock every other badge`
          }</small>
        </div>
      </div>
      <div class="ach-bar">
        <i style="width:${Math.round((unlocked / list.length) * 100)}%"></i>
      </div>
    </div>
  `);

  grid.innerHTML = cards.join('');
}

function renderFeed() {
  const feed = $('#matchFeed');
  if (!feed) return;

  if (!profile.history.length) {
    feed.innerHTML = `<div class="device-empty">No matches yet. Play one.</div>`;
    return;
  }

  feed.innerHTML = profile.history.slice(0, 8).map((entry) => `
    <div class="feed-row">
      <span class="feed-dot${entry.won ? '' : ' loss'}"></span>
      <div class="feed-body">
        <b>${escapeHtml(entry.mode)} · ${escapeHtml(entry.difficulty)}</b>
        <small>${escapeHtml(timeAgo(entry.at))}${entry.won ? '' : ' · lost'}</small>
      </div>
      <span class="feed-score">${Number(entry.score || 0).toLocaleString('en-US')}</span>
    </div>
  `).join('');
}

/* called when a match ends so the profile reflects real play */
function recordMatch(difficulty, mode, won, score) {
  profile.matches += 1;
  profile.captions += Math.max(1, round - 1);
  profile.best = Math.max(profile.best, score);

  if (won) {
    profile.wins += 1;
    profile.streak += 1;
    profile.bestStreak = Math.max(profile.bestStreak, profile.streak);

    if (profile.byDifficulty[difficulty] !== undefined) {
      profile.byDifficulty[difficulty] += 1;
    }
  } else {
    profile.streak = 0;
  }

  if (profile.byMode[mode] !== undefined) profile.byMode[mode] += 1;

  const hour = new Date().getHours();
  if (hour >= 1 && hour < 5) profile.nightOwl = true;

  profile.history.unshift({
    difficulty: DIFFICULTIES[difficulty]?.label || difficulty,
    mode: MODES[mode]?.label || mode,
    won: Boolean(won),
    score,
    at: Date.now()
  });

  profile.history = profile.history.slice(0, 12);

  saveProfile();

  if (current.scene === 'profile') renderProfile();
}

/* the feed reads better with "3h ago" than a raw date */
function timeAgo(stamp) {
  const then = Number(stamp);
  if (!then) return 'Earlier';

  const mins = Math.floor((Date.now() - then) / 60000);

  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;

  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  return new Date(then).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric'
  });
}

/* ---------------- edit mode ---------------- */

let editing = false;

function fillEditForm() {
  const set = (selector, value) => {
    const el = $(selector);
    if (el) el.value = value;
  };

  set('#editName', profile.name);
  set('#editHandle', profile.handle);
  set('#editBio', profile.bio);
  set('#editPronouns', profile.pronouns);
  set('#editRegion', profile.region);
  set('#editTitle', profile.title);

  const count = $('#bioCount');
  if (count) count.textContent = `${profile.bio.length} / 160`;

  // a fresh open must not show a picture that was abandoned last time
  resetStaged();
  paintUploads();

  renderSwatches();
}

function renderSwatches() {
  const accents = $('#swatches');
  const avatars = $('#avatarChoices');

  if (accents) {
    accents.innerHTML = ACCENTS.map(([from, to], i) => `
      <button class="swatch${profile.accent === i ? ' on' : ''}"
        data-accent="${i}" type="button"
        style="background:linear-gradient(135deg, ${from}, ${to})"
        aria-label="Accent ${i + 1}"></button>
    `).join('');
  }

  if (avatars) {
    avatars.innerHTML = AVATARS.map((src, i) => `
      <button class="swatch${profile.avatar === i ? ' on' : ''}"
        data-avatar="${i}" type="button"
        style="background:var(--card-3)" aria-label="Avatar ${i + 1}">
        <img src="${src}" alt="">
      </button>
    `).join('');
  }
}

function setEditing(value) {
  editing = value;

  $('#profileView')?.classList.toggle('hidden', value);
  $('#profileEdit')?.classList.toggle('hidden', !value);

  if (value) fillEditForm();
}

/* the hub quick pick re-renders on every rules change, so this is
   delegated rather than bound per button */
document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-diff]');
  if (!button) return;

  // no mascot line: this is a one-click shortcut, not a deliberate pick
  setDifficulty(button.dataset.diff, { speak: false });
});

/* =========================================================
   THE POINTER

   The tour says "press Play" in a box, which is not much use if the
   thing you are meant to press is somewhere else on screen and
   possibly behind the box. So when a step names a real control, this
   puts a marker on that control - a ring around it and a small arrow
   above it - and keeps it there through scrolling and resizing.

   The ring is fixed-position rather than drawn into the page, so it
   never disturbs the layout and never has to be cleaned up when the
   scene changes.

   It also decides which way the dialogue box docks. If the control
   being pointed at is in the lower part of the screen, the box moves
   to the top, because a box over the thing you are being asked to
   click is the whole problem this solves.
   ========================================================= */

const tourPointer = {
  el: null,
  raf: 0,
  target: null
};

function ensureTourPointer() {
  if (tourPointer.el) return tourPointer.el;

  const el = document.createElement('div');
  el.id = 'tourPointer';
  el.className = 'tour-pointer';
  el.setAttribute('aria-hidden', 'true');

  el.innerHTML = `
    <span class="tour-pointer-ring"></span>
    <span class="tour-pointer-flag"></span>
  `;

  document.body.appendChild(el);
  tourPointer.el = el;

  return el;
}

function hideTourPointer() {
  cancelAnimationFrame(tourPointer.raf);
  tourPointer.raf = 0;
  tourPointer.target = null;

  const el = tourPointer.el;
  if (!el) return;

  el.classList.remove('on');
  el.style.display = 'none';
}

/* follow the target: scroll, resize, and the tour's own scene changes
   all move it, so it is re-measured on a frame loop while it is up */
function trackTourPointer(selector) {
  const target = selector
    ? document.querySelector(selector)
    : null;

  if (!target) {
    hideTourPointer();
    return;
  }

  tourPointer.target = target;

  const el = ensureTourPointer();
  el.style.display = '';
  el.classList.add('on');

  const box = $('#dialogue');

  const place = () => {
    const t = tourPointer.target;

    if (!t || !t.isConnected) {
      hideTourPointer();
      return;
    }

    const r = t.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return;

    el.style.setProperty('--x', `${r.left}px`);
    el.style.setProperty('--y', `${r.top}px`);
    el.style.setProperty('--w', `${r.width}px`);
    el.style.setProperty('--h', `${r.height}px`);

    // the flag sits above the ring, unless that would go off the top
    el.classList.toggle('below', r.top <= 70);

    // if the control being pointed at is low on the screen, the box
    // docks to the top instead of sitting on top of it
    if (box) {
      box.classList.toggle('is-top', r.top > window.innerHeight * 0.55);
    }
  };

  cancelAnimationFrame(tourPointer.raf);

  // placed straight away, not on the next frame: the ring has to be
  // on the control before the next paint
  place();

  const follow = () => {
    tourPointer.raf = requestAnimationFrame(follow);
    place();
  };

  follow();
}

/* =========================================================
   ONBOARDING TOUR

   Ten steps, and each one waits for you to actually use the thing
   it points at. The steps are delivered through the dialogue box at
   the bottom of the screen - the same one Voicy talks through the
   rest of the app - so there is only ever one of him on screen.

   A step that names a control also puts a marker on that control in
   the page, and moves the box out of the way if the control is low
   on the screen. Saying "press Play" in a box that happens to be
   covering Play is not an introduction, it is a puzzle.
   ========================================================= */

const TOUR_DONE_KEY = 'cc-tour-done';

const TOUR_STEPS = [
  {
    id: 'welcome',
    kicker: 'Introduction',
    title: 'Caption Chaos, in ten steps',
    copy:
      'An image appears, you get a few seconds, and one microphone. You say ' +
      'something about the picture and the room votes on it. That is the whole ' +
      'game. I will take you to each part of it and wait while you use it, and ' +
      'there is a practice round in the middle where nobody can hear you.',
    action: 'Read on to begin',
    next: true
  },

  {
    id: 'difficulty',
    kicker: 'The board',
    title: 'Pick how hard you want it to be',
    copy:
      'These four set how many rounds you play, how many seconds you get for ' +
      'each one, and how many other people are in the room. Hard and Nightmare ' +
      'are the ones people come back to.',
    action: 'Click a difficulty',
    wait: { visit: 'hub', click: '#quickDiff .quick-btn' }
  },

  {
    id: 'play',
    kicker: 'The board',
    title: 'Start when you are ready',
    copy:
      'The Play card shows the rules you have chosen. Pressing it opens the mode ' +
      'screen, where you can change the mode, the round length and the player ' +
      'count before you commit.',
    action: 'Press Play',
    wait: { visit: 'hub', click: '.play-card' }
  },

  {
    id: 'practice',
    kicker: 'Practice',
    title: 'Now try it with nobody watching',
    copy:
      'This is a real round with an empty room. No timer, no vote, no score, and ' +
      'nothing kept afterwards. It is the only safe place to find out how your ' +
      'microphone behaves.',
    action: 'Open the practice round',
    wait: { visit: 'tour', click: '[data-practice-start]' }
  },

  {
    id: 'practice-done',
    kicker: 'Practice',
    title: 'That is the whole loop',
    copy:
      'Record, submit, read the room. In a real round your recording goes in ' +
      'under a handle that changes every round, so the vote is on the joke and ' +
      'not on your voice.',
    action: 'Go back to the tour',
    wait: { visit: 'practice', click: '#practiceBack' }
  },

  {
    id: 'studio',
    kicker: 'Your stuff',
    title: 'Build your own images',
    copy:
      'Pack Studio is where an image set is made. Add images, give the pack a ' +
      'name, publish it, and it turns up in your Library.',
    action: 'Open Pack Studio',
    wait: { visit: 'hub', click: '[data-scene="packs"]' }
  },

  {
    id: 'library',
    kicker: 'Your stuff',
    title: 'Everything you have published',
    copy:
      'The Library lists your packs with their image counts and when they went ' +
      'out. You can remove one from here.',
    action: 'Open the Library',
    wait: { visit: 'hub', click: '[data-scene="mypacks"]' }
  },

  {
    id: 'profile',
    kicker: 'Your stuff',
    title: 'Your card, and what you have earned',
    copy:
      'Name, bio, a picture and a banner if you want them. The twelve badges ' +
      'measure real play rather than sitting at a fixed number, and the ' +
      'standings are folded in underneath.',
    action: 'Open your profile',
    wait: { visit: 'hub', click: '[data-scene="profile"]' }
  },

  {
    id: 'settings',
    kicker: 'Your stuff',
    title: 'Everything you can change',
    copy:
      'One page: microphone and devices, dictation, the privacy switches, ' +
      'audio, gameplay, every keybinding, and the interface. All of it is saved ' +
      'on this machine and none of it is sent anywhere.',
    action: 'Open Settings',
    wait: { visit: 'hub', click: '[data-scene="settings"]' }
  },

  {
    id: 'done',
    kicker: 'Done',
    title: 'That is every screen',
    copy: 'You have been through all of it. Play when you are ready.',
    action: 'Finish'
  }
];

const tour = {
  active: false,
  step: 0
};

function tourStep() {
  return TOUR_STEPS[tour.step] || null;
}

function tourSeen() {
  return localStorage.getItem(TOUR_DONE_KEY) === '1';
}

function startTour() {
  tour.active = true;
  tour.step = 0;

  paintTour();
  go('tour');
}

function endTour(markDone = true) {
  tour.active = false;

  if (markDone) localStorage.setItem(TOUR_DONE_KEY, '1');

  hideTourPointer();

  // the last step usually leaves the player on another screen, so come
  // back here or the ending is never actually seen
  if (current.scene !== 'tour') go('tour');

  paintTour();

  // I say goodbye in the same box I said hello in
  openDialogue('end');
}

function paintTour() {
  const step = tourStep();
  const onTour = tour.active && step;

  $('#tour')?.classList.toggle('touring', Boolean(onTour));
  $('#tourRail')?.classList.toggle('hidden', !tour.active);

  if (!onTour) {
    closeDialogue();
    paintTourSteps();
    return;
  }

  const set = (selector, text) => {
    const el = $(selector);
    if (el) el.textContent = text;
  };

  set('#tourKicker', step.kicker);
  set('#tourTitle', step.title);
  set('#tourAction', step.action);

  // the box shows the wait: the ask gets an edge, the portrait leans in
  $('#dialogue')?.classList.toggle('is-waiting', Boolean(step.wait));

  const waiting = Boolean(step.wait);

  set('#tourNextLabel', waiting ? 'Waiting for you' : step.next ? 'Next' : 'Finish');

  const next = $('#tourNext');
  if (next) next.disabled = waiting;

  // the practice step has a real button of its own, so the disabled Next
  // is not the only thing on the card
  $('#practiceStart')?.classList.toggle('hidden', step.id !== 'practice');

  openDialogue('tour');

  // the same typewriter as my own lines, but a step's copy is a
  // paragraph rather than a sentence, so a flat speed would take three
  // seconds to land. scaling by length keeps a paragraph at about a
  // second while a short line still gets the full pace.
  typeInto($('#tourCopy'), step.copy, {
    speed: typingSpeed(step.copy.length)
  });

  // take the player to the screen the step's control is on, then mark
  // it there. order matters: the pointer needs the control to exist.
  if (tourVisitStep()) return;

  trackTourPointer(step.wait?.click);

  paintTourSteps();
}

/* the outline above: every step, and where you are */
function paintTourSteps() {
  const count = Math.min(tour.step + 1, TOUR_STEPS.length);

  const bar = $('#tourBar');
  if (bar) bar.style.width = `${(count / TOUR_STEPS.length) * 100}%`;

  const label = $('#tourCount');
  if (label) {
    label.textContent = tour.active
      ? `Step ${count} of ${TOUR_STEPS.length}`
      : `${TOUR_STEPS.length} of ${TOUR_STEPS.length} done`;
  }

  const list = $('#tourSteps');
  if (!list) return;

  list.innerHTML = TOUR_STEPS.map((s, i) => {
    const state = !tour.active || i < tour.step
      ? 'done'
      : i === tour.step
        ? 'on'
        : '';

    return `
      <li class="${state}">
        <span>${String(i + 1).padStart(2, '0')}</span>
        <b>${escapeHtml(s.title)}</b>
      </li>
    `;
  }).join('');
}

function advanceTour() {
  if (!tour.active) return;

  if (tour.step >= TOUR_STEPS.length - 1) {
    endTour(true);
    return;
  }

  tour.step += 1;
  paintTour();
}

/* Put the player where the step needs them.

   A step that points at a control on another screen has to move them
   there first, otherwise the selector it names does not exist and the
   step can never clear. This is a suggestion, not a hijack: it only
   fires when the tour is active and the step declares where it wants
   to be, and the player can go anywhere else and come back. */
/* returns true if it moved the player, so the caller knows not to
   measure a control that is on another screen */
function tourVisitStep() {
  const step = tourStep();
  if (!step?.wait?.visit) return false;

  if (current.scene === step.wait.visit) {
    // the practice round has its record button in the middle of the
    // screen, and a box floating over the middle of the screen is
    // exactly where you do not want one
    if (
      step.wait.visit === 'practice' &&
      !$('#dialogue').classList.contains('hidden')
    ) {
      closeDialogue();
      trackTourPointer(step.wait.click);
    }
    return false;
  }

  go(step.wait.visit);

  // the control this step names is on the screen we just moved to, and
  // nothing repaints on a scene change, so ask for one. go() is
  // synchronous, so the target is already measurable - no frame wait
  // needed, and waiting for one would mean the marker never appeared in
  // a window that is not rendering.
  paintTour();

  return true;
}

/* Capture phase, deliberately. Any handler that re-renders the
   container the click came from - and the quick-pick does exactly that
   through setDifficulty - detaches event.target before a bubble-phase
   listener sees it, at which point closest() can no longer reach the
   ancestor the selector names. Running on the way down means the
   element is still attached. */
document.addEventListener('click', (event) => {
  if (!tour.active) return;

  const step = tourStep();
  const wait = step?.wait;
  if (!wait?.click) return;

  if (wait.visit && current.scene !== wait.visit) return;

  if (event.target.closest(wait.click)) {
    advanceTour();
  }
}, true);

/* =========================================================
   DICTATION

   Your own voice, typed out, live.

   This is deliberately separate from the game's caption path. A
   caption is a finished recording that gets posted to a room; a
   dictation is you talking to yourself and watching words appear,
   and it has to work with no setup at all.

   Which means the browser engine is the right one here, not the
   fallback. transcribeBlob() has to refuse the browser engine
   because Web Speech cannot read a finished file - but Web Speech
   listens to the *live* stream perfectly well, and that is exactly
   what dictation is. So dictation uses it directly and needs no
   endpoint.

   The privacy position is unchanged and still true: with the browser
   engine your audio goes to a remote recogniser. Dictation says so
   on screen rather than implying it is local.
   ========================================================= */

const Dictation = {
  recognition: null,
  listening: false,
  final: '',
  interim: '',

  /* the last few frames of loudness, so "is it picking you up" can be
     answered with something better than a single sample */
  levels: [],
  heard: false,

  onText: null,
  onState: null
};

function hasWebSpeechEngine() {
  return Boolean(
    window.SpeechRecognition || window.webkitSpeechRecognition
  );
}

/* ---- the mic check ----
   A level meter on its own tells you nothing, because a meter that
   never moves and a meter that is not connected look identical.
   This keeps a short history and reports one of three verdicts:
   nothing, something, or speech. */

const MIC_HISTORY = 90;

function noteMicLevel(db) {
  Dictation.levels.push(db);
  if (Dictation.levels.length > MIC_HISTORY) Dictation.levels.shift();

  // anything this far above the floor is a deliberate voice, not a
  // hum. -34 dBFS is a normal speaking level; a quiet room sits
  // under -50.
  if (db > -34) Dictation.heard = true;
}

function micVerdict() {
  const levels = Dictation.levels;
  if (!levels.length) return { state: 'idle', text: 'Not listening yet' };

  const sorted = [...levels].sort((a, b) => a - b);
  const peak = sorted[sorted.length - 1];
  const median = sorted[Math.floor(sorted.length / 2)];

  if (peak < -55) {
    return {
      state: 'silent',
      text: 'Hearing nothing. Check the input device in Settings.'
    };
  }

  if (median < -48) {
    return {
      state: 'faint',
      text: `Something is there but quiet (${Math.round(peak)} dBFS). Speak closer, or raise the gain.`
    };
  }

  return {
    state: 'good',
    text: `Hearing you (${Math.round(peak)} dBFS peak).`
  };
}

/* ---- live dictation ---- */

function startDictation({ onText, onState } = {}) {
  if (Dictation.listening) return;

  if (!hasWebSpeechEngine()) {
    onState?.({
      state: 'error',
      text:
        'This build has no Web Speech engine, so live dictation is not ' +
        'available. The custom endpoint in Settings still works for ' +
        'finished recordings.'
    });
    return;
  }

  const Recognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;

  const recognition = new Recognition();

  recognition.lang = 'en-US';
  recognition.interimResults = true;
  recognition.continuous = true;

  Dictation.recognition = recognition;
  Dictation.listening = true;
  Dictation.final = '';
  Dictation.interim = '';

  Dictation.onText = onText;
  Dictation.onState = onState;

  onState?.({
    state: 'listening',
    text: 'Listening. Speak, and stop talking to finish.'
  });

  recognition.onresult = (event) => {
    let interim = '';

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const chunk = event.results[i][0].transcript;

      if (event.results[i].isFinal) Dictation.final += chunk;
      else interim += chunk;
    }

    Dictation.interim = interim;

    Dictation.onText?.({
      final: Dictation.final,
      interim,
      combined: `${Dictation.final}${interim}`.trim()
    });
  };

  recognition.onerror = (event) => {
    stopDictation();

    const messages = {
      'not-allowed':
        'Microphone permission was refused. Allow it in Windows settings, then try again.',
      'no-speech':
        'Nothing was picked up. Check the input device in Settings.',
      'audio-capture':
        'No microphone was found. Windows needs to be told which one to use.',
      network:
        'The browser recogniser needs network access. It is a cloud ' +
        'service, so this is expected offline - the custom endpoint in ' +
        'Settings is the local option.',
      aborted: 'Stopped.'
    };

    onState?.({
      state: 'error',
      text: messages[event.error] || `Recogniser error: ${event.error}`
    });
  };

  recognition.onend = () => {
    if (!Dictation.listening) return;

    // continuous mode ends on its own after a pause; restart so a
    // second thought still gets caught
    try {
      recognition.start();
    } catch {
      stopDictation();
    }
  };

  try {
    recognition.start();
  } catch (error) {
    stopDictation();

    onState?.({
      state: 'error',
      text: 'Could not start the recogniser.'
    });
  }
}

function stopDictation() {
  Dictation.listening = false;

  if (Dictation.recognition) {
    try {
      Dictation.recognition.onend = null;
      Dictation.recognition.stop();
    } catch {}

    Dictation.recognition = null;
  }

  Dictation.onState?.({ state: 'idle', text: 'Stopped.' });
}

function dictationResult() {
  return `${Dictation.final}${Dictation.interim}`.trim();
}

function clearDictation() {
  Dictation.final = '';
  Dictation.interim = '';
  Dictation.levels = [];
  Dictation.heard = false;
  Dictation.onText?.({ final: '', interim: '', combined: '' });
}

/* =========================================================
   THE PRACTICE ROUND, dictation first

   The recorder used to be the only way in, and it needed a custom
   endpoint because Web Speech cannot read a finished file. Dictation
   listens to the live stream, which the browser engine does
   perfectly well, so it leads now and the recorder is a fallback.

   What did not change: the practice round still scores nothing,
   votes nothing, and keeps nothing.
   ========================================================= */

const PRACTICE_FACES = [
  '◕‿◕', 'WHAT.', '¯\\_(ツ)_/¯', '???', 'o_O', '>:3', '!!!', 'hmm',
  'no.', 'LOL', 'erm', 'OH.'
];

/* its own state, so it cannot collide with a live round's, and so
   leaving it is just dropping the state - nothing was submitted */
const practice = {
  mode: 'idle',        // 'dictate' | 'record'
  recorder: null,
  stream: null,
  chunks: [],
  busy: false,
  face: 0,
  ctx: null,
  analyser: null,
  level: 0,
  raf: 0
};

function paintPracticeStatus(text, tone = '') {
  const label = $('#practiceStatus');
  const dot = $('#practiceDot');

  if (label) label.textContent = text;
  if (dot) dot.className = `practice-dot ${tone}`.trim();
}

function paintPracticeTranscript(text, interim = false) {
  const box = $('#practiceTranscript');
  if (!box) return;

  if (!text) {
    box.innerHTML = `
      <span class="practice-placeholder">
        ${practice.mode === 'record'
          ? 'Release to transcribe the recording.'
          : 'Press Dictate and just talk. The words appear here as you say them.'}
      </span>`;
    return;
  }

  box.innerHTML =
    `<span class="${interim ? 'interim' : 'final'}">${escapeHtml(text)}</span>`;
}

function setPracticeNote(text) {
  const note = $('#practiceNote');
  if (note) note.textContent = text;
}

function practiceFace() {
  const figure = $('#practiceFigure');
  if (figure) figure.textContent = PRACTICE_FACES[practice.face % PRACTICE_FACES.length];
}

/* ---- the mic, shared by both modes ---- */

async function openPracticeMic() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return;

  practice.stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      ...(audio.inputId ? { deviceId: { exact: audio.inputId } } : {})
    }
  });

  practice.ctx = new Ctx();
  if (practice.ctx.state === 'suspended') {
    await practice.ctx.resume().catch(() => {});
  }

  practice.analyser = practice.ctx.createAnalyser();
  practice.analyser.fftSize = 2048;
  practice.analyser.smoothingTimeConstant = 0.6;

  const source = practice.ctx.createMediaStreamSource(practice.stream);
  source.connect(practice.analyser);

  cancelAnimationFrame(practice.raf);

  const tick = () => {
    practice.raf = requestAnimationFrame(tick);
    pumpPracticeMeter();
  };

  tick();
}

function closePracticeMic() {
  cancelAnimationFrame(practice.raf);
  practice.raf = 0;

  try { practice.ctx?.close(); } catch {}
  practice.ctx = null;
  practice.analyser = null;

  practice.stream?.getTracks().forEach((track) => track.stop());
  practice.stream = null;

  const bar = $('#practiceMeter');
  if (bar) bar.style.width = '0%';
}

function practiceMicFailed(error) {
  closePracticeMic();

  paintPracticeStatus('Microphone unavailable', 'bad');
  paintMicVerdict();

  setPracticeNote(
    'Grant microphone access, or pick a different input in Settings. ' +
    'Windows asks the first time an app wants the mic.'
  );

  toast('Could not open the microphone.');
}

/* ---- dictation, which is the default path ---- */

function practiceDictateStart() {
  if (practice.busy) return;

  practice.mode = 'dictate';

  $('#practiceDictate')?.classList.add('recording');
  paintPracticeStatus('Listening…', 'live');

  clearDictation();
  paintPracticeTranscript('');

  setPracticeNote(
    'Just talk. The words appear as you say them. Press Dictate again to stop.'
  );

  openPracticeMic().then(() => {
    startDictation({
      onText: ({ final, interim, combined }) => {
        paintPracticeTranscript(combined, Boolean(interim));

        // the transcript is the real evidence the mic worked, so the
        // verdict goes "good" the moment anything is heard
        paintMicVerdict();
      },

      onState: ({ state, text }) => {
        if (state === 'error') {
          paintPracticeStatus('Stopped', 'bad');
          setPracticeNote(text);
        } else if (state === 'idle') {
          finishDictation();
        }
      }
    });
  }).catch(practiceMicFailed);
}

function finishDictation() {
  $('#practiceDictate')?.classList.remove('recording');

  const text = dictationResult();
  const verdict = micVerdict();

  closePracticeMic();

  if (text) {
    paintPracticeTranscript(text);
    paintPracticeStatus('That is your caption', 'good');
    setPracticeNote(
      'In a real round this is what the room votes on, under a handle that ' +
      'changes every round. Nothing you just said was kept.'
    );

    window.dispatchEvent(new CustomEvent('cc-practice-done'));
    return;
  }

  // no words. that is not automatically a broken microphone, so the
  // verdict decides which of the two it was
  paintPracticeStatus(
    verdict.state === 'good' ? 'Mic fine, no words' : 'Nothing picked up',
    verdict.state === 'good' ? 'warn' : 'bad'
  );

  paintMicVerdict();

  setPracticeNote(
    verdict.state === 'good'
      ? 'Your microphone was clearly picking you up, so the microphone is ' +
        'fine - the browser recogniser is the part that did not answer. It ' +
        'needs network access; the custom endpoint in Settings is the local ' +
        'option, and Record instead uses it.'
      : 'Nothing came through the microphone, so check the input in ' +
        'Settings and your gain before blaming the recogniser.'
  );
}

/* ---- the recorder, kept as the fallback ---- */

async function practiceRecordStart() {
  if (practice.busy) return;

  practice.mode = 'record';
  practice.busy = true;

  $('#practiceRecord')?.classList.add('recording');
  paintPracticeStatus('Recording…', 'live');

  paintPracticeTranscript('');
  setPracticeNote('Recording. Release to transcribe.');

  try {
    if (!practice.stream) await openPracticeMic();

    practice.chunks = [];

    const mime = getRecordingMimeType();

    practice.recorder = mime
      ? new MediaRecorder(practice.stream, { mimeType: mime })
      : new MediaRecorder(practice.stream);

    practice.recorder.addEventListener('dataavailable', (event) => {
      if (event.data && event.data.size > 0) practice.chunks.push(event.data);
    });

    practice.recorder.start();
  } catch (error) {
    practice.busy = false;
    practiceMicFailed(error);
  }
}

function practiceRecordStop() {
  if (practice.mode !== 'record' || !practice.recorder) return;

  $('#practiceRecord')?.classList.remove('recording');

  const recorder = practice.recorder;
  practice.recorder = null;

  if (recorder.state === 'inactive') {
    practice.busy = false;
    return;
  }

  paintPracticeStatus('Working on it…');

  recorder.addEventListener('stop', async () => {
    const blob = new Blob(practice.chunks, {
      type: recorder.mimeType || 'audio/webm'
    });

    practice.chunks = [];
    practice.busy = false;

    if (!blob.size) {
      paintPracticeStatus('Too short to transcribe', 'bad');
      paintMicVerdict();
      return;
    }

    const result = await transcribeBlob(blob);

    if (result.text?.trim()) {
      paintPracticeTranscript(result.text.trim());
      paintPracticeStatus('That is your caption', 'good');

      setPracticeNote(
        `In a real round this is what the room votes on. ${result.detail}. ` +
        'Nothing you just said was kept.'
      );

      window.dispatchEvent(new CustomEvent('cc-practice-done'));
      return;
    }

    paintPracticeStatus('Recorded, no words back', 'warn');
    paintMicVerdict();

    setPracticeNote(
      `Your microphone was ${micVerdict().state === 'good' ? 'working' : 'not picking anything up'}. ` +
      (result.error || '')
    );
  }, { once: true });

  try { recorder.stop(); } catch {}
}

/* ---- leaving ---- */

function leavePractice() {
  if (Dictation.listening) stopDictation();

  if (practice.recorder && practice.recorder.state !== 'inactive') {
    try { practice.recorder.stop(); } catch {}
  }

  practice.recorder = null;
  practice.busy = false;
  practice.chunks = [];
  practice.mode = 'idle';

  closePracticeMic();
  clearDictation();

  $('#practiceDictate')?.classList.remove('recording');
  $('#practiceRecord')?.classList.remove('recording');

  paintPracticeTranscript('');
  paintPracticeStatus('Ready when you are');
  paintMicVerdict();

  setPracticeNote(
    'Dictation is live, so it works with no setup. If the words do not come ' +
    'back, the level meter and the mic verdict will tell you whether the ' +
    'microphone is the problem or the recogniser is.'
  );
}

function nextPracticeFace() {
  practice.face += 1;
  practiceFace();

  paintPracticeTranscript('');
  paintPracticeStatus('Ready when you are');
  paintMicVerdict();
}

/* ---- the mic check, fed by the meter's own numbers ---- */

function paintMicVerdict() {
  const line = $('#practiceMic');
  if (!line) return;

  const verdict = micVerdict();

  line.textContent = verdict.text;
  line.className = `practice-mic ${verdict.state}`;
}

/* read a few frames per call so the verdict is not one lucky sample */
function pumpPracticeMeter() {
  if (!practice.analyser) return;

  const data = new Uint8Array(practice.analyser.fftSize);

  let peak = 0;
  let sum = 0;

  for (let frame = 0; frame < 3; frame++) {
    practice.analyser.getByteTimeDomainData(data);

    for (let i = 0; i < data.length; i++) {
      const v = (data[i] - 128) / 128;
      peak = Math.max(peak, Math.abs(v));
      sum += v * v;
    }
  }

  const rms = Math.sqrt(sum / (data.length * 3));
  const db = 20 * Math.log10(Math.max(rms, 0.0001));

  practice.level = Math.min(1, peak);

  const bar = $('#practiceMeter');
  if (bar) bar.style.width = `${Math.round(practice.level * 100)}%`;

  noteMicLevel(db);
}

/* ---- the buttons ---- */

function bindPractice() {
  const button = $('#practiceDictate');
  if (!button) return;

  button.addEventListener('click', () => {
    if (Dictation.listening) {
      stopDictation();
    } else {
      practiceDictateStart();
    }
  });

  const record = $('#practiceRecord');

  if (record) {
    record.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      practiceRecordStart();
    });

    ['pointerup', 'pointercancel', 'pointerleave'].forEach((name) => {
      record.addEventListener(name, () => practiceRecordStop());
    });

    record.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      practiceRecordStart();
    });

    record.addEventListener('keyup', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      practiceRecordStop();
    });
  }

  $('#practiceRedo')?.addEventListener('click', nextPracticeFace);

  $('#practiceBack')?.addEventListener('click', () => {
    leavePractice();
    go(tour.active ? 'tour' : 'hub');
  });
}

window.addEventListener('cc-practice-done', () => {
  if (tour.active) advanceTour();
});

window.addEventListener('beforeunload', leavePractice);

/* =========================================================
   ROUND COUNTDOWN + MATCH SUMMARY
   ========================================================= */

async function countdown() {
  if (!settings.countdown) return;

  const overlay = $('#countdown');
  const number = $('#countdownNum');
  const label = $('#countdownRound');
  const go_ = $('#countdownGo');

  if (!overlay) return;

  if (label) label.textContent = `Round ${round} of ${rules.rounds}`;

  overlay.classList.add('on');
  overlay.setAttribute('aria-hidden', 'false');

  for (const value of ['3', '2', '1']) {
    if (number) {
      number.textContent = value;
      number.classList.remove('tick');
      void number.offsetWidth;
      number.classList.add('tick');
    }

    await wait(620);
  }

  if (go_) go_.textContent = 'Speak';

  await wait(520);

  overlay.classList.remove('on');
  overlay.setAttribute('aria-hidden', 'true');
}

function showSummary() {
  const grid = $('#summaryGrid');
  const title = $('#summaryTitle');

  const won = Math.min(round - 1, score);
  const accuracy = clamp(Math.round((score / Math.max(1, round - 1)) * 100), 0, 100);

  if (title) {
    title.textContent = score >= round - 1 && round > 1
      ? 'You cleaned up. Well played.'
      : score > 0
        ? 'Respectable. Barely.'
        : 'Rough one. It happens.';
  }

  // keep the profile honest about what you actually played
  if (typeof recordMatch === 'function') {
    recordMatch(
      rules.difficulty,
      rules.mode,
      score >= round - 1 && round > 1,
      score * 137 + round * 41
    );
  }

  if (grid) {
    grid.innerHTML = `
      <div class="sum"><b>${won}</b><small>Wins</small></div>
      <div class="sum"><b>${round - 1}</b><small>Rounds</small></div>
      <div class="sum"><b>${accuracy}%</b><small>Hit rate</small></div>
      <div class="sum"><b>${(score * 137 + round * 41).toLocaleString('en-US')}</b><small>Score</small></div>
    `;
  }

  go('summary');
}

/* =========================================================
   ONBOARDING BOOT

   The tour and the practice round are wired up here, at the end of
   the file. Binding is safe during evaluation because every function
   involved is a hoisted declaration - but the first paint is not, since
   TOUR_STEPS is a const further up and touching it now would be a
   temporal dead zone access. So the paint waits for load.
   ========================================================= */

(function initOnboarding() {

  $('#tutorialBtn')?.addEventListener('click', () => startTour());

  $('#tourNext')?.addEventListener('click', () => {
    // a waiting step disables this, but a stray click should not skip
    // the very thing the step is asking for
    const step = tourStep();
    if (step?.wait) return;

    advanceTour();
  });

  $('#tourSkipAll')?.addEventListener('click', () => {
    endTour(true);
    go('hub');
  });

  $('#tourReplay')?.addEventListener('click', () => startTour());

  document.addEventListener('click', (event) => {
    if (event.target.closest('[data-practice-start]')) {
      go('practice');
    }
  });

  bindPractice();

  // now that TOUR_STEPS exists, put the box and the outline in their
  // starting state
  paintTour();
  paintMicVerdict();

  // a first run opens the tour by itself; everyone else gets the hub
  if (!tourSeen()) {
    window.addEventListener('load', () => {
      setTimeout(() => {
        if (!tour.active && current.scene === 'hub') startTour();
      }, 900);
    }, { once: true });
  }
})();
