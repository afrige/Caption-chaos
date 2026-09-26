Caption Chaos
─────────────

v1.0.0
✓ Desktop app
✓ Multiplayer
✓ Discord OAuth
✓ Discord Rich Presence
✓ Windows installer
✓ Animated title screen with looping video background
✓ Floating navbar, in-game HUD, procedural mascot + background art

v1.1.0
□ Better multiplayer
□ Custom packs
□ More game modes
□ Bug fixes
□ UI improvements


=========================================================
 RUNNING
=========================================================

    npm install
    npm start

`npm install` must be run from the repository root — that is the folder
holding `package.json`, not `src/`.

Optional, for the multiplayer WebSocket server:

    npm run server        # ws://localhost:3000


=========================================================
 BUILDING THE INSTALLER
=========================================================

    npm run build         # -> dist/Caption Chaos Setup 1.0.0.exe

If the repository lives inside a OneDrive-synced folder the build fails
with `EPERM ... rename 'dist\win-unpacked.tmp'`. OneDrive holds a lock
during packaging. Build somewhere else instead:

    npx electron-builder --config.directories.output=C:\build\caption-chaos

or pause OneDrive sync, or exclude the repository from sync.


=========================================================
 THE INTERFACE
=========================================================

Soft, cute, purple. The reference is a mobile game menu: big rounded
glassy tiles, pill buttons, small circular icon chips, lavender glow
instead of hard borders, and springy motion on everything you can touch.

Three colours: paper white, near-black, one purple. Cards are tinted and
sheened rather than see-through, so nothing you read competes with the
footage behind it.

**Scenes, not pages.** The hub is one board. Each row opens its own
screen. A round takes over the entire window with every scrap of menu chrome
hidden — no header, no footer, no nav.

    boot            title screen, footage behind it
      |
    hub             one board: play card + six rows
      |
    modes           difficulty, mode, custom rules
      |
    tour            getting started, Voicy in a dialogue box
      |           ten steps, each waiting on a real control
    practice        a real round with nobody in it
      |
    packs           build an image set
      |
    mypacks         everything you have published
      |
    profile         card, images, stats, badges, standings
      |
    settings        one page: mic, speech to text, privacy, audio,
                    gameplay, controls, interface, account
      |
    play            full-screen round, no chrome at all
      |
    vote            full-screen, no chrome
      |
    winner          full-screen, no chrome
      |
    summary         match result, full-screen
      |
    next round      ...or back to the hub

    src/index.html    markup for every scene
    src/style.css     tokens, components, animation
    src/renderer.js   scenes, rules, mic capture, voting, particles

Backgrounds are layered: an optional video, the generated animated loop,
a canvas particle field, then a tint and vignette pass so text stays
readable.

### The hub

One board for the things you press, and a headline that is not boxed. The
old hub scattered six tiles of three different sizes across the screen; it is
now a headline sitting straight on the background, with a single surface
underneath holding a wide Play card on the left and one uniform list of rows
on the right.

| Part | What it does |
|---|---|
| Headline | the title and pitch, unframed |
| Play | opens the mode screen, and reports your current rules |
| Quick pick | the four difficulties, one click, no detour |
| Pack Studio | build an image set |
| Library | everything you have published |
| Profile | your card, stats, badges, standings and images |
| How to play | the guided tour, with a practice round |
| Settings | everything below |
| Credits | who made this |

The headline is deliberately **outside** the board. When it was inside, the
title read as one more field in a panel instead of the loudest thing on the
page.

There is no seconds / players / packs / online strip. It was decorative, the
online figure was a random walk pretending to be a live player count, and
the mode screen and the Play card already state the real numbers. The
ticker that animated it went with it.

The Play card and the mode screen both read the same `rules` object, and
`setDifficulty` / `setMode` are the only things that write it. Two owners of
one selection is how the hub ends up saying Hard while the mode screen
still has Normal highlighted, so the selection has exactly one door.

### No top bar

There is no header. The stage owns the full width under the window chrome,
and the board is the hub — every sub-scene already had a Back button.

