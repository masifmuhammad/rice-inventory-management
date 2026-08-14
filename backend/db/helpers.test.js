/**
 * Money rounding. Run with `node db/helpers.test.js`.
 *
 * This exists because `Math.round(n * 100) / 100` — what every round2 in this
 * codebase used to be — is wrong for a ledger, and wrong in a way that looks
 * fine until someone reconciles a till. Each case below failed before the fix.
 */
const assert = require('assert');
const { round2, round4, likePattern } = require('./helpers');

// The multiply-in-binary cases. Every one of these rounded DOWN before.
assert.strictEqual(round2(1.005), 1.01);
assert.strictEqual(round2(8.165), 8.17);
assert.strictEqual(round2(162.295), 162.3);
assert.strictEqual(round2(10.075), 10.08);
assert.strictEqual(round2(1234567.005), 1234567.01);

// Ties go away from zero, so a refund rounds like the sale it reverses.
assert.strictEqual(round2(-1.005), -1.01);
assert.strictEqual(round2(-8.165), -8.17);

// Ordinary values are unchanged.
assert.strictEqual(round2(0), 0);
assert.strictEqual(round2(59.97), 59.97);
assert.strictEqual(round2(207045), 207045);
assert.strictEqual(round2(2.675), 2.68);

// Bad input becomes 0 rather than NaN — a NaN reaching a NUMERIC column is a
// 500, and a NaN reaching a total silently poisons every figure downstream.
assert.strictEqual(round2(null), 0);
assert.strictEqual(round2(undefined), 0);
assert.strictEqual(round2(NaN), 0);
assert.strictEqual(round2(Infinity), 0);
assert.strictEqual(round2('12.345'), 12.35);

// Quantities carry four places: NUMERIC(14,4).
assert.strictEqual(round4(1.00005), 1.0001);
assert.strictEqual(round4(-1.00005), -1.0001);
assert.strictEqual(round4(490), 490);

// A float sum that drifts must still land on the exact figure.
let drift = 0;
for (let i = 0; i < 1000; i += 1) drift += 0.07;
assert.strictEqual(round2(drift), 70);

// ILIKE wildcards are escaped, so searching for the grade "50%" does not match
// every product with "50" in its name.
assert.strictEqual(likePattern('50%'), '%50\\%%');
assert.strictEqual(likePattern('a_b'), '%a\\_b%');
assert.strictEqual(likePattern('plain'), '%plain%');

console.log('helpers: all money-rounding checks passed');
