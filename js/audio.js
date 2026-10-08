// Sample-based audio: one music bed plus recorded sound effects (see assets/audio/LICENSES.md).
const FILES = {
  music: 'music.mp3',
  coin: 'coin.mp3', coin2: 'coin2.mp3',
  whoosh: 'whoosh.mp3', jump: 'jump.mp3', land: 'land.mp3', roll: 'roll.mp3',
  crash: 'crash.mp3', thud: 'thud.mp3', wasted: 'wasted.mp3', busted: 'busted.mp3',
  siren: 'siren.mp3', heli: 'heli.mp3', horn: 'horn.mp3', star: 'star.mp3', waves: 'waves.mp3',
};

export class Sound {
  constructor(base) { this.base = base; this.buf = {}; this.ready = false; this.muted = false; this.loops = {}; }

  async load(onProgress) {
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();
    const c = this.ctx;
    this.master = c.createGain(); this.master.gain.value = 0.9;
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -10; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.15;
    this.master.connect(comp); comp.connect(c.destination);
    this.musicBus = c.createGain(); this.musicBus.gain.value = 0.62;
    this.musicFilter = c.createBiquadFilter(); this.musicFilter.type = 'lowpass'; this.musicFilter.frequency.value = 20000;
    this.musicBus.connect(this.musicFilter); this.musicFilter.connect(this.master);
    this.sfx = c.createGain(); this.sfx.gain.value = 0.85; this.sfx.connect(this.master);
    const names = Object.keys(FILES); let done = 0;
    await Promise.all(names.map(async (n) => {
      try {
        const r = await fetch(this.base + FILES[n]);
        const ab = await r.arrayBuffer();
        this.buf[n] = await new Promise((res, rej) => c.decodeAudioData(ab, res, rej));
      } catch (e) { console.warn('audio', n, e); }
      onProgress && onProgress(++done / names.length);
    }));
    this.ready = true;
  }

  unlock() { if (this.ctx && this.ctx.state !== 'running') this.ctx.resume(); }
  get t() { return this.ctx.currentTime; }

  play(name, { vol = 1, rate = 1, pan = 0, when = 0, offset = 0, dur } = {}) {
    if (!this.ready || !this.buf[name]) return null;
    const c = this.ctx; const s = c.createBufferSource(); s.buffer = this.buf[name]; s.playbackRate.value = rate;
    const g = c.createGain(); g.gain.value = vol;
    let node = g;
    if (pan && c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = pan; g.connect(p); node = p; }
    s.connect(g); node.connect(this.sfx);
    s.start(this.t + when, offset, dur);
    return { s, g };
  }

  // Looping bed whose volume the game sets every frame (siren, helicopter, waves).
  loop(name, bus) {
    if (!this.ready || !this.buf[name]) return null;
    if (this.loops[name]) return this.loops[name];
    const c = this.ctx; const s = c.createBufferSource(); s.buffer = this.buf[name]; s.loop = true;
    const g = c.createGain(); g.gain.value = 0;
    const p = c.createStereoPanner ? c.createStereoPanner() : null;
    s.connect(g); if (p) { g.connect(p); p.connect(bus || this.sfx); } else g.connect(bus || this.sfx);
    s.start(this.t);
    return (this.loops[name] = { s, g, p });
  }

  setLoop(name, vol, pan = 0, rate) {
    const l = this.loops[name] || this.loop(name); if (!l) return;
    l.g.gain.setTargetAtTime(vol, this.t, 0.08);
    if (l.p) l.p.pan.setTargetAtTime(Math.max(-1, Math.min(1, pan)), this.t, 0.1);
    if (rate) l.s.playbackRate.setTargetAtTime(rate, this.t, 0.1);
  }

  startMusic(offset) {
    this.stopMusic();
    if (!this.ready || !this.buf.music) return;
    const c = this.ctx; const s = c.createBufferSource(); s.buffer = this.buf.music; s.loop = true;
    s.connect(this.musicBus);
    this.musicBus.gain.cancelScheduledValues(this.t); this.musicBus.gain.setValueAtTime(0.62, this.t);
    this.musicFilter.frequency.cancelScheduledValues(this.t); this.musicFilter.frequency.setValueAtTime(20000, this.t);
    s.start(this.t, offset || 0);
    this.music = s;
  }

  stopMusic() { if (this.music) { try { this.music.stop(); } catch (e) {} this.music = null; } }

  // WASTED: the beat slows down and goes muffled, like the game's death slow-mo.
  slowMo() {
    if (!this.music) return;
    const t = this.t;
    this.music.playbackRate.setValueAtTime(1, t); this.music.playbackRate.linearRampToValueAtTime(0.55, t + 0.9);
    this.musicFilter.frequency.setValueAtTime(20000, t); this.musicFilter.frequency.exponentialRampToValueAtTime(500, t + 0.8);
    this.musicBus.gain.setValueAtTime(0.62, t); this.musicBus.gain.linearRampToValueAtTime(0.3, t + 1.2);
  }

  setMuted(m) { this.muted = m; this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.t, 0.05); }
}
