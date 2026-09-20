const test = require('node:test'); const assert = require('node:assert/strict');
const { validScore, charityFields } = require('../lib/validate');
test('scores 1 and 45 are accepted', () => { validScore(1); validScore(45); });
test('scores 0, 46, decimals and strings are rejected', () => { for (const v of [0, 46, 4.5, '7', null]) assert.throws(() => validScore(v)); });
test('charity requires a name', () => assert.throws(() => charityFields({ description: 'x' }), /Name is required/));
test('charity strips unknown fields', () => assert.deepEqual(Object.keys(charityFields({ name: 'A', id: 'x', role: 'admin' })).sort(), ['description', 'events', 'featured', 'image_url', 'name']));
test('charity rejects a non-http image link', () => assert.throws(() => charityFields({ name: 'A', image_url: 'javascript:alert(1)' })));
test('charity drops events without title or date', () => assert.equal(charityFields({ name: 'A', events: [{ title: 'Gala' }, { title: 'Run', date: '2026-10-01' }] }).events.length, 1));
