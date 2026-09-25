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

let calm = false;


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
  classic: { label: 'Classic', secondsScale: 1,    multiplier: 1 },
  blitz:   { label: 'Blitz',   secondsScale: 0.5,  multiplier: 1.5 },
  turn:    { label: 'Turn',    secondsScale: 0.85, multiplier: 1.2 },
  custom:  { label: 'Custom',  secondsScale: 1,    multiplier: 1 }
};

const LIMITS = {
  rounds:  { min: 1,  max: 15, step: 1 },
  seconds: { min: 3,  max: 45, step: 1 },
  players: { min: 2,  max: 8,  step: 1 }
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

let round = 1;
let score = 0;

// chaos level picks how many submissions come back to vote on
function submissionCount() {
  return clamp(2 + Math.round(rules.players / 2) +
    Math.round(rules.chaos / 40), 2, 8);
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
  let ratio = 1;

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
    ratio = Math.min(window.devicePixelRatio || 1, 2);

    width = canvas.clientWidth;
    height = canvas.clientHeight;

    canvas.width = Math.floor(width * ratio);
    canvas.height = Math.floor(height * ratio);

    context.setTransform(ratio, 0, 0, ratio, 0, 0);

    build();
  }

  function drawMote(mote) {
    const pulse =
      0.55 + 0.45 * (0.5 + 0.5 * Math.sin(mote.phase * 1.4));

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

})();


/* =========================================================
   SCENES
   There is no nav bar. The hub is a board of tiles, each
   opening its own screen, and a round hides all chrome.
   ========================================================= */

const GAME_SCENES = ['play', 'vote', 'winner'];

function go(scene) {
  const target = $('#' + scene);
  if (!target) return;

  $$('.scene').forEach((element) => element.classList.remove('active'));
  target.classList.add('active');

  $('#stage').scrollTop = 0;

  const inGame = GAME_SCENES.includes(scene);
  $('#app').classList.toggle('in-game', inGame);

  current.scene = scene;

  if (scene === 'play') resetRound();
  if (scene === 'winner') celebrate();
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

  audio.addEventListener('ended', () => {
    if (currentMascotAudio === audio) {
      currentMascotAudio = null;
      portrait?.classList.remove('talking');
      $('#dialogue')?.classList.remove('is-talking');
    }
  });

  audio.play().catch(() => {});

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

  clearInterval(typeTimer);
  stopMascotAudio();

  dialogue.classList.remove('hidden');
  box.textContent = '';

  let index = 0;

  if (autoPlay) playVoicyRecording(audioSrc);

  typeTimer = setInterval(() => {
    if (index >= text.length) {
      clearInterval(typeTimer);
      typeTimer = null;
      return;
    }

    const character = text[index];
    box.textContent += character;
    index++;

    if (
      character.trim() !== '' &&
      !/[.,!?;:'"()[\]{}\-—…]/.test(character)
    ) {
      playVoicyBlip();
    }
  }, 32);
}

function finishMascotDialogue() {
  clearInterval(typeTimer);
  typeTimer = null;
  stopMascotAudio();
}

$('#dialogueSkip')?.addEventListener('click', () => {
  finishMascotDialogue();
  $('#dialogue')?.classList.add('hidden');
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
      audio: rules.playback ? myRecordingUrl : null
    });
  }

  for (let i = submissions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [submissions[i], submissions[j]] = [submissions[j], submissions[i]];
  }

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

      toast('Vote locked in');

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
  $('#customBlock').hidden = rules.mode !== 'custom';
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

$$('.diff-card').forEach((card) => {
  card.addEventListener('click', () => {
    rules.difficulty = card.dataset.diff;

    $$('.diff-card').forEach((other) => {
      other.classList.toggle('selected', other === card);
    });

    applyRules();
    syncSummary();

    mascotSay(`${DIFFICULTIES[rules.difficulty].label} it is. Good luck.`);
  });
});

