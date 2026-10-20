import { describe, expect, it } from 'vitest';
import { resolveNoLogin } from './authMode';

describe('resolveNoLogin', () => {
  it('is off by default, so a real installation always asks for a login', () => {
    expect(resolveNoLogin({})).toBe(false);
    expect(resolveNoLogin({ DATABASE_URL: 'postgres://u:p@h/db' })).toBe(false);
    expect(resolveNoLogin({ SAS_NO_LOGIN: '0', SAS_DEV_PGLITE_DIR: './.devdata' })).toBe(false);
    expect(resolveNoLogin({ SAS_NO_LOGIN: '', SAS_DEV_PGLITE_DIR: './.devdata' })).toBe(false);
  });

  it('can be switched on only with the embedded development database', () => {
    expect(resolveNoLogin({ SAS_NO_LOGIN: '1', SAS_DEV_PGLITE_DIR: './.devdata' })).toBe(true);
  });

  it('refuses to run without a login against a real PostgreSQL database', () => {
    expect(() => resolveNoLogin({ SAS_NO_LOGIN: '1', DATABASE_URL: 'postgres://u:p@h/db' })).toThrow(/test mode/i);
    expect(() => resolveNoLogin({ SAS_NO_LOGIN: '1', DATABASE_URL: 'postgres://u:p@h/db', SAS_DEV_PGLITE_DIR: './x' })).toThrow(/test mode/i);
  });

  it('refuses when there is no database setting at all (nothing says this is development)', () => {
    expect(() => resolveNoLogin({ SAS_NO_LOGIN: '1' })).toThrow(/test mode/i);
  });
});
