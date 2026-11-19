import { expect, it } from 'vitest';
import * as entry from '../../index';

it('exports the core api', () => {
  expect(Object.keys(entry).sort()).toEqual([
    'applyReflection', // internal, for cookie-prefs/react
    'definePrefs',
    'pref',
    'readPrefs',
    'snapshotPrefs',
  ]);
});
