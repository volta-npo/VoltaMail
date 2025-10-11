import { describe, expect, it } from 'vitest';
import { APP_NAME, OrganizationRole } from './index';

describe('shared constants', () => {
  it('exposes the application name', () => {
  expect(APP_NAME).toBe('VoltaMail');
  });

  it('includes the expected organization roles', () => {
    const roles: OrganizationRole[] = ['OWNER', 'MANAGER', 'WRITER', 'VIEWER'];
    expect(roles).toHaveLength(4);
  });
});
