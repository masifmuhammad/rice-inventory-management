const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isValidUuid = (value) => typeof value === 'string' && UUID_RE.test(value);

/** Populated joins return `{ _id, id, … }`; Postgres expects a UUID string. */
const resolveUuid = (value) => {
  if (value == null) return null;
  if (typeof value === 'object') return value._id || value.id || null;
  return isValidUuid(value) ? value : null;
};

const toCamel = (key) => key.replace(/_([a-z])/g, (_, char) => char.toUpperCase());

/** Converts a Postgres row into the camelCase shape the API already speaks. */
const rowToDoc = (row, { idAsUnderscore = true } = {}) => {
  if (!row) return null;

  const doc = {};
  for (const [key, value] of Object.entries(row)) {
    if (key === 'id') {
      if (idAsUnderscore) doc._id = value;
      doc.id = value;
      continue;
    }
    doc[toCamel(key)] = value;
  }
  return doc;
};

const rowsToDocs = (rows, options) => rows.map((row) => rowToDoc(row, options));

const pick = (obj, keys) =>
  keys.reduce((acc, key) => {
    if (obj[key] !== undefined) acc[key] = obj[key];
    return acc;
  }, {});

/**
 * Wraps a user's search term as an ILIKE pattern.
 *
 * The routes escape *regex* metacharacters before handing the term over, which
 * leaves `%` and `_` — the two characters ILIKE itself treats as wildcards —
 * untouched. Searching for the grade "50%" would otherwise match every product
 * with "50" anywhere in its name. Backslash is LIKE's default escape character
 * in Postgres, and the pattern travels as a bound parameter, so the escapes
 * arrive intact.
 */
const likePattern = (search) => `%${String(search).replace(/[\\%_]/g, (char) => `\\${char}`)}%`;

/**
 * Rounds money to paisa, half away from zero.
 *
 * `Math.round(n * 100) / 100` is wrong for a ledger: the multiply happens in
 * binary, so a value whose decimal form ends in a 5 can land just under the
 * boundary and round down. round2(1.005) gave 1.00, round2(8.165) gave 8.16,
 * round2(162.295) gave 162.29 — each one a paisa quietly lost on a real sale.
 *
 * Shifting through the exponent in string form skips the float multiply
 * entirely. The sign is applied separately because Math.round breaks ties
 * toward +Infinity, so -1.005 would round to -1.00 rather than -1.01.
 */
const round2 = (n) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  const sign = v < 0 ? -1 : 1;
  return sign * Number(`${Math.round(Number(`${Math.abs(v)}e2`))}e-2`);
};

/** Same, at the four decimal places the quantity columns store. */
const round4 = (n) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  const sign = v < 0 ? -1 : 1;
  return sign * Number(`${Math.round(Number(`${Math.abs(v)}e4`))}e-4`);
};

const pgError = (error) => {
  if (error.code === '23505') {
    const field = error.detail?.match(/\(([^)]+)\)/)?.[1] || 'field';
    const err = new Error(`That ${field} is already in use`);
    err.status = 409;
    err.code = 11000;
    err.pgCode = '23505';
    return err;
  }

  if (error.code === '22P02') {
    const err = new Error('Invalid identifier');
    err.status = 400;
    return err;
  }

  return error;
};

module.exports = {
  isValidUuid,
  resolveUuid,
  rowToDoc,
  rowsToDocs,
  pick,
  pgError,
  likePattern,
  round2,
  round4,
};
