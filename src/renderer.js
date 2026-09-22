// Caption Chaos — 100x Tuff
//
// Real microphone recording.
// Original player audio.
// No TTS.
// No pitch shifting.
// No voice processing.
// Discord OAuth profile integration.

/* =========================================================
   HELPERS
========================================================= */

const $ = (selector) =>
  document.querySelector(selector);

const $$ = (selector) =>
  [...document.querySelectorAll(selector)];

/* =========================================================
   STATE
========================================================= */

let current = 'home';

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

let currentBlips = new Set();

/* =========================================================
   TITLES
========================================================= */

const titles = {

  home:
    'Make the picture speak.',

  play:
    'Your turn. Make it funny.',

  vote:
    'Who cooked?',

  winner:
    'Round results',

  packs:
    'Build your chaos.',

  mypacks:
    'Pack library',

  tutorial:
    'Meet Voicy.',

  settings:
    'Settings'

};

/* =========================================================
   CRUMBS
========================================================= */

const crumbs = {

  home:
    'LOBBY',

  play:
    'GAME',

  vote:
    'VOTING',

  winner:
    'RESULTS',

  packs:
    'PACK STUDIO',

  mypacks:
    'LIBRARY',

  tutorial:
    'TUTORIAL',

  settings:
    'SETTINGS'

};

/* =========================================================
   NAVIGATION
========================================================= */

function go(view) {

  $$('.view').forEach(
    (element) =>
      element.classList.remove('active')
  );

  const target =
    $('#' + view);

  if (target) {
    target.classList.add('active');
  }

  $$('.nav').forEach(
    (button) => {

      button.classList.toggle(
        'active',
        button.dataset.view === view
      );

    }
  );

  if ($('#pageTitle')) {

    $('#pageTitle').textContent =
      titles[view] ||
      'Caption Chaos';

  }

  if ($('#crumb')) {

    $('#crumb').textContent =
      crumbs[view] ||
      view.toUpperCase();

  }

  current = view;

  if (view === 'play') {
    resetRound();
  }
}

$$('[data-view]').forEach(
  (button) => {

    button.addEventListener(
      'click',
      () => {
        go(button.dataset.view);
      }
    );

  }
);

/* =========================================================
   TOAST
========================================================= */

function toast(message) {

  const element =
    $('#toast');

  if (!element) {
    return;
  }

  element.textContent =
    message;

  element.classList.add(
    'show'
  );

  clearTimeout(
    window.captionChaosToastTimer
  );

  window.captionChaosToastTimer =
    setTimeout(
      () => {

        element.classList.remove(
          'show'
        );

      },
      2200
    );
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

  currentBlips.forEach(
    (audio) => {

      try {

        audio.pause();
        audio.currentTime = 0;

      } catch {}

    }
  );

  currentBlips.clear();

  const avatar =
    $('.dialogue-avatar img');

  if (avatar) {
    avatar.classList.remove(
      'talking'
    );
  }

  const dialogue =
    $('#dialogue');

  if (dialogue) {
    dialogue.classList.remove(
      'is-talking'
    );
  }
}

function createAudioElement(src) {

  const audio =
    new Audio(src);

  audio.preload = 'auto';

  return audio;
}

/* =========================================================
   VOICY RECORDING
========================================================= */

function playVoicyRecording(
  audioSrc =
    '../assets/voicy/voicy.wav'
) {

  if (!mascotVoice) {
    return null;
  }

  stopMascotAudio();

  const audio =
    createAudioElement(
      audioSrc
    );

  currentMascotAudio =
    audio;

  const avatar =
    $('.dialogue-avatar img');

  if (avatar) {
    avatar.classList.add(
      'talking'
    );
  }

  const dialogue =
    $('#dialogue');

  if (dialogue) {
    dialogue.classList.add(
      'is-talking'
    );
  }

  audio.addEventListener(
    'ended',
    () => {

      if (
        currentMascotAudio ===
        audio
      ) {

        currentMascotAudio =
          null;

        if (avatar) {
          avatar.classList.remove(
            'talking'
          );
        }

        if (dialogue) {
          dialogue.classList.remove(
            'is-talking'
          );
        }

      }

    }
  );

  audio.play().catch(
    () => {}
  );

  return audio;
}

