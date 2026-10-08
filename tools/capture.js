// Frame-accurate gameplay capture with a virtual clock (see vclock.js).
// Usage: node tools/capture.js <url> <outDir> <seconds> [--bot tools/bot.js] [--w 540 --h 675 --dpr 2]
//        [--sub 2] [--noshot] [--stopAt 9999] [--start '#playBtn'] [--seed 1] [--audio] [--shots "0-90"]
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const argv = process.argv.slice(2);
const flags = {}; const pos = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith('--')) { const k = argv[i].slice(2); const v = argv[i + 1]; if (v === undefined || v.startsWith('--')) flags[k] = true; else { flags[k] = v; i++; } }
  else pos.push(argv[i]);
}
const [url, outDir, secs] = pos;
const W = +(flags.w || 540), H = +(flags.h || 675), DPR = +(flags.dpr || 2), FPS = 30, SUB = +(flags.sub || 2);
const NOSHOT = !!flags.noshot;
const SHOTS = flags.shots ? String(flags.shots).split(',').map((r) => r.split('-').map(Number)) : null;
const wantShot = (f) => !NOSHOT && (!SHOTS || SHOTS.some(([a, b]) => f >= a && f <= b));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/google-chrome', headless: true, protocolTimeout: 900000,
    args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--font-render-hinting=none', '--autoplay-policy=no-user-gesture-required'],
  });
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 300)); });
  await page.setViewport({ width: W, height: H, deviceScaleFactor: DPR, isMobile: true, hasTouch: true });
  if (flags.seed) {
    await page.evaluateOnNewDocument((s) => { let x = s >>> 0 || 1; Math.random = () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; }; }, +flags.seed);
  }
  await page.evaluateOnNewDocument(fs.readFileSync(path.join(__dirname, 'vclock.js'), 'utf8'));
  // emulation fires a stray resize at a render-speed-dependent moment; ignore it
  await page.evaluateOnNewDocument(() => {
    for (const ev of ['resize', 'orientationchange']) window.addEventListener(ev, (e) => e.stopImmediatePropagation(), true);
  });
  await page.evaluateOnNewDocument((s) => { window.__audioSecs = s; }, +secs + 15);
  await page.evaluateOnNewDocument(fs.readFileSync(path.join(__dirname, 'offaudio.js'), 'utf8'));
  await page.goto(url, { waitUntil: 'load', timeout: 120000 });

  // boot: step the virtual clock until the game reaches the title screen
  const step = 1000 / (FPS * SUB);
  for (let i = 0; i < 300 * SUB; i++) {
    await page.evaluate((s) => window.__vstep(s), step);
    const st = await page.evaluate(() => (window.VS ? window.VS.state : 'loading'));
    if (st === 'title') break;
    if (i % (30 * SUB) === 0) console.log('booting…', i / SUB / FPS, 's vt');
  }
  const bootState = await page.evaluate(() => (window.VS ? window.VS.state : 'loading'));
  if (bootState !== 'title') { console.error('boot failed, state=', bootState); await browser.close(); process.exit(1); }
  // let the title settle a moment
  for (let i = 0; i < 20 * SUB; i++) await page.evaluate((s) => window.__vstep(s), step);
  fs.mkdirSync(outDir, { recursive: true });
  if (!NOSHOT) await page.screenshot({ path: path.join(outDir, 'title.jpg'), type: 'jpeg', quality: 92 });
  await page.evaluate(() => document.getElementById('playBtn').click());
  const startVt = await page.evaluate(() => window.__vtime());
  if (flags.bot) {
    await page.evaluate(fs.readFileSync(flags.bot, 'utf8'));
    await page.evaluate((s) => { window.__botCfg.stopAt = s; }, +(flags.stopAt || 1e9));
  }
  const total = Math.round(+secs * FPS);
  const log = [];
  for (let f = 0; f < total; f++) {
    for (let s = 0; s < SUB; s++) {
      const key = await page.evaluate((tt, st2, useBot) => {
        let k = null;
        if (useBot) {
          try { k = window.__bot(tt); } catch (e) { k = 'ERR:' + e.message; }
          if (k && !k.startsWith('ERR:')) {
            window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
            window.dispatchEvent(new KeyboardEvent('keyup', { key: k, bubbles: true }));
          }
        }
        window.__vstep(st2);
        return k;
      }, (f * SUB + s) / (FPS * SUB), step, !!flags.bot);
      if (key && key.startsWith('ERR:')) errs.push('bot ' + key);
    }
    const st = await page.evaluate(() => ({ s: VS.state, st: VS.stars, d: Math.floor(VS.dist), c: VS.cash, dk: VS.deathKind, cop: +VS.copDist.toFixed(1) }));
    st.f = f; log.push(st);
    if (st.s === 'dying' && !log.some((x) => x.diag)) {
      st.diag = await page.evaluate(() => ({ P: { lane: VS.PL.lane, x: +VS.PL.x.toFixed(2), y: +VS.PL.y.toFixed(2), roll: +VS.PL.rolling.toFixed(2), og: VS.PL.onGround },
        near: VS.course.obs.filter((o) => Math.abs(o.z - VS.PL.z) < 10)
          .map((o) => ({ t: o.type, n: o.name, l: o.lane, z: +o.z.toFixed(2), vz: o.vz || 0, h: +o.h.toFixed(2) })) }));
      console.log('DEATH', JSON.stringify(st.diag));
    }
    if (wantShot(f)) await page.screenshot({ path: path.join(outDir, `f${String(f).padStart(4, '0')}.jpg`), type: 'jpeg', quality: 92 });
    if (f % 150 === 0) console.log('frame', f, JSON.stringify(st));
    if (st.s === 'over' && log.filter((x) => x.s === 'over').length > 45) break;
  }
  fs.writeFileSync(path.join(outDir, 'log.json'), JSON.stringify(log));
  if (flags.audio) {
    const endSec = (startVt + log.length * 1000 / FPS) / 1000 + 0.5;
    const n = await page.evaluate((a, b) => window.__renderAudio(a, b), startVt / 1000, endSec);
    const parts = [];
    for (let off = 0; off < n; off += 4 << 20) parts.push(Buffer.from(await page.evaluate((o, l) => window.__pcmChunk(o, l), off, 4 << 20), 'base64'));
    const pcm = Buffer.concat(parts);
    const hdr = Buffer.alloc(44);
    hdr.write('RIFF', 0); hdr.writeUInt32LE(36 + pcm.length, 4); hdr.write('WAVE', 8); hdr.write('fmt ', 12);
    hdr.writeUInt32LE(16, 16); hdr.writeUInt16LE(1, 20); hdr.writeUInt16LE(2, 22); hdr.writeUInt32LE(44100, 24);
    hdr.writeUInt32LE(44100 * 4, 28); hdr.writeUInt16LE(4, 32); hdr.writeUInt16LE(16, 34); hdr.write('data', 36); hdr.writeUInt32LE(pcm.length, 40);
    fs.writeFileSync(path.join(outDir, 'game-audio.wav'), Buffer.concat([hdr, pcm]));
    console.log('audio written', (pcm.length / 4 / 44100).toFixed(2), 's');
  }
  const deathAt = log.find((x) => x.s === 'dying');
  console.log('done frames', log.length, 'death at', deathAt ? deathAt.f / FPS : 'none', deathAt && deathAt.dk, 'maxStars', Math.max(...log.map((x) => x.st)), 'errors', JSON.stringify(errs.slice(0, 10)));
  await browser.close();
})();