$$('.gmode').forEach((card) => {
  card.addEventListener('click', () => {
    rules.mode = card.dataset.mode;

    $$('.gmode').forEach((other) => {
      other.classList.toggle('selected', other === card);
    });

    applyRules();
    syncSummary();
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

$('#ruleAnon')?.addEventListener('click', (event) => {
  rules.anonymous = !rules.anonymous;
  syncRuleInputs();
});

$('#rulePlayback')?.addEventListener('click', (event) => {
  rules.playback = !rules.playback;
  syncRuleInputs();
});

$('#startRound')?.addEventListener('click', () => {
  applyRules();

  round = 1;
  score = 0;

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
    toast(`Match over • ${rules.rounds} rounds played`);
    go('hub');
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

  go('hub');
  mascotSay('Match abandoned. No judgement.');
});


/* =========================================================
   PACK STUDIO
   ========================================================= */

$('#publishPack')?.addEventListener('click', () => {
  const name = $('#packName')?.value.trim() || 'Untitled Pack';
  const description = $('#packDescription')?.value || '';

  localStorage.setItem(
    'cc-pack',
    JSON.stringify({ name, description, time: Date.now() })
  );

  toast('PACK PUBLISHED');

  setTimeout(() => go('mypacks'), 650);

  mascotSay('Your pack is live.');
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
   SETTINGS
   ========================================================= */

$('#settingsBtn')?.addEventListener('click', () => {
  $('#settingsModal')?.classList.add('open');
});

$$('.toggle').forEach((toggle) => {
  toggle.addEventListener('click', () => {
    toggle.classList.toggle('on');

    if (toggle.id === 'motionToggle') {
      calm = toggle.classList.contains('on');
      document.body.classList.toggle('calm', calm);
      window.rebuildParticles?.();
    }
  });
});


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

  button.addEventListener('click', (event) => {
    event.stopPropagation();
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

  function showSignedIn(name) {
    button.classList.add('signed');
    button.innerHTML =
      `<img class="login-avatar" src="../assets/mascot.png" alt="">
       <span>${escapeHtml(name)}</span>`;
  }

  $('#loginGuest')?.addEventListener('click', () => {
    const name = localStorage.getItem('cc-guest') || 'Guest';

    localStorage.setItem('cc-guest', name);

    showSignedIn(name);
    closePop();

    toast(`Playing as ${name}`);
  });

  const stored = localStorage.getItem('cc-guest');
  if (stored) showSignedIn(stored);

})();


/* =========================================================
   MODALS
   ========================================================= */

['#creditsModal', '#settingsModal'].forEach((selector) => {
  const modal = $(selector);
  if (!modal) return;

  $$('[data-close]', modal).forEach((element) => {
    element.addEventListener('click', () => {
      modal.classList.remove('open');
      modal.setAttribute('aria-hidden', 'true');
    });
  });
});

$('#creditsBtn')?.addEventListener('click', () => {
  $('#creditsModal')?.classList.add('open');
});

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;

  ['#creditsModal', '#settingsModal'].forEach((selector) => {
    $(selector)?.classList.remove('open');
  });
});


/* =========================================================
   DISCORD PROFILE
   ========================================================= */

function setDiscordProfile(user) {
  const avatar = $('#discordAvatar');
  const displayName = $('#discordDisplayName');
  const username = $('#discordUsername');
  const connectButton = $('#connectDiscordBtn');

  if (!avatar || !displayName || !username || !connectButton) return;

  if (!user) {
    avatar.src = '../assets/mascot.png';
    displayName.textContent = 'Not connected';
    username.textContent = 'Link Discord';
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
   LIVE TICKER - cosmetic, there is no backend yet
   ========================================================= */

(function initTicker() {

  const stat = $('#statOnline');
  if (!stat) return;

  let online = 8421;

  setInterval(() => {
    online = Math.max(1200, online + Math.floor(Math.random() * 21) - 9);
    stat.textContent = online.toLocaleString('en-US');
  }, 3200);

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
});


/* =========================================================
   STARTUP
   ========================================================= */

window.addEventListener('load', () => {
  setDiscordProfile(null);
  resetRound();

  const guest = localStorage.getItem('cc-guest');
  if (guest && $('#footSub')) $('#footSub').textContent = 'Signed in as guest';
});
