// Tests for the payload-walking guards in src/youtube/json.ts. Run with `npm test`.

import test from 'node:test';
import assert from 'node:assert/strict';

import { loadSrc } from '../lib/load-src.ts';

interface JsonModule {
  getByPath(obj: unknown, parts: readonly string[]): unknown;
  isArray(value: unknown): boolean;
  isContainer(value: unknown): boolean;
  isRecord(value: unknown): boolean;
  readText(text: unknown): string;
}

const { getByPath, isArray, isContainer, isRecord, readText } =
  await loadSrc<JsonModule>('youtube/json.ts');

test('isRecord accepts plain objects only', () => {
  assert.equal(isRecord({}), true);
  assert.equal(isRecord([]), false);
  assert.equal(isRecord(null), false);
  assert.equal(isRecord('x'), false);
});

test('isContainer accepts objects and arrays but not null', () => {
  assert.equal(isContainer({}), true);
  assert.equal(isContainer([]), true);
  assert.equal(isContainer(null), false);
  assert.equal(isContainer(1), false);
});

test('isArray narrows only real arrays', () => {
  assert.equal(isArray([1]), true);
  assert.equal(isArray({ length: 1 }), false);
});

test('getByPath follows nested objects', () => {
  const obj = { a: { b: { c: 1 } } };
  assert.equal(getByPath(obj, ['a', 'b', 'c']), 1);
  assert.deepEqual(getByPath(obj, ['a', 'b']), { c: 1 });
  assert.equal(getByPath(obj, []), obj);
});

test('getByPath is undefined when a step is not an object', () => {
  assert.equal(getByPath({ a: 1 }, ['a', 'b']), undefined);
  assert.equal(getByPath({ a: [1] }, ['a', '0']), undefined);
  assert.equal(getByPath(null, ['a']), undefined);
  assert.equal(getByPath({}, ['missing', 'x']), undefined);
});

test('readText reads simpleText and joins runs', () => {
  assert.equal(readText({ simpleText: 'Hi' }), 'Hi');
  assert.equal(readText({ runs: [{ text: 'a' }, { text: 'b' }] }), 'ab');
});

test('readText tolerates malformed nodes', () => {
  assert.equal(readText(undefined), '');
  assert.equal(readText('plain'), '');
  assert.equal(readText({ runs: 'no' }), '');
  assert.equal(readText({ runs: [{ text: 'a' }, null, { text: 1 }] }), 'a');
  assert.equal(readText({ simpleText: 5 }), '');
});
