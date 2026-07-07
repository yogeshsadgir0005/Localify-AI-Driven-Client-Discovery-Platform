const { test } = require('node:test');
const assert = require('node:assert/strict');
const embeddingService = require('../services/embeddingService');
const gstService = require('../services/gstService');
const aiService = require('../services/aiService');

const near = (a, b) => Math.abs(a - b) < 1e-9;

test('cosine: identical vectors ≈ 1', () => {
  assert.ok(near(embeddingService.cosine([1, 0, 1], [1, 0, 1]), 1));
});

test('cosine: orthogonal maps to 0.5', () => {
  assert.ok(near(embeddingService.cosine([1, 0], [0, 1]), 0.5));
});

test('cosine: opposite ≈ 0', () => {
  assert.ok(near(embeddingService.cosine([1, 0], [-1, 0]), 0));
});

test('cosine: length mismatch = 0', () => {
  assert.equal(embeddingService.cosine([1, 0], [1]), 0);
});

test('GSTIN format validation', () => {
  assert.equal(gstService.isValidFormat('24ABCDE1234F1Z5'), true);
  assert.equal(gstService.isValidFormat('not-a-gstin'), false);
  assert.equal(gstService.isValidFormat(''), false);
});

test('heuristic parse extracts vertical, category, MOQ', () => {
  const categories = [
    { slug: 'it-web-development', vertical: 'it', displayName: { en: 'Web development' }, synonyms: ['web development'] },
  ];
  const parsed = aiService.heuristicParse('need a web development company for 200 pcs', categories);
  assert.equal(parsed.vertical, 'it');
  assert.ok(parsed.categories.includes('it-web-development'));
  assert.equal(parsed.moqBand.min, 200);
});

test('heuristic parse: budget band', () => {
  const parsed = aiService.heuristicParse('cheap affordable option', []);
  assert.equal(parsed.budgetBand, 'budget');
});
