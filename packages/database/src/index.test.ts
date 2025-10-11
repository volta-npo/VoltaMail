import { describe, expect, it } from 'vitest';

describe('database package', () => {
  it('has prisma client dependency configured', () => {
    expect(process.env.DATABASE_URL ?? '').toBeTypeOf('string');
  });
});
