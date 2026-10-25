// Tests for spatial focus navigation (src/ui/panel-nav.ts) using fake boxes.

import test from 'node:test';
import assert from 'node:assert/strict';

import { loadSrc } from '../lib/load-src.ts';

interface Box {
  name: string;
  getBoundingClientRect(): {
    left: number;
    top: number;
    width: number;
    height: number;
  };
}

interface NavModule {
  findSpatialNeighbor(
    current: Box,
    list: readonly Box[],
    direction: 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight'
  ): Box | null;
}

const { findSpatialNeighbor } = await loadSrc<NavModule>('ui/panel-nav.ts');

const box = (name: string, left: number, top: number): Box => ({
  name,
  getBoundingClientRect: () => ({ left, top, width: 100, height: 40 })
});

//  a  b
//  c  d
const a = box('a', 0, 0);
const b = box('b', 200, 0);
const c = box('c', 0, 100);
const d = box('d', 200, 100);
const all = [a, b, c, d];

test('moves to the adjacent box in each direction', () => {
  assert.equal(findSpatialNeighbor(a, all, 'ArrowRight'), b);
  assert.equal(findSpatialNeighbor(a, all, 'ArrowDown'), c);
  assert.equal(findSpatialNeighbor(d, all, 'ArrowLeft'), c);
  assert.equal(findSpatialNeighbor(d, all, 'ArrowUp'), b);
});

test('returns null at the edge', () => {
  assert.equal(findSpatialNeighbor(a, all, 'ArrowLeft'), null);
  assert.equal(findSpatialNeighbor(a, all, 'ArrowUp'), null);
  assert.equal(findSpatialNeighbor(d, all, 'ArrowRight'), null);
});

test('prefers staying in the same column over a nearer diagonal', () => {
  const near = box('near', 150, 60);
  const sameColumn = box('same', 0, 140);
  assert.equal(
    findSpatialNeighbor(a, [near, sameColumn], 'ArrowDown'),
    sameColumn
  );
});

test('ignores the current element and same-axis overlaps', () => {
  assert.equal(findSpatialNeighbor(a, [a], 'ArrowDown'), null);
  const level = box('level', 200, 0);
  assert.equal(findSpatialNeighbor(a, [level], 'ArrowDown'), null);
});
