import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasAnswer, isRefusalText, langOf, REFUSAL } from '../src/decide.js';

test('threshold: at or above the minimum answers, below refuses', () => {
  assert.equal(hasAnswer(0.5, 0.5), true);
  assert.equal(hasAnswer(0.74, '0.5'), true);
  assert.equal(hasAnswer(0.499, 0.5), false);
});

test('no vector evidence (search-only mode) never counts as an answer', () => {
  assert.equal(hasAnswer(null, 0.5), false);
  assert.equal(hasAnswer(undefined, 0.5), false);
});

test('the refusal sentences are recognised in both languages', () => {
  assert.equal(isRefusalText(REFUSAL.ru), true);
  assert.equal(isRefusalText(REFUSAL.en), true);
  assert.equal(isRefusalText('В базе нет ответа на этот вопрос, сожалею.'), true);
  assert.equal(isRefusalText('Delivery costs 1,500 RUB [1].'), false);
  assert.equal(isRefusalText(''), false);
});

test('answer language follows the question', () => {
  assert.equal(langOf('Сколько стоит доставка?'), 'ru');
  assert.equal(langOf('How much is delivery?'), 'en');
  assert.equal(langOf('Harborline доставка'), 'ru');
});