What the header used to hold is redistributed rather than dropped:

| Was | Now |
|---|---|
| logo | gone with the header; the board is the hub |
| Credits | a row on the board |
| Settings | already a row on the board |
| Sign in | in the footer, beside the account chip |

The footer briefly had two account controls side by side, which is clutter
and overlapping jobs, so they are split by state: **Sign in** shows only
while you are not linked in, and the account chip takes over once you are,
opening your profile. `isAccountLinked()` is the single owner of that
decision.

### Getting started

A ten-step tour that runs the first time you open the app, and from **How
to play** on the board afterwards.

**The tour is the dialogue box.** The same element at the bottom of the
screen, the same portrait, the same name row, the same typewriter that
Voicy's own lines use. There is exactly one dialogue box in the app: an
earlier version built the tour as a card in the page while the floating
box was still there underneath it, and two Voicys on screen at once looks
like a bug — because it was one. `setDialogueMode()` is the only thing
that switches the box between speech, a step, and the ending.

**The mascot is behind the panel.** It is a `z-index: -1` child of the
box, so the part standing above the top edge shows and the part that would
fall inside is painted over. No frame, no ring, no plate — a character at
a counter, not an avatar in a slot. That trick only works because the box
never sets `overflow`: a scroll container clips exactly the part that is
meant to show.

**Each step points at a real control and waits for you to use it.** A step
that says "press Play" disables its own Next button, because a Next button
on that step is an invitation to skip the very thing it is asking for.

**And it spawns a marker on that control.** A ring goes round the actual
Play button or the actual difficulty, positioned from the control's
rectangle, so "press Play" points at Play rather than describing it. If
the control is low on the screen the dialogue box docks to the top instead
of sitting on top of it, because a box covering the thing you are being
asked to click is the problem the marker was meant to solve.

| Step | Waits for |
|---|---|
| Introduction | Next |
| Difficulty | a difficulty on the board |
| Play | the Play card |
| Practice | opening the practice round |
| That is the whole loop | coming back from practice |
| Pack Studio | opening the studio |
| Library | opening the library |
| Profile | opening your profile |
| Settings | opening settings |
| Done | Finish |

The tour's click listener is in the **capture phase**. This is not a style
choice: the quick-pick re-renders itself on every difficulty change, and a
bubble-phase listener that runs after it finds `event.target` already
**detached**, so `closest('#quickDiff .quick-btn')` returns null and the
step silently never clears. Any delegated listener that runs after
something which rewrites its own container has this bug.

Completion is stored in `localStorage` under `cc-tour-done`, and **Run it
again** replays it.

### Practice round, and dictating your own voice

A real round with nobody in it. No timer, no vote, no score, and no call
into `recordMatch`, so a first recording costs nothing.

**Dictation is the default path.** Press **Dictate**, talk, and the words
appear as you say them. This is deliberately separate from the game's
caption path, and it is why the practice round leads with it:

> `transcribeBlob()` has to *refuse* the browser engine, because Web Speech
> cannot read a finished file — it only listens to the live stream. But
> dictation **is** the live stream, so the browser engine handles it
> perfectly and needs no endpoint, no server and no setup.

The privacy position is unchanged and still true, and it is printed next to
the button that starts it: with the browser engine your audio goes to a
remote recogniser. The custom endpoint in Settings is the local option,
and it is what **Record instead** uses.

### The mic check

A level meter cannot tell a quiet room from a dead microphone — both just
sit at zero. So the meter is paired with a verdict in words, computed from
a rolling history of loudness rather than one sample:

| Verdict | What it means |
|---|---|
| Not listening yet | nothing has been measured |
| Hearing nothing | peak under −55 dBFS: check the input device |
| Something is there but quiet | a floor under −48 dBFS: speak closer or raise the gain |
| Hearing you | a normal speaking level |

When a recording produces no words, the verdict decides which of the two
failed. If the mic is clearly picking you up, the app says so and points
at the recogniser instead of sending you to fiddle with input settings —
which is usually the wrong thing to go and do.

### The hidden attribute

