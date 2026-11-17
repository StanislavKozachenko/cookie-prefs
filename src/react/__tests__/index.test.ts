import { expect, it } from 'vitest';
import * as entry from '../index';

it('exports the react api', () => {
  expect(Object.keys(entry).sort()).toEqual(['PrefsProvider', 'usePref']);
});
