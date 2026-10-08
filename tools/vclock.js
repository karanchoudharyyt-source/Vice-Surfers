// Injected before any page script runs. Replaces the page's clocks with a virtual
// clock so a slow software renderer can capture smooth 30 fps footage frame by frame.
// The game code itself is untouched; window.__vstep(ms) advances time.
(() => {
  let vt = 0;
  const base = Date.now();
  const realPerfNow = performance.now.bind(performance);
  performance.now = () => vt;
  const RealDate = Date;
  Date.now = () => base + vt;

  let rafId = 0;
  let rafQ = new Map();
  window.requestAnimationFrame = (cb) => { rafQ.set(++rafId, cb); return rafId; };
  window.cancelAnimationFrame = (id) => { rafQ.delete(id); };

  let tId = 1e6;
  const timers = new Map();
  const realSetTimeout = window.setTimeout.bind(window);
  window.setTimeout = (fn, ms = 0, ...args) => {
    const id = ++tId;
    timers.set(id, { at: vt + Math.max(0, +ms || 0), fn, args, every: 0 });
    return id;
  };
  window.setInterval = (fn, ms = 0, ...args) => {
    const id = ++tId;
    const every = Math.max(1, +ms || 1);
    timers.set(id, { at: vt + every, fn, args, every });
    return id;
  };
  window.clearTimeout = window.clearInterval = (id) => { timers.delete(id); };

  function runTimers() {
    for (let guard = 0; guard < 1000; guard++) {
      let next = null;
      for (const [id, t] of timers) if (t.at <= vt && (!next || t.at < next[1].at)) next = [id, t];
      if (!next) return;
      const [id, t] = next;
      if (t.every) t.at += t.every; else timers.delete(id);
      try { typeof t.fn === 'function' ? t.fn(...t.args) : eval(t.fn); } catch (e) { console.error(e); }
    }
  }

  // CSS animations and transitions run on the real document timeline, so a slow capture would
  // play a 2.4s banner in a handful of frames. Pause each one when it first appears and drive
  // its currentTime from the virtual clock instead.
  const animStart = new WeakMap();
  function syncAnims() {
    if (!document.getAnimations) return;
    for (const a of document.getAnimations()) {
      let s = animStart.get(a);
      if (s === undefined) { s = vt; animStart.set(a, s); try { a.pause(); } catch (e) {} }
      try { a.currentTime = vt - s; } catch (e) {}
    }
  }

  window.__vstep = (ms) => {
    vt += ms;
    runTimers();
    const q = rafQ; rafQ = new Map();
    for (const cb of q.values()) { try { cb(vt); } catch (e) { console.error(e); } }
    syncAnims();
  };
  window.__vtime = () => vt;
  window.__realSetTimeout = realSetTimeout;
  window.__realPerfNow = realPerfNow;
  window.__RealDate = RealDate;
})();
