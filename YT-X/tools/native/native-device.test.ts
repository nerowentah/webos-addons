// Tests for the stock-binary platform-string patch (tools/native/native-device.ts).

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  deviceStringPatches,
  patchDeviceStrings,
  untestedRuntimeNote
} from './native-device.ts';

const strings = { model: 'QNED86', firmware: '33.31.75', year: '2025' };

/** A binary pool laid out like the stock one: each default between NULs. */
function stockPool(): Buffer {
  const parts = [
    '2022',
    'SystemIntegratorName',
    'X11; Linux x86_64',
    'ModelName',
    'Linux Desktop',
    'FirmwareVersion',
    'ChipsetModelNumber',
    'BrandName',
    'DESKTOP'
  ];
  return Buffer.from('\0' + parts.join('\0') + '\0', 'latin1');
}

test('every replacement fits the slot it replaces', () => {
  for (const [from, to] of deviceStringPatches(strings)) {
    assert.ok(to.length <= from.length, `${to} does not fit ${from}`);
  }
});

test('the patch keeps the binary length and writes the new strings', () => {
  const stock = stockPool();
  const out = patchDeviceStrings(stock, strings);
  assert.equal(out.length, stock.length);
  const text = out.toString('latin1');
  for (const expected of [
    '2025\0SmartTV',
    'Web0S; Linux',
    'QNED86',
    '33.31.75',
    'O18',
    'LG',
    'TV'
  ]) {
    assert.ok(text.includes(expected), `missing ${expected}`);
  }
  assert.ok(!text.includes('DESKTOP'));
});

test('a model that does not fit, or a bad year, is refused', () => {
  assert.throws(() =>
    patchDeviceStrings(stockPool(), { ...strings, model: 'TOO LONG MODEL' })
  );
  assert.throws(() =>
    patchDeviceStrings(stockPool(), { ...strings, year: '25' })
  );
});

test('only the verified RF1705 runtime passes without a warning', () => {
  assert.equal(untestedRuntimeNote('2.0.6'), undefined);
  assert.match(untestedRuntimeNote('2.1.0') ?? '', /not one of the tested/);
  assert.match(untestedRuntimeNote(undefined) ?? '', /unknown version/);
});
