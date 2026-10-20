export const MODULES = [
  'company',
  'account_master',
  'group_master',
  'book_master',
  'cash_book',
  'journal',
  'reports',
  'users',
  'utilities',
] as const;
export type ModuleName = (typeof MODULES)[number];

export const RIGHT_ACTIONS = ['add', 'edit', 'delete', 'print', 'find', 'show'] as const;
export type RightAction = (typeof RIGHT_ACTIONS)[number];

export type Rights = Record<RightAction, boolean>;

export const NO_RIGHTS: Rights = { add: false, edit: false, delete: false, print: false, find: false, show: false };

/** The signed-in user, as the service layer sees them. */
export interface Actor {
  userId: string;
  username: string;
  isAdmin: boolean;
}
