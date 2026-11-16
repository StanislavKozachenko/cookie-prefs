import { expect, it } from 'vitest';
import { VERSION } from './index';

it('exports the version', () => {
  expect(VERSION).toBe('0.0.0');
});
