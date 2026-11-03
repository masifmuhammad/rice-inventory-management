// Run by deploy/oracle/backup.sh in a separate short-lived container.
// No application startup, migrations, or writes to Neon's original public tables.
const fs = require('node:fs');
const crypto = require('node:crypto');
const { Client } = require('pg');

async function main() {
  const filename = process.argv[2];
  if (!filename || !process.env.NEON_BACKUP_DATABASE_URL) {
    throw new Error('Provide a dump filename and NEON_BACKUP_DATABASE_URL');
  }
  const archive = fs.readFileSync(filename);
  if (archive.length < 5 || archive.subarray(0, 5).toString() !== 'PGDMP') {
    throw new Error('Expected a PostgreSQL custom-format backup');
  }
  if (archive.length > 64 * 1024 * 1024) throw new Error('Backup exceeds the 64 MiB limit; review free storage before increasing it');
  const sha256 = crypto.createHash('sha256').update(archive).digest('hex');
  const client = new Client({ connectionString: process.env.NEON_BACKUP_DATABASE_URL, connectionTimeoutMillis: 20000, statement_timeout: 60000 });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      CREATE SCHEMA IF NOT EXISTS oracle_backups;
      CREATE TABLE IF NOT EXISTS oracle_backups.snapshots (
        id UUID PRIMARY KEY,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        app_revision TEXT,
        sha256 TEXT NOT NULL,
        archive BYTEA NOT NULL
      )
    `);
    const id = crypto.randomUUID();
    await client.query('INSERT INTO oracle_backups.snapshots (id, app_revision, sha256, archive) VALUES ($1, $2, $3, $4)', [id, process.env.APP_REVISION || null, sha256, archive]);
    const saved = (await client.query('SELECT archive FROM oracle_backups.snapshots WHERE id=$1', [id])).rows[0].archive;
    if (crypto.createHash('sha256').update(saved).digest('hex') !== sha256) throw new Error('Backup download verification failed');
    // Only this new backup namespace has retention; original Render data stays intact.
    await client.query('DELETE FROM oracle_backups.snapshots WHERE id IN (SELECT id FROM oracle_backups.snapshots ORDER BY created_at DESC, id DESC OFFSET 7)');
    await client.query('COMMIT');
    console.log(JSON.stringify({ status: 'backed-up-and-verified', id, bytes: archive.length, sha256, revision: process.env.APP_REVISION || null }));
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally { await client.end(); }
}

main().catch((error) => { console.error('Neon backup failed:', error.message); process.exitCode = 1; });