/* =========================================================
   VOICY BLIP
========================================================= */

function playVoicyBlip() {

  const blip =
    createAudioElement(
      '../assets/voicy/blip.wav'
    );

  blip.volume = 0.42;

  currentBlips.add(
    blip
  );

  blip.addEventListener(
    'ended',
    () => {
      currentBlips.delete(
        blip
      );
    }
  );

  blip.play().catch(
    () => {
      currentBlips.delete(
        blip
      );
    }
  );
}

/* =========================================================
   VOICY DIALOGUE
========================================================= */

function mascotSay(
  text,
  audioSrc =
    '../assets/voicy/voicy.wav',
  autoPlay = true
) {

  const dialogue =
    $('#dialogue');

  const box =
    $('#dialogueText');

  if (!dialogue || !box) {
    return;
  }

  clearInterval(
    typeTimer
  );

  stopMascotAudio();

  dialogue.classList.remove(
    'hidden'
  );

  box.textContent = '';

  let index = 0;

  if (autoPlay) {

    playVoicyRecording(
      audioSrc
    );

  }

  typeTimer =
    setInterval(
      () => {

        if (
          index >= text.length
        ) {

          clearInterval(
            typeTimer
          );

          typeTimer = null;

          return;
        }

        const character =
          text[index];

        box.textContent +=
          character;

        index++;

        if (
          character.trim() !== '' &&
          !/[.,!?;:'"()[\]{}\-—…]/.test(
            character
          )
        ) {

          playVoicyBlip();

        }

      },
      32
    );
}

function finishMascotDialogue() {

  clearInterval(
    typeTimer
  );

  typeTimer = null;

  stopMascotAudio();
}

/* =========================================================
   DIALOGUE SKIP
========================================================= */

const dialogueSkip =
  $('#dialogueSkip');

if (dialogueSkip) {

  dialogueSkip.addEventListener(
    'click',
    () => {

      finishMascotDialogue();

      $('#dialogue')
        ?.classList
        .add('hidden');

    }
  );

}

/* =========================================================
   MICROPHONE
========================================================= */

async function requestMicrophone() {

  if (
    !navigator.mediaDevices?.getUserMedia
  ) {

    throw new Error(
      'Microphone recording is unavailable.'
    );

  }

  return navigator.mediaDevices
    .getUserMedia({
      audio: true
    });
}

function getRecordingMimeType() {

  const formats = [

    'audio/webm;codecs=opus',

    'audio/webm',

    'audio/ogg;codecs=opus',

    'audio/mp4'

  ];

  for (
    const format of formats
  ) {

    if (
      window.MediaRecorder &&
      MediaRecorder.isTypeSupported &&
      MediaRecorder.isTypeSupported(
        format
      )
    ) {

      return format;

    }

  }

  return '';
}

/* =========================================================
   START RECORDING
========================================================= */

async function startRecording() {

  if (recording) {
    return;
  }

  try {

    mediaStream =
      await requestMicrophone();

    recordedChunks = [];
    recordedBlob = null;

    if (recordedUrl) {

      URL.revokeObjectURL(
        recordedUrl
      );

      recordedUrl = null;

    }

    const mimeType =
      getRecordingMimeType();

    mediaRecorder =
      mimeType
        ? new MediaRecorder(
            mediaStream,
            { mimeType }
          )
        : new MediaRecorder(
            mediaStream
          );

    mediaRecorder.addEventListener(
      'dataavailable',
      (event) => {

        if (
          event.data &&
          event.data.size > 0
        ) {

          recordedChunks.push(
            event.data
          );

        }

      }
    );

    mediaRecorder.addEventListener(
      'stop',
      () => {

        const finalType =
          mediaRecorder?.mimeType ||
          mimeType ||
          'audio/webm';

        recordedBlob =
          new Blob(
            recordedChunks,
            {
              type: finalType
            }
          );

        recordedUrl =
          URL.createObjectURL(
            recordedBlob
          );

        recordedChunks = [];

        if (mediaStream) {

          mediaStream
            .getTracks()
            .forEach(
              (track) =>
                track.stop()
            );

          mediaStream = null;
        }

        showRecordedPreview();

      }
    );

    mediaRecorder.start();

    recording = true;

    $('#recordBtn')
      ?.classList
      .add('hidden');

    $('#submitBtn')
      ?.classList
      .remove('hidden');

    if ($('#micState')) {

      $('#micState').innerHTML =
        '<span style="background:#69f6a0;box-shadow:0 0 10px #69f6a0"></span> RECORDING YOUR ACTUAL VOICE';

    }

    mascotSay(
      'Okay. Fifteen seconds. Cook.',
      '../assets/voicy/voicy.wav'
    );

    startTimer();

  } catch (error) {

    console.error(
      'Microphone error:',
      error
    );

    recording = false;

    if ($('#micState')) {

      $('#micState').innerHTML =
        '<span style="background:#ff657a"></span> MICROPHONE ACCESS DENIED';

    }

    toast(
      'Microphone access is required to record your caption.'
    );

    mascotSay(
      'Microphone access is required before you can record.',
      '../assets/voicy/voicy.wav'
    );

  }
}