`[hidden] { display: none !important; }` is in the reset, and it is load
bearing. This file sets `display` on nearly everything, and an explicit
author `display` beats the user-agent rule for `[hidden]` — so toggling
`el.hidden` on a panel did nothing at all.


### Look and feel

The style is **solid, not neon**. A panel is a colour with a defined edge
and a real drop shadow; it is never a pane of glass with light bleeding out
of it. Concretely:

* No coloured halos anywhere. `--glow` is named for backwards compatibility
  but is now an ordinary neutral shadow. A scripted pass removed every
  `box-shadow`, `text-shadow` and `drop-shadow` layer with a blur over 18px,
  and the purple bloom behind the logo and the 44px pulsing glow on the boot
  mascot are gone.
* Corners are small — 3, 4, 6, 8 and 10px. Pills are kept only where round
  is the point: toggle switches, level meters, status dots, progress bars,
  slider thumbs, keycaps and waveform bars. 27 panels, cards and buttons
  moved off pills onto small corners.
* The top bar is transparent. No background, no backdrop blur, no bottom
  border — just a soft downward scrim for legibility, and borderless buttons
  that tint on hover. The account button keeps a fill because it is the one
  control in the bar that leads somewhere you made.
* Icon glyphs are inline SVG. The packaged app has no colour emoji font, so
  every emoji rendered as a blank white circle.

### Profile

Reached from the account button in the top bar, the account chip in the
footer, or the hub tile. Before you sign in, the account button opens the
sign-in popover instead.

| Part | What it holds |
|---|---|
| Banner and avatar | six accent gradients, six built-in avatars, or your own images |
| Name, handle, pronouns, region, title | editable, 24 to 40 characters each |
| Bio | 160 characters, live counter |
| Picture and banner | imported from disk, see below |
| Statistics | matches, wins, win rate, captions, best score, level |
| Achievements | twelve badges with real progress bars |
| Recent matches | the last twelve, with relative timestamps |
| Standings | the season podium and table, folded in from its own scene |
| What the room sees | the anonymity note, restated where you edit |

Everything is stored in `localStorage` under `cc-profile` and never leaves
the machine. Level is derived from wins plus captions, so it cannot drift
from the stats.

#### Your own picture and banner

The editor has a **Choose picture** and a **Choose banner** button. Both
open a normal file dialog, and both are centre-cropped and resized **in the
browser** before anything is stored.

That resize is not a nicety. `localStorage` caps at roughly 5MB for the
whole origin, and a modern phone photo is several megabytes on its own — a
data URL of a 12MP image is about 20MB of text, which is enough to lock
every write to storage. A 256px picture lands at about twenty kilobytes and
a 1200×280 banner at about a hundred, so the whole profile stays a few
hundred KB whatever you drop in. WebP is used, with JPEG as the fallback.

Uploaded images are staged until you press Save, so Cancel really cancels.
If a save does fail on a full quota, the previous images are put back rather
than lost, and you get a message instead of a raw `QuotaExceededError`.

An uploaded picture takes over from the built-in avatar everywhere at once —
the profile card, the top bar and the footer chip all read `avatarSource()`,
which is the only place that answers that question.

The twelve badges are measured against the profile counters rather than
being hardcoded, so they move as you actually play:

| Badge | Earned by |
|---|---|
| First take | one caption recorded |
| Room reader | 50 captions |
| Room legend | 250 captions |
| Sharp shooter | a win on Hard |
| Speed demon | a win on Nightmare |
| Blitzed | a win on Blitz |
| Ten in a row | ten wins without a loss |
| Clean sheet | a whole match won |
| Night owl | a match played between 1am and 5am |
| Pack author | one pack published |
| Prolific | ten packs published |
| Full house | every other badge |

### Pack Studio and Library

The image tray is real: **Add image** appends a card, the × on a card
removes it, and the count tracks both. Publishing writes to `cc-packs`
and the Library renders from that list, newest first, with a Remove
button per pack. Publishing also feeds the pack badges.

### Settings

One scrolling page, not a set of screens. A sticky rail on the left jumps
between eight sections and follows the scroll position:

