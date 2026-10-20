import { describe, expect, it } from 'vitest';
import { ADMIN, CLERK, rightsFor } from '../testing/sampleData';
import { SCREEN_BY_ID, SCREENS } from './screens';
import { canSee } from './visibility';

describe('canSee', () => {
  it('shows every screen to an admin', () => {
    const s = { actor: ADMIN, rights: rightsFor() };
    expect(SCREENS.every((screen) => canSee(screen, s))).toBe(true);
  });

  it('always shows Home and Help', () => {
    const s = { actor: CLERK, rights: rightsFor() };
    expect(canSee(SCREEN_BY_ID.home, s)).toBe(true);
    expect(canSee(SCREEN_BY_ID.help, s)).toBe(true);
  });

  it('shows a screen when the user has any right on one of its modules', () => {
    const s = { actor: CLERK, rights: rightsFor({ cash_book: { add: true } }) };
    expect(canSee(SCREEN_BY_ID.receipt, s)).toBe(true);
    expect(canSee(SCREEN_BY_ID.vouchers, s)).toBe(true); // cash_book or journal
    expect(canSee(SCREEN_BY_ID.journal, s)).toBe(false);
    expect(canSee(SCREEN_BY_ID.rTrial, s)).toBe(false);
  });

  it('hides screens from a user with no rights at all', () => {
    const s = { actor: CLERK, rights: rightsFor() };
    expect(SCREENS.filter((screen) => canSee(screen, s)).map((screen) => screen.id)).toEqual(['home', 'help']);
  });

  it('keeps the audit log for administrators only', () => {
    const s = { actor: CLERK, rights: rightsFor({ users: { add: true, edit: true, delete: true, print: true, find: true, show: true } }) };
    expect(canSee(SCREEN_BY_ID.audit, s)).toBe(false);
    expect(canSee(SCREEN_BY_ID.users, s)).toBe(true);
  });
});
