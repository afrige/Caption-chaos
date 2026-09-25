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

**Scenes, not pages.** The hub is a board of large tiles. Each opens its
own screen. A round takes over the entire window with every scrap of
menu chrome hidden — no top bar, no footer, no nav.

    boot            title screen, footage behind it
      |
    hub             large tiles: Play / Studio / Library / How to Play
      |
    modes           difficulty, mode, custom rules
      |
    play            full-screen round, no chrome at all
      |
    vote            full-screen, no chrome
      |
    winner          full-screen, no chrome
      |
    next round      ...or back to the hub

Settings and Credits are modals reached from the top bar. The top bar
itself is only logo, credits, sign in and settings — there is no menu in
it, because the hub is the menu.

    src/index.html    markup for every scene
    src/style.css     tokens, components, animation
    src/renderer.js   scenes, rules, mic capture, voting, particles

Backgrounds are layered: an optional video, the generated animated loop,
a canvas particle field, then a tint and vignette pass so text stays
readable.

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

### Sign-in

`Sign in` opens a panel with Twitch and Gmail buttons plus a guest
option.

**Twitch and Gmail are UI only.** The buttons are wired to the visual
states you would expect and report that the backend is not connected yet.
Guest sign-in is real but local — it just writes to `localStorage`.

Discord sign-in in the bottom bar *is* fully wired to the existing OAuth
flow in `src/main.js`.

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
      media/
        hero.mp4            background footage (5 MB, 24s loop)
        hero-poster.jpg     first frame, used as the <video> poster
        hero-fallback.webp  generated loop, used if the mp4 is missing

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


=========================================================
 KNOWN GAPS
=========================================================

* **No `icon.ico`.** The build succeeds but logs `default Electron icon is
  used`, so the installer and taskbar use the stock Electron logo. Drop a
  256x256 `icon.ico` in the repository root to fix it.

* **Multiplayer is not wired to the client.** `server.js` broadcasts a
  player count over `ws://localhost:3000` and nothing in `renderer.js`
  connects to it yet. The "online" counter in the lobby is cosmetic.

* **`src/package.json` and `src/package-lock.json` are leftovers.** They
  duplicate the root config and are unused. `src/package.json` is excluded
  from the build via `!src/package.json` in `build.files`, but deleting
  both would be cleaner.

* **OAuth callback binds port 80** on `127.0.0.1` (`src/main.js`). That is
  fine on Windows, but anything already listening on port 80 will break
  Discord sign-in.
