// Unit tests for the Exit / Cancel dialog key mapping (src/ui/exit-dialog-keys.ts).

import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSrc } from '../lib/load-src.ts';

type Choice = 'exit' | 'cancel';
interface Step {
  focus: Choice;
  action: Choice | null;
}
interface Mod {
  DEFAULT_EXIT_CHOICE: Choice;
  exitDialogKey(keyCode: number, focus: Choice): Step;
}

const { DEFAULT_EXIT_CHOICE, exitDialogKey } = await loadSrc<Mod>(
  'ui/exit-dialog-keys.ts'
);

const LEFT = 37;
const RIGHT = 39;
const ENTER = 13;
const BACK = 461;
const ESCAPE = 27;

test('Left and Right move focus between Exit and Cancel', () => {
  assert.deepEqual(exitDialogKey(RIGHT, 'exit'), {
    focus: 'cancel',
    action: null
  });
  assert.deepEqual(exitDialogKey(LEFT, 'cancel'), {
    focus: 'exit',
    action: null
  });
  assert.deepEqual(exitDialogKey(LEFT, 'exit'), {
    focus: 'exit',
    action: null
  });
  assert.deepEqual(exitDialogKey(RIGHT, 'cancel'), {
    focus: 'cancel',
    action: null
  });
});

test('Enter activates the focused button', () => {
  assert.equal(exitDialogKey(ENTER, 'exit').action, 'exit');
  assert.equal(exitDialogKey(ENTER, 'cancel').action, 'cancel');
});

test('the dialog opens on Cancel, so a stray OK does not exit', () => {
  assert.equal(DEFAULT_EXIT_CHOICE, 'cancel');
});

test('Back and Escape cancel from either button', () => {
  for (const key of [BACK, ESCAPE]) {
    assert.equal(exitDialogKey(key, 'exit').action, 'cancel');
    assert.equal(exitDialogKey(key, 'cancel').action, 'cancel');
  }
});

test('other keys change nothing', () => {
  for (const key of [38, 40, 32, 403]) {
    assert.deepEqual(exitDialogKey(key, 'exit'), {
      focus: 'exit',
      action: null
    });
  }
});