| Section | What is in it |
|---|---|
| Microphone | input and output devices, level, mic test, gain, gate |
| Voice to text | the transcription engine and its test |
| Privacy | the anonymity switches and the live status |
| Audio | Voicy voice, master volume, blips, UI sounds |
| Gameplay | default difficulty and mode, countdown, warnings |
| Controls | every keybinding, rebindable |
| Interface | motion, backdrop, particles, scale |
| Account | Discord link, reset |

### Sound check

The sound check is the first section of the unified settings page rather
than a screen of its own. Real device enumeration and a real analyser —
nothing in it is mocked. It lists every `audioinput` and `audiooutput` the
system reports, runs an `AnalyserNode` over the live stream and draws a VU
meter, a peak hold, a rolling noise floor and a waveform scope.

    Devices     pick an input and an output; output uses setSinkId where
                the browser supports it
    Level       VU meter, peak hold, dBFS readout, noise floor
    Mic test    record five seconds, play it straight back, hear
                yourself live with the monitor switch

Mic level only rises above the noise gate, so the meter stays honest in a
quiet room. Choices are remembered in `localStorage`.

Because browsers only expose real device *labels* after permission is
granted, the page asks for the microphone once on load. Deny it and you
still get the list, just with generic names.

### Voice to text

The game turns a recording into a caption. The test panel runs whichever
engine is selected and shows the result, the elapsed time and — the part
that matters — what left the machine.

| Engine | Needs | Audio leaves the device? |
|---|---|---|
| Browser (Web Speech) | nothing | yes, to the remote recogniser |
| Custom endpoint | a URL you control | only as far as that URL |

The endpoint engine posts a multipart form with `file` and
`model=whisper-1`, so a local Whisper server is one field away. Point it
at `http://localhost:8000/v1/audio/transcriptions` or anywhere else and
the privacy card switches to *Transcript only, on device* when the host
is local.

### Privacy and anonymity

Submissions are anonymous to the room. Four switches keep it that way, and
the card at the top of the section states the current position in plain
words rather than a row of ticks:

* **Share transcript, not audio** — players get words, never your voice
* **New anonymous handle each round** — a player cannot link round one to
  round five
* **Voiceprint guard** — flags a caption that sounds like one you already
  submitted this round
* **Wipe local buffer on exit** — clears drafts and the mic test

The voiceprint guard is the real implementation behind the third one. It
decodes each recording, reduces it to a coarse 12-band zero-crossing
fingerprint and compares it against the ones already in the round. Above
0.93 similarity it warns you and says which caption it matched. Fingerprints
are tagged with a salt that rotates per match, so the app's own stored
records cannot be joined across rounds either.

**Where a caption can still leak.** A cloud transcription engine receives
your audio, so it — not you — is the only party that never hears it; use an
on-device engine if that matters. And voiceprints are the other hole: two
captions from the same throat in the same room can be matched by ear. The
guard checks for that, but it is a warning, not a wall. The section says
so on screen.

### Controls

Click any keycap to rebind it, and the binding is stored by
`KeyboardEvent.code` so it stays on the same physical key across layouts.
Shortcuts are suppressed while you are typing in a field.

| Action | Default |
|---|---|
| Start recording | Space |
| Submit caption | Enter |
| Replay selection | R |
| Vote for a caption | V |
| Next round | N |
| Toggle mic monitor | M |
| Transcribe caption | T |
| Skip Voicy | Esc |

`ACTIONS` near the bottom of `renderer.js` is the whole table — add a row
and it appears in the UI and starts working.

### Difficulty, modes and custom rules

Four difficulties, each a preset:

| | rounds | seconds | players | chaos |
|---|---|---|---|---|
| Easy | 5 | 20 | 4 | 0 |
| Normal | 5 | 15 | 4 | 25 |
| Hard | 7 | 10 | 6 | 55 |
| Nightmare | 10 | 7 | 8 | 100 |

Four modes layered on top. Classic changes nothing, Blitz halves the
timer, Turn trims it slightly, and Custom hands you the wheel:

