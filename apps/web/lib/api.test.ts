import { describe, expect, it } from 'vitest';
import { ApiError } from './api';

describe('ApiError', () => {
  it('captures status code from response', () => {
    const error = new ApiError('Bad Request', 400);
    expect(error.message).toBe('Bad Request');
    expect(error.status).toBe(400);
  });
});