/* =========================================================
   STOP RECORDING
========================================================= */

function stopRecording(
  autoSubmit = false
) {

  if (!recording) {
    return;
  }

  recording = false;

  clearInterval(timer);
  timer = null;

  if ($('#micState')) {

    $('#micState').innerHTML =
      '<span style="background:#9b63ff"></span> CAPTION RECORDED';

  }

  if (
    mediaRecorder &&
    mediaRecorder.state !== 'inactive'
  ) {

    mediaRecorder.stop();

  } else if (mediaStream) {

    mediaStream
      .getTracks()
      .forEach(
        (track) =>
          track.stop()
      );

    mediaStream = null;

  }

  $('#recordBtn')
    ?.classList
    .remove('hidden');

  $('#submitBtn')
    ?.classList
    .add('hidden');

  if (autoSubmit) {

    setTimeout(
      () => submitCaption(),
      400
    );

  }
}

/* =========================================================
   RECORDED PREVIEW
========================================================= */

function showRecordedPreview() {

  const preview =
    $('#captionPreview');

  if (
    !preview ||
    !recordedUrl
  ) {
    return;
  }

  preview.classList.remove(
    'hidden'
  );

  preview.innerHTML = `
    <div style="
      display:flex;
      align-items:center;
      gap:10px;
      padding:12px 14px;
      border:1px solid rgba(255,255,255,.08);
      border-radius:12px;
      background:rgba(255,255,255,.025);
    ">

      <span style="
        font-size:12px;
        opacity:.7;
        white-space:nowrap;
      ">
        YOUR RECORDING
      </span>

      <audio
        controls
        preload="metadata"
        src="${recordedUrl}"
        style="
          width:100%;
          max-width:430px;
        "
      ></audio>

    </div>
  `;
}

/* =========================================================
   TIMER
========================================================= */

function startTimer() {

  clearInterval(timer);

  timer =
    setInterval(
      () => {

        seconds--;

        if ($('#timer')) {

          $('#timer').textContent =
            String(
              Math.max(
                seconds,
                0
              )
            ).padStart(
              2,
              '0'
            );

        }

        if (seconds <= 0) {

          clearInterval(
            timer
          );

          timer = null;

          stopRecording(true);

        }

      },
      1000
    );
}

/* =========================================================
   RESET ROUND
========================================================= */

function resetRound() {

  clearInterval(timer);

  timer = null;

  if (
    mediaRecorder &&
    mediaRecorder.state !== 'inactive'
  ) {

    try {
      mediaRecorder.stop();
    } catch {}

  }

  if (mediaStream) {

    mediaStream
      .getTracks()
      .forEach(
        (track) =>
          track.stop()
      );

    mediaStream = null;

  }

  recording = false;

  seconds = 15;

  if ($('#timer')) {
    $('#timer').textContent = '15';
  }

  $('#recordBtn')
    ?.classList
    .remove('hidden');

  $('#submitBtn')
    ?.classList
    .add('hidden');

  $('#captionPreview')
    ?.classList
    .add('hidden');

  if ($('#micState')) {

    $('#micState').innerHTML =
      '<span></span> MICROPHONE READY';

  }

  if ($('#captionPreview')) {
    $('#captionPreview').innerHTML = '';
  }

  recordedChunks = [];
  recordedBlob = null;

  if (recordedUrl) {

    URL.revokeObjectURL(
      recordedUrl
    );

    recordedUrl = null;

  }

  if ($('#wave')) {

    $('#wave').innerHTML =
      Array.from(
        { length: 28 },
        (_, i) =>
          `<i style="
            --h:${8 + Math.random() * 55}px;
            animation-delay:${i * -0.035}s
          "></i>`
      ).join('');

  }
}

