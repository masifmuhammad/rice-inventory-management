const fs = require('fs');
const path = require('path');

const LOG_FILE = process.env.DEBUG_LOG_PATH || path.join(__dirname, '..', 'debug-130b99.log');
const INGEST = 'http://127.0.0.1:7498/ingest/bb659440-42af-44d0-9469-4bd87f9cef58';
const INGEST_DOCKER = 'http://host.docker.internal:7498/ingest/bb659440-42af-44d0-9469-4bd87f9cef58';

const ingestUrl = () =>
  String(process.env.DATABASE_URL || '').includes('@postgres:') ? INGEST_DOCKER : INGEST;

/** NDJSON debug log for session 130b99 — never log secrets. */
function debugLog({ location, message, data = {}, hypothesisId, runId = 'pre-fix' }) {
  const line = {
    sessionId: '130b99',
    timestamp: Date.now(),
    location,
    message,
    data,
    hypothesisId,
    runId,
  };

  // #region agent log
  try {
    fs.appendFileSync(LOG_FILE, `${JSON.stringify(line)}\n`);
  } catch (_) {
    /* ignore */
  }

  global.fetch?.(ingestUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '130b99' },
    body: JSON.stringify(line),
  }).catch(() => {});
  // #endregion
}

module.exports = { debugLog };
