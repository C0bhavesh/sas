import { describe, expect, it } from 'vitest';
import { pgConnFromUrl } from './backup';

describe('pgConnFromUrl', () => {
  it('parses a full URL, decoding the password', () => {
    expect(pgConnFromUrl('postgres://sas:p%40ss%2Fw@db.office:6543/sasdb')).toEqual({
      host: 'db.office',
      port: 6543,
      user: 'sas',
      password: 'p@ss/w',
      database: 'sasdb',
    });
  });
  it('defaults the port', () => {
    expect(pgConnFromUrl('postgresql://u:p@localhost/d').port).toBe(5432);
  });
  it('rejects a URL without a database name', () => {
    expect(() => pgConnFromUrl('postgres://u:p@localhost')).toThrow(/database/i);
  });
});