/* =========================================================
   RECORD BUTTON
========================================================= */

$('#recordBtn')
  ?.addEventListener(
    'click',
    startRecording
  );

/* =========================================================
   SUBMIT BUTTON
========================================================= */

$('#submitBtn')
  ?.addEventListener(
    'click',
    () => {

      stopRecording(false);

      setTimeout(
        () => submitCaption(),
        400
      );

    }
  );

/* =========================================================
   SUBMIT CAPTION
========================================================= */

function submitCaption() {

  if (
    !recordedBlob ||
    !recordedUrl
  ) {

    toast(
      'You need to record a caption first.'
    );

    return;
  }

  toast(
    'Voice locked • anonymous submission created'
  );

  setTimeout(
    () => {

      buildVotes(
        recordedUrl
      );

      go('vote');

      mascotSay(
        'Four captions. One winner. Do not embarrass yourself.',
        '../assets/voicy/voicy.wav'
      );

    },
    550
  );
}

/* =========================================================
   PLAYER RECORDING
========================================================= */

function playPlayerRecording(
  url,
  button
) {

  if (!url) {
    return;
  }

  $$('.player-audio')
    .forEach(
      (audio) => {

        try {

          audio.pause();
          audio.currentTime = 0;

        } catch {}

      }
    );

  $$('.audio.playing')
    .forEach(
      (btn) => {

        btn.classList.remove(
          'playing'
        );

        btn.textContent = '▶';

      }
    );

  let audio =
    document.querySelector(
      `.player-audio[data-url="${CSS.escape(url)}"]`
    );

  if (!audio) {

    audio =
      document.createElement(
        'audio'
      );

    audio.className =
      'player-audio';

    audio.preload =
      'auto';

    audio.src =
      url;

    audio.dataset.url =
      url;

    audio.style.display =
      'none';

    document.body.appendChild(
      audio
    );

  }

  audio.currentTime = 0;

  audio.play().catch(
    (error) => {

      console.error(
        'Could not play player recording:',
        error
      );

      toast(
        'Could not play this recording.'
      );

    }
  );

  if (button) {

    button.classList.add(
      'playing'
    );

    button.textContent = '■';

    audio.addEventListener(
      'ended',
      () => {

        button.classList.remove(
          'playing'
        );

        button.textContent = '▶';

      },
      { once: true }
    );

  }
}

/* =========================================================
   VOTING
========================================================= */

