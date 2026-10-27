-- Laeuft einmal beim allerersten Start der Datenbank (leeres Volume), als supabase_admin.
-- Setzt die Passwoerter der Supabase-Rollen auf POSTGRES_PASSWORD (wie die Supabase-CLI).
-- Das Schema von ProtoPilot spielt danach server/migrate.sh aus supabase/migrations ein.

\set pgpass `echo "$PGPASSWORD"`
\set jwt_secret `echo "$JWT_SECRET"`
\set jwt_exp `echo "$JWT_EXP"`

ALTER DATABASE postgres SET "app.settings.jwt_secret" TO :'jwt_secret';
ALTER DATABASE postgres SET "app.settings.jwt_exp" TO :'jwt_exp';

ALTER USER postgres WITH PASSWORD :'pgpass';
ALTER USER authenticator WITH PASSWORD :'pgpass';
ALTER USER pgbouncer WITH PASSWORD :'pgpass';
ALTER USER supabase_auth_admin WITH PASSWORD :'pgpass';
ALTER USER supabase_storage_admin WITH PASSWORD :'pgpass';
ALTER USER supabase_replication_admin WITH PASSWORD :'pgpass';
ALTER USER supabase_read_only_user WITH PASSWORD :'pgpass';

-- Buchhaltung der eingespielten Migrationen (gleiches Format wie die Supabase-CLI)
CREATE SCHEMA IF NOT EXISTS supabase_migrations AUTHORIZATION postgres;
CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
  version text PRIMARY KEY,
  name text,
  statements text[]
);
ALTER TABLE supabase_migrations.schema_migrations OWNER TO postgres;
