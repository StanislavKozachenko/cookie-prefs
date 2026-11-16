import { expect, it } from 'vitest';
import * as entry from './index';

it('exports the core api', () => {
  expect(Object.keys(entry).sort()).toEqual([
    'definePrefs',
    'pref',
    'prefsScript',
    'readPrefs',
    'snapshotPrefs',
  ]);
});
