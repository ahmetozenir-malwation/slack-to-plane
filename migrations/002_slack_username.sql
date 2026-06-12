-- Record the Slack username alongside the opaque slack_user_id so audit rows
-- and stored users are human-readable. Nullable: older rows and any payload
-- that lacks a username stay NULL.
ALTER TABLE users ADD COLUMN slack_username TEXT;
ALTER TABLE audit_log ADD COLUMN slack_username TEXT;
