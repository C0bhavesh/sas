CREATE TABLE users (
  id uuid PRIMARY KEY,
  username text NOT NULL,
  password_hash text NOT NULL,
  is_admin boolean NOT NULL DEFAULT false,
  can_export_audit boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'blocked')),
  email text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_username ON users (lower(username));

CREATE TABLE sessions (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE TABLE user_rights (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id),
  module text NOT NULL,
  can_add boolean NOT NULL DEFAULT false,
  can_edit boolean NOT NULL DEFAULT false,
  can_delete boolean NOT NULL DEFAULT false,
  can_print boolean NOT NULL DEFAULT false,
  can_find boolean NOT NULL DEFAULT false,
  show_menu boolean NOT NULL DEFAULT false,
  UNIQUE (user_id, module)
);

CREATE TABLE user_blocked_groups (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id),
  group_id uuid NOT NULL REFERENCES account_groups(id),
  UNIQUE (user_id, group_id)
);

CREATE TABLE user_hidden_companies (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id),
  company_id uuid NOT NULL REFERENCES companies(id),
  UNIQUE (user_id, company_id)
);