function buildVotes(
  myRecordingUrl
) {

  const fakeCaptions = [

    'BRO WHAT IS HE LOOKING AT',

    'he just remembered he left the oven on',

    'me when someone says powerscaling',

    'that banana is judging my life choices'

  ];

  const anonymousSubmissions = [

    {
      text:
        fakeCaptions[0],
      audio:
        null
    },

    {
      text:
        fakeCaptions[1],
      audio:
        null
    },

    {
      text:
        fakeCaptions[2],
      audio:
        null
    },

    {
      text:
        'YOUR ANONYMOUS RECORDING',
      audio:
        myRecordingUrl
    }

  ];

  for (
    let i =
      anonymousSubmissions.length - 1;
    i > 0;
    i--
  ) {

    const j =
      Math.floor(
        Math.random() *
        (i + 1)
      );

    [
      anonymousSubmissions[i],
      anonymousSubmissions[j]
    ] = [
      anonymousSubmissions[j],
      anonymousSubmissions[i]
    ];

  }

  const list =
    $('#submissionList');

  if (!list) {
    return;
  }

  list.innerHTML =
    anonymousSubmissions
      .map(
        (
          submission,
          index
        ) => {

          const encodedText =
            encodeURIComponent(
              submission.text
            );

          const audioButton =
            submission.audio
              ? `
                <button
                  class="audio"
                  data-player-audio="${encodeURIComponent(
                    submission.audio
                  )}"
                  aria-label="Play anonymous recording"
                >
                  ▶
                </button>
              `
              : `
                <button
                  class="audio"
                  data-text="${encodedText}"
                  aria-label="Play caption"
                >
                  ▶
                </button>
              `;

          return `
            <div class="submission">

              <div class="num">
                ${String(index + 1).padStart(2, '0')}
              </div>

              <div>

                ${audioButton}

                <span class="sub-text">
                  ${escapeHtml(
                    submission.text
                  )}
                </span>

                <div class="sub-meta">
                  ANONYMOUS • ORIGINAL RECORDING
                </div>

              </div>

              <button
                class="vote"
                data-vote="${index}"
              >
                VOTE
              </button>

            </div>
          `;

        }
      )
      .join('');

  $$('.audio').forEach(
    (button) => {

      button.addEventListener(
        'click',
        () => {

          const playerAudio =
            button.dataset.playerAudio;

          if (playerAudio) {

            playPlayerRecording(
              decodeURIComponent(
                playerAudio
              ),
              button
            );

            return;
          }

          const text =
            decodeURIComponent(
              button.dataset.text ||
              ''
            );

          mascotSay(
            text,
            '../assets/voicy/voicy.wav'
          );

        }
      );

    }
  );

  $$('.vote').forEach(
    (button) => {

      button.addEventListener(
        'click',
        () => {

          $$('.vote').forEach(
            (voteButton) => {
              voteButton.disabled =
                true;
            }
          );

          button.classList.add(
            'selected'
          );

          toast(
            'Vote locked in'
          );

          setTimeout(
            () => {

              go('winner');

              mascotSay(
                'That one won. Congratulations.',
                '../assets/voicy/voicy.wav'
              );

            },
            500
          );

        }
      );

    }
  );
}

/* =========================================================
   ESCAPE HTML
========================================================= */

