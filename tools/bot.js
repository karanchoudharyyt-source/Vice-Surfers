// Deterministic gameplay bot, injected before the capture starts.
// window.__bot(tSeconds) runs once per virtual sub-step and returns a key name
// ('ArrowLeft'/'ArrowRight'/'ArrowUp'/'ArrowDown') or null.
// __botCfg.stopAt: after this distance, stop dodging so the run ends WASTED on camera.
window.__botCfg = { stopAt: 1e9, cd: 0 };
window.__bot = (t) => {
  const VS = window.VS;
  if (!VS || VS.state !== 'run') return null;
  const C = window.__botCfg;
  const pl = VS.PL, obs = VS.course.obs, speed = VS.speed, dist = VS.dist;
  if (dist > C.stopAt) return null;

  const near = [];
  for (const o of obs) {
    const d = pl.z - o.z; // >0 while ahead of us
    if (d > -3 && d < 42) near.push({ o, d });
  }
  const laneCost = (l) => {
    let c = 0;
    for (const { o, d } of near) {
      if (o.lane !== l) continue;
      if (o.vz > 0) c += d < 34 ? 60 : 8;                    // oncoming: leave now
      else if (o.type === 'truck') c += 6;                   // too tall to jump
      else if (o.type === 'car') c += 1.6;                   // jumpable onto the roof
      else if (o.type === 'barrier') c += 0.9;               // jump
      else if (o.type === 'bar') c += 0.9;                   // roll
      else if (o.type === 'ramp') c -= 3;                    // cash on the roof
    }
    return c;
  };
  // coins pull a tie toward the richer lane
  const coins = VS.course.coinList;
  const laneCoins = [0, 0, 0];
  for (const cn of coins) if (!cn.taken && cn.z < pl.z - 2 && cn.z > pl.z - 24) laneCoins[cn.lane]++;

  const costs = [0, 1, 2].map((l) => laneCost(l) - Math.min(laneCoins[l], 10) * 0.04);
  let best = pl.lane;
  for (const l of [pl.lane - 1, pl.lane + 1]) {
    if (l < 0 || l > 2) continue;
    if (costs[l] < costs[best] - 0.55) best = l;
  }
  C.cd -= 1 / 60;
  if (best !== pl.lane && C.cd <= 0 && pl.onGround) { C.cd = 0.34; return best < pl.lane ? 'ArrowLeft' : 'ArrowRight'; }

  // actions in the current lane
  for (const { o, d } of near) {
    if (o.lane !== pl.lane) continue;
    const gap = d - o.len / 2;
    if (gap <= 0 || gap > 16) continue;
    if (o.type === 'bar' && gap < speed * 0.30 && pl.onGround) return 'ArrowDown';
    if (o.type === 'barrier' && gap < speed * 0.31 && pl.onGround) return 'ArrowUp';
    if (o.type === 'car' && !o.vz && gap < speed * 0.36 && pl.onGround) return 'ArrowUp';
  }
  return null;
};
