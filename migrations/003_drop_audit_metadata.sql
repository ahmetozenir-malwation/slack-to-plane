-- The audit_log.metadata_json column was never populated by any code path and
-- has been removed from the TypeScript layer. Drop the now-unused column.
ALTER TABLE audit_log DROP COLUMN metadata_json;