function escapeHtml(value) {

  return String(value)
    .replace(
      /[&<>"']/g,
      (character) => ({
        '&':
          '&amp;',
        '<':
          '&lt;',
        '>':
          '&gt;',
        '"':
          '&quot;',
        "'":
          '&#039;'
      })[character]
    );

}

/* =========================================================
   PACK STUDIO
========================================================= */

$('#publishPack')
  ?.addEventListener(
    'click',
    () => {

      const name =
        $('#packName')
          ?.value
          .trim() ||
        'Untitled Pack';

      const description =
        $('#packDescription')
          ?.value ||
        '';

      localStorage.setItem(
        'cc-pack',
        JSON.stringify({
          name,
          description,
          time: Date.now()
        })
      );

      toast(
        'PACK PUBLISHED ✦'
      );

      setTimeout(
        () => go('mypacks'),
        700
      );

      mascotSay(
        'Your pack is live.',
        '../assets/voicy/voicy.wav'
      );

    }
  );

$('#saveDraft')
  ?.addEventListener(
    'click',
    () => {

      const name =
        $('#packName')
          ?.value ||
        'Untitled Pack';

      localStorage.setItem(
        'cc-draft',
        name
      );

      toast(
        'Draft saved locally.'
      );

      mascotSay(
        'Draft saved.',
        '../assets/voicy/voicy.wav'
      );

    }
  );

/* =========================================================
   TUTORIAL
========================================================= */

$('#tutorialNext')
  ?.addEventListener(
    'click',
    () => {

      const lines = [

        'See an image. Easy.',

        'You get fifteen seconds.',

        'I play the original recordings. No fake voices.',

        'Then everyone votes.',

        'Highest score wins.'

      ];

      const button =
        $('#tutorialNext');

      let number =
        Number(
          button.dataset.n ||
          0
        ) + 1;

      button.dataset.n =
        number;

      const line =
        lines[
          Math.min(
            number - 1,
            lines.length - 1
          )
        ];

      if ($('#tutorialLine')) {

        $('#tutorialLine')
          .textContent =
          line;

      }

      mascotSay(
        line,
        '../assets/voicy/voicy.wav'
      );

    }
  );

/* =========================================================
   VOICY AUDIO TOGGLE
========================================================= */

$('#ttsButton')
  ?.addEventListener(
    'click',
    () => {

      mascotVoice =
        !mascotVoice;

      $('#ttsButton').innerHTML =
        `VOICY VOICE <em>${
          mascotVoice
            ? 'ON'
            : 'OFF'
        }</em>`;

      if (!mascotVoice) {
        stopMascotAudio();
      }

      toast(
        mascotVoice
          ? 'Voicy voice on'
          : 'Voicy voice off'
      );

    }
  );

/* =========================================================
   SETTINGS
========================================================= */

$$('.toggle').forEach(
  (toggle) => {

    toggle.addEventListener(
      'click',
      () => {

        toggle.classList.toggle(
          'on'
        );

      }
    );

  }
);

/* =========================================================
   DISCORD PROFILE
========================================================= */

function setDiscordProfile(
  user
) {

  const avatar =
    $('#discordAvatar');

  const displayName =
    $('#discordDisplayName');

  const username =
    $('#discordUsername');

  const connectButton =
    $('#connectDiscordBtn');

  if (
    !avatar ||
    !displayName ||
    !username ||
    !connectButton
  ) {
    return;
  }

  if (!user) {

    avatar.src =
      '../assets/mascot.png';

    displayName.textContent =
      'Not connected';

    username.textContent =
      'Connect Discord';

    connectButton.textContent =
      'CONNECT';

    connectButton.classList.remove(
      'connected'
    );

    return;
  }

  displayName.textContent =
    user.global_name ||
    user.username ||
    'Discord User';

  username.textContent =
    user.username
      ? `@${user.username}`
      : 'Discord account';

  if (user.avatar_url) {

    avatar.src =
      user.avatar_url;

  }

  connectButton.textContent =
    'CONNECTED';

  connectButton.classList.add(
    'connected'
  );

  connectButton.disabled =
    true;
}

/* =========================================================
   DISCORD CONNECT BUTTON
========================================================= */

const connectDiscordButton =
  $('#connectDiscordBtn');

if (connectDiscordButton) {

  connectDiscordButton.addEventListener(
    'click',
    async () => {

      try {

        connectDiscordButton.disabled =
          true;

        connectDiscordButton.textContent =
          'CONNECTING…';

        const result =
          await window.captionChaos
            .connectDiscord();

        if (
          !result ||
          !result.success
        ) {

          throw new Error(
            result?.error ||
            'Could not start Discord authorization.'
          );

        }

      } catch (error) {

        console.error(
          '[Caption Chaos] Discord connection failed:',
          error
        );

        connectDiscordButton.disabled =
          false;

        connectDiscordButton.textContent =
          'CONNECT';

        toast(
          'Discord connection could not be started.'
        );

      }

    }
  );

}

/* =========================================================
   DISCORD USER CALLBACK
========================================================= */

if (
  window.captionChaos?.onDiscordUser
) {

  window.captionChaos
    .onDiscordUser(
      (user) => {

        setDiscordProfile(
          user
        );

        toast(
          `Connected as ${
            user.global_name ||
            user.username
          }`
        );

      }
    );

}

/* =========================================================
   DISCORD ERROR CALLBACK
========================================================= */

if (
  window.captionChaos?.onDiscordError
) {

  window.captionChaos
    .onDiscordError(
      (message) => {

        console.error(
          '[Caption Chaos] Discord OAuth error:',
          message
        );

        const button =
          $('#connectDiscordBtn');

        if (button) {

          button.disabled =
            false;

          button.textContent =
            'CONNECT';

        }

        toast(
          'Discord authorization failed.'
        );

      }
    );

}

/* =========================================================
   CLEANUP
========================================================= */

window.addEventListener(
  'beforeunload',
  () => {

    clearInterval(timer);

    clearInterval(typeTimer);

    stopMascotAudio();

    if (
      mediaRecorder &&
      mediaRecorder.state !== 'inactive'
    ) {

      try {
        mediaRecorder.stop();
      } catch {}

    }

    if (mediaStream) {

      mediaStream
        .getTracks()
        .forEach(
          (track) =>
            track.stop()
        );

    }

    if (recordedUrl) {

      URL.revokeObjectURL(
        recordedUrl
      );

    }

  }
);

/* =========================================================
   STARTUP
========================================================= */

window.addEventListener(
  'load',
  () => {

    resetRound();

    setDiscordProfile(null);

    setTimeout(
      () => {

        mascotSay(
          'Welcome to Caption Chaos. I am Voicy.',
          '../assets/voicy/voicy.wav'
        );

      },
      900
    );

  }
);