CREATE TABLE users (
  slack_user_id              TEXT PRIMARY KEY,
  slack_team_id              TEXT NOT NULL,
  plane_token_encrypted      BLOB NOT NULL,
  plane_token_iv             BLOB NOT NULL,
  plane_token_auth_tag       BLOB NOT NULL,
  plane_user_email           TEXT,
  created_at                 INTEGER NOT NULL,
  updated_at                 INTEGER NOT NULL,
  last_used_at               INTEGER
);
CREATE INDEX idx_users_team ON users(slack_team_id);

CREATE TABLE audit_log (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp        INTEGER NOT NULL,
  slack_user_id    TEXT NOT NULL,
  action           TEXT NOT NULL,
  plane_project_id TEXT,
  plane_issue_id   TEXT,
  error_code       TEXT,
  metadata_json    TEXT
);
CREATE INDEX idx_audit_user_time ON audit_log(slack_user_id, timestamp DESC);
