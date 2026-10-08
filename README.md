# Vice Surfers

GTA x Subway Surfers: an endless 3D run down a sunset Ocean Drive, in the browser.

**Play:** https://karanchoudharyyt-source.github.io/Vice-Surfers/

Dodge traffic, grab cash, and survive the wanted level: oncoming traffic at 2 stars,
police roadblocks at 3, a chopper with a searchlight and oncoming cruisers at 4,
maximum heat at 5. One mistake and
you're WASTED; stumble twice with the cop on your heels and you're BUSTED.

The v1 one-prompt, single-file build is preserved at
[/classic/](https://karanchoudharyyt-source.github.io/Vice-Surfers/classic/).

## Controls

- Phone: swipe left/right to change lanes, up to jump, down to roll.
- Desktop: arrow keys or WASD. P pauses, M mutes.

## Tech

- [Three.js](https://threejs.org) (r170), no build step: ES modules and an import map.
- Curved-world vertex shader, sunset sky shader with PMREM environment reflections,
  bloom + film grade post-processing, soft shadows.
- Character and animations: [Quaternius](https://quaternius.com) Universal Base
  Character + UAL animation library (CC0), retextured in-shader (Hawaiian shirt,
  jeans, sneakers, sunglasses).
- Vehicles: [Kenney](https://kenney.nl) Car Kit (CC0) with a clearcoat paint material.
- Music: "Legends" by Holizna via OpenGameArt (CC0). Sound effects: Mixkit
  (Mixkit SFX Free License) and Kenney (CC0). See `assets/audio/LICENSES.md`.
- Fonts: Anton, Mr Dafoe, Rubik (SIL Open Font License 1.1, see `assets/fonts/LICENSE.md`).
- The demo video was recorded with a deterministic capture harness (virtual clock,
  offline audio render, and a lane-dodging bot) in headless Chrome. See `tools/`:

  ```
  node tools/capture.js "http://localhost:8080/index.html?seed=7" out 80 \
    --bot tools/bot.js --w 540 --h 675 --dpr 2.5 --audio
  ```

  Needs `puppeteer-core` and a local Chrome. Frames come out as JPEGs plus
  `game-audio.wav`; mux them with ffmpeg.
