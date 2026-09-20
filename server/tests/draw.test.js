const test = require('node:test'); const assert = require('node:assert/strict');
const { drawNumbers, matchCount, runDraw } = require('../lib/draw');
const N = [1, 2, 3, 4, 5], U = (id, scores) => ({ id, scores, monthly_amount: 1000 });
for (const mode of ['random', 'algorithmic']) test(`${mode}: five unique numbers between 1 and 45`, () => {
  for (let i = 0; i < 300; i++) { const n = drawNumbers(mode, [1, 1, 2, 45]); assert.equal(n.length, 5); assert.equal(new Set(n).size, 5); assert.ok(n.every(x => x >= 1 && x <= 45)); }
});
test('algorithmic mode favours frequent scores', () => {
  let hits = 0; for (let i = 0; i < 300; i++) if (drawNumbers('algorithmic', Array(200).fill(7)).includes(7)) hits++;
  assert.ok(hits > 240);
});
test('matchCount counts distinct matches only', () => assert.equal(matchCount([5, 5, 6], [5, 6, 7, 8, 9]), 2));
test('40/35/25 split with equal division between winners', () => {
  const r = runDraw(N, [U('a', [1, 2, 3, 4, 5]), U('b', [1, 2, 3, 4, 40]), U('c', [1, 2, 3, 4, 41]), U('d', [1, 2, 3, 30, 31])], 0.5);
  assert.equal(r.pool.total, 2000);
  const amt = id => r.winners.find(w => w.user_id === id).amount;
  assert.equal(amt('a'), 800); assert.equal(amt('b'), 350); assert.equal(amt('c'), 350); assert.equal(amt('d'), 500); assert.equal(r.jackpotCarry, 0);
});
test('two jackpot winners split the jackpot', () => {
  const r = runDraw(N, [U('a', N), U('b', N)], 0.5); assert.deepEqual(r.winners.map(w => w.amount), [200, 200]);
});
test('no 5-match winner: jackpot rolls over, including earlier carry', () => {
  const r = runDraw(N, [U('a', [1, 2, 3, 4, 40])], 0.5, 100); assert.equal(r.jackpotCarry, 300);
});
test('zero winners creates no NaN or Infinity', () => {
  const r = runDraw(N, [U('a', [40, 41, 42, 43, 44])], 0.5); assert.equal(r.winners.length, 0); assert.ok(Number.isFinite(r.jackpotCarry));
  Object.values(r.pool.tiers).forEach(v => assert.ok(Number.isFinite(v)));
});
