import { describe, expect, it } from 'vitest';
import { CORE_PACKAGE_NAME } from '../src/index.js';

describe('packages/core scaffold', () => {
  it('loads and exposes its package identity', () => {
    expect(CORE_PACKAGE_NAME).toBe('@paths-beyond/core');
  });
});
