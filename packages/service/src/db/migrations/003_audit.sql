CREATE TABLE audit_log (
  id uuid PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT now(),
  user_id uuid REFERENCES users(id),
  company_id uuid,
  entity text NOT NULL,
  entity_id uuid,
  action text NOT NULL,
  old_values jsonb,
  new_values jsonb
);
CREATE INDEX audit_log_entity ON audit_log (entity, entity_id);
CREATE INDEX audit_log_company_at ON audit_log (company_id, at);

CREATE FUNCTION audit_log_refuse() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only';
END
$$;

CREATE TRIGGER trg_audit_log_no_change BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_refuse();
CREATE TRIGGER trg_audit_log_no_truncate BEFORE TRUNCATE ON audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION audit_log_refuse();
