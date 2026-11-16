import * as entry from './index';
import { expect, it } from 'vitest';

it('loads the react entry', () => {
  expect(entry).toBeDefined();
});
