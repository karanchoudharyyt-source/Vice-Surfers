// Replaces the page's AudioContext with an OfflineAudioContext that follows the virtual clock
// (vclock.js must be injected first). The game's own music and sound effects get scheduled
// on the virtual timeline, so they can be rendered to a WAV that is frame-synced with the capture.
(() => {
  const SR = 44100, SECS = window.__audioSecs || 200;
  class VirtualAudioContext extends OfflineAudioContext {
    constructor() { super(2, SR * SECS, SR); window.__offAC = this; }
    get currentTime() { return window.__vtime() / 1000; }
    get state() { return 'running'; }
    resume() { return Promise.resolve(); }
    suspend() { return Promise.resolve(); }
    close() { return Promise.resolve(); }
  }
  window.AudioContext = VirtualAudioContext;
  window.webkitAudioContext = VirtualAudioContext;
  window.__renderAudio = async (fromSec, toSec) => {
    const buf = await window.__offAC.startRendering();
    const a = Math.floor(fromSec * SR), b = Math.min(buf.length, Math.floor(toSec * SR));
    const n = b - a, L = buf.getChannelData(0), R = buf.getChannelData(1);
    const pcm = new Int16Array(n * 2);
    for (let i = 0; i < n; i++) {
      pcm[2 * i] = Math.max(-1, Math.min(1, L[a + i])) * 32767;
      pcm[2 * i + 1] = Math.max(-1, Math.min(1, R[a + i])) * 32767;
    }
    window.__pcm = new Uint8Array(pcm.buffer);
    return window.__pcm.length;
  };
  window.__pcmChunk = (off, len) => {
    let s = ''; const end = Math.min(window.__pcm.length, off + len);
    for (let i = off; i < end; i += 0x8000) s += String.fromCharCode.apply(null, window.__pcm.subarray(i, Math.min(end, i + 0x8000)));
    return btoa(s);
  };
})();
