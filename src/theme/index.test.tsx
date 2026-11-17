import { expect, it } from 'vitest';
import * as entry from './index';

it('exports the theme api', () => {
  expect(Object.keys(entry).sort()).toEqual(['ThemeProvider', 'useTheme']);
});
