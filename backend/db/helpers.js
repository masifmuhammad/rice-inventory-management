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
};