* rounds, seconds and players as steppers
* a chaos slider, which decides how many submissions come back to vote on
* toggles for anonymous submissions and playback

Custom overrides the difficulty preset. The rules are applied for real —
the round strip, the countdown and the submission count all read from
them. `DIFFICULTIES`, `MODES` and `LIMITS` at the top of `renderer.js` are
the whole system; add a row to any of them and a new card appears.

### How a round runs

3-2-1 countdown, then the prompt. Record your real voice, submit it
anonymously, listen to the room, vote. Voting for your own caption scores
a point. When the last round ends you land on a match summary with wins,
rounds played, hit rate and a score.

### Leaderboard

Cosmetic — there is no backend. The data lives in `BOARD` near the bottom of
`renderer.js`; edit the array and the screen rebuilds.

The standings are now a panel **inside Profile** rather than a scene of
their own. A season table is player data, so it belongs beside the stats and
the badges; that is the "combine pages" pass.

The achievements are **not** cosmetic. They live inside Profile and read the
profile counters, so they move as you play. See [Profile](#profile).

The podium and the badge icons are inline SVG, not emoji.

### Sign-in

`Sign in` opens a panel with Twitch and Gmail buttons plus a guest
option.

**Twitch and Gmail are UI only.** The buttons are wired to the visual
states you would expect and report that the backend is not connected yet.
Guest sign-in is real but local — it just writes to `localStorage`.

Discord sign-in in the bottom bar *is* fully wired to the existing OAuth
flow in `src/main.js`.

`isAccountLinked()` decides whether the account button opens your profile
or the sign-in popover. It returns true for a guest sign-in, a linked
Discord account, or simply having named yourself in the profile editor —
because a player who has filled in a name has locked in an identity even
if they never pressed a sign-in button. It reads `localStorage` directly
rather than the `profile` object, which is declared much later in the
file and would be in its temporal dead zone that early.

`setDiscordProfile` is the single owner of the footer chip. When Discord is
unlinked it shows your local profile, and when Discord is linked the
profile module's repaint will not take it back.

### Reduced motion

`Settings -> Reduced motion` stops the animations and empties the
particle field. The OS-level `prefers-reduced-motion` setting is honoured
too.


=========================================================
 ART ASSETS
=========================================================

    assets/
      Mascot.png            Voicy, supplied art
      Mascot-Text.png       wordmark, supplied art
      Icons/                nav and section icons, supplied plus generated
      media/
        hero.mp4            background footage (5 MB, 24s loop)
        hero-poster.jpg     first frame, used as the <video> poster
        hero-fallback.webp  generated loop, used if the mp4 is missing

### Icons

`assets/Icons` holds a set of thick rounded bubble outlines on a 246x259
canvas: `play`, `home`, `studio`, `library`, `questionmark`, `favorite`,
plus `mic`, `settings`, `trophy`, `medal` and `chart` generated by
`tools/generate-icons.py` to match the supplied style.

    pip install pillow
    python tools/generate-icons.py

Keep the strokes chunky but the shapes large and simple — at that
thickness a busy shape fills in solid and stops reading as an outline.
Shapes are polylines, and bowl arcs must run 180° → 360° so they start
on the left edge and end on the right; anything else crosses the path and
fills.

### The background footage

`assets/media/hero.mp4` is a 24 second seamless loop cut from
*"Beauty Of Nature | Drone Aerial View"* — free stock footage, no
copyright:

    https://youtu.be/RK1RRVR9A2g

The raw clip is 42 minutes of 4K drone footage, far too much to ship, so
it is trimmed, graded to monochrome and re-encoded:

* a 24 second slice from the aerial foam section, which is the most
  graphic part of the footage once desaturated
* converted to greyscale and contrast-adjusted, because the app is a
  black-and-white caption game and a colourful plate fights the UI
* the last two seconds crossfade into a reversed copy of the first two, so
  the final frame matches the opening frame and the loop has no seam
  (verified: first/last frames differ by 6.6/255, against 34/255 between
  ordinary adjacent frames)
* H.264, 1280x720, no audio track, ~5 MB

To rebuild it, or to pick a different part of the footage:

    pip install yt-dlp imageio-ffmpeg
    python tools/fetch-background-video.py

`START` and `LENGTH` at the top of that file control the slice. Good
alternatives: the lavender fields around 25 minutes, the sea stacks around
19 minutes. Avoid the wildlife and beach sections — they read as literal
scenery and sit too busy behind text.

### The fallback loop

If `hero.mp4` is missing, the renderer falls back to
`hero-fallback.webp`, a generated dark plate — one slow drifting light,
faint out-of-focus blobs and animated grain. No stars:

    pip install numpy pillow
    python tools/generate-background.py

There is no broken state either way; the renderer probes for the mp4 and
keeps the webp if it will not load.

### Grading the backdrop

The footage is already monochrome, so the CSS filter only pushes it back
far enough for type to read. One line in `style.css`:

```css
.backdrop-media {
    filter: grayscale(1) contrast(1.10) brightness(0.46);
}
```

Raise `brightness` to let more of the nature through, lower it if text
ever struggles. `.boot::before` is the scrim that darkens the middle of
the title screen.

### Mascot voice

`assets/voicy/voicy.wav` does not exist in the repo, so Voicy's spoken
lines are silent — the typewriter text and mouth animation still work. The
per-character blips are not affected: those are synthesised with WebAudio
in `renderer.js`, so they sound out of the box. Drop a real recording at
`assets/voicy/voicy.wav` to give Voicy a voice.


=========================================================
 DEV TOOLS
=========================================================

Screenshot the running renderer over the Chrome DevTools Protocol, which
avoids whatever else is on screen:

    # terminal 1 - start the app with debugging enabled
    npx electron . --remote-debugging-port=9222

    # terminal 2
    node tools/dev-screenshot.cjs out.png "#bootEnter" 3000
    node tools/dev-screenshot.cjs out.png "js:go('vote');"

The third argument is a selector to click before capturing (with an
optional wait in ms as the fourth). Prefix it with `js:` to run arbitrary
JavaScript in the renderer instead.

Report the first uncaught exception during startup. `Runtime.exceptionThrown`
has to be enabled *before* the page loads, so this tool relaunches the app
itself:

    node tools/find-boot-error.cjs

Evaluate an expression against an app that is already running on a given
debug port. Read-only, no screenshot, and it can target the packaged build
— which is the only way to catch an asset path that works in the source
tree but 404s inside the asar:

    node tools/eval-app.cjs 9333 check.js

Check every asset reference in the source against the real filenames on
disk, case included:

    node tools/check-asset-paths.cjs

This one matters more than it looks. Windows is case-insensitive, so
`../assets/mascot.png` happily loads in the source tree even though the
file is `Mascot.png`. Inside the asar, lookups are case-sensitive and the
image silently fails. The checker found 21 of these; all are fixed.


=========================================================
 KNOWN GAPS
=========================================================

* **No `icon.ico`.** The build succeeds but logs `default Electron icon is
  used`, so the installer and taskbar use the stock Electron logo. Drop a
  256x256 `icon.ico` in the repository root to fix it.

* **Multiplayer is not wired to the client.** `server.js` broadcasts a
  player count over `ws://localhost:3000` and nothing in `renderer.js`
  connects to it yet, so the room is always local. The hub's fake online
  counter has been removed rather than left standing.

* **`src/package.json` and `src/package-lock.json` are leftovers.** They
  duplicate the root config and are unused. `src/package.json` is excluded
  from the build via `!src/package.json` in `build.files`, but deleting
  both would be cleaner.

* **OAuth callback binds port 80** on `127.0.0.1` (`src/main.js`). That is
  fine on Windows, but anything already listening on port 80 will break
  Discord sign-in.

* **Voicy has no voice.** `assets/voicy/voicy.wav` does not exist, so the
  mascot's spoken lines are silent. The failure is handled — a missing
  file clears the talking state instead of leaving it stuck — and the UI
  blips are synthesised in WebAudio, so they are unaffected. Drop a
  `voicy.wav` at that path to give Voicy a voice.

