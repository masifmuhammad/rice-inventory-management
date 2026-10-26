const { withTransaction } = require('../config/db');
const { ApiError } = require('../middleware/errorHandler');

const canonical = (value) => Array.isArray(value) ? value.map(canonical)
  : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])])) : value;

// The acknowledgement commits with the stock/cash write. A lost response can
// therefore be retried, including concurrently, without posting a second entry.
module.exports = (scope, data, businessId, run) => withTransaction(async (client) => {
  if (!data.requestId) return run(client);
  const { requestId, ...input } = data;
  const payload = JSON.parse(JSON.stringify(canonical(input)));
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`${scope}:${businessId}:${requestId}`]);
  const previous = (await client.query('SELECT request_data,result FROM ledger_requests WHERE business_id=$1 AND scope=$2 AND request_id=$3', [businessId, scope, requestId])).rows[0];
  if (previous) {
    if (JSON.stringify(canonical(previous.request_data)) !== JSON.stringify(payload)) throw new ApiError(409, 'This save was already used for different details. Confirm the previous save before starting a new entry.');
    return { ...previous.result, replayed: true };
  }
  const result = await run(client);
  await client.query('INSERT INTO ledger_requests (business_id,scope,request_id,request_data,result) VALUES ($1,$2,$3,$4,$5)', [businessId, scope, requestId, payload, result]);
  return result;
});
