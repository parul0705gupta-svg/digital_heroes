// Draw engine: number generation, matching, prize pool maths. Pure functions.
const RANGE = 45, PICKS = 5;
const SHARE = { 5: 0.40, 4: 0.35, 3: 0.25 };   // PRD section 07

// 'random' = uniform lottery; 'algorithmic' = weighted by score frequency
function drawNumbers(mode, allScores = []) {
  const weight = Array(RANGE + 1).fill(1);
  if (mode === 'algorithmic' && Array.isArray(allScores)) {
    allScores.forEach(s => {
      const n = Number(s);
      if (Number.isInteger(n) && n >= 1 && n <= RANGE) weight[n] += 1;
    });
  }
  const picked = new Set();
  while (picked.size < PICKS) {
    let total = 0;
    for (let n = 1; n <= RANGE; n++) if (!picked.has(n)) total += weight[n];
    let r = Math.random() * total;
    for (let n = 1; n <= RANGE; n++) {
      if (picked.has(n)) continue;
      r -= weight[n];
      if (r <= 0) { picked.add(n); break; }
    }
  }
  return [...picked].sort((a, b) => a - b);
}
const matchCount = (scores, numbers) => new Set(scores.filter(s => numbers.includes(s))).size;

// users: [{ id, scores: [int], monthly_amount }]; carry = unclaimed jackpot from previous draw
function runDraw(numbers, users, poolPct, carry = 0) {
  const pool = users.reduce((a, u) => a + Number(u.monthly_amount) * poolPct, 0);
  const tiers = { 5: pool * SHARE[5] + Number(carry), 4: pool * SHARE[4], 3: pool * SHARE[3] };
  const byTier = { 5: [], 4: [], 3: [] };
  users.forEach(u => { const m = matchCount(u.scores, numbers); if (m >= 3) byTier[m].push(u.id); });
  const winners = [];
  for (const t of [5, 4, 3]) {
    byTier[t].forEach(id => winners.push({ user_id: id, tier: t, amount: +(tiers[t] / byTier[t].length).toFixed(2) }));
  }
  const jackpotCarry = byTier[5].length ? 0 : tiers[5];   // 5-match rolls over if unclaimed
  const counts = { 5: byTier[5].length, 4: byTier[4].length, 3: byTier[3].length };
  return { pool: { total: pool, tiers, winnerCounts: counts }, winners, jackpotCarry };
}
module.exports = { drawNumbers, matchCount, runDraw };
