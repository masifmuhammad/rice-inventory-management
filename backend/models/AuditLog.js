const { getPool } = require('../config/db');
const { rowToDoc } = require('../db/helpers');

const parseJsonField = (value) => {
  if (value == null) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

const mapAuditRow = (row) => {
  const doc = rowToDoc(row);
  doc.details = parseJsonField(doc.details);
  doc.previousState = parseJsonField(doc.previousState);
  doc.newState = parseJsonField(doc.newState);
  return doc;
};

class AuditLog {
  static async create(data) {
    const pool = getPool();
    const { rows } = await pool.query(
      `INSERT INTO audit_logs (
        business_id, user_id, user_name, user_role, action, resource_type, resource_id,
        summary, details, previous_state, new_state, ip_address, user_agent
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      RETURNING *`,
      [
        data.businessId ?? null,
        data.userId,
        data.userName,
        data.userRole ?? null,
        data.action,
        data.resourceType,
        data.resourceId ?? null,
        data.summary ?? null,
        data.details ? JSON.stringify(data.details) : null,
        data.previousState ? JSON.stringify(data.previousState) : null,
        data.newState ? JSON.stringify(data.newState) : null,
        data.ipAddress ?? null,
        data.userAgent ?? null,
      ]
    );
    return mapAuditRow(rows[0]);
  }

  static async find(filter = {}, { sort, skip, limit } = {}) {
    const pool = getPool();
    const params = [];
    const clauses = [];

    if (filter.businessId) {
      params.push(filter.businessId);
      clauses.push(`business_id = $${params.length}`);
    }
    if (filter.userId) {
      params.push(filter.userId);
      clauses.push(`user_id = $${params.length}`);
    }
    if (filter.action) {
      params.push(filter.action);
      clauses.push(`action = $${params.length}`);
    }
    if (filter.resourceType) {
      params.push(filter.resourceType);
      clauses.push(`resource_type = $${params.length}`);
    }
    if (filter.createdAt?.$gte) {
      params.push(filter.createdAt.$gte);
      clauses.push(`created_at >= $${params.length}`);
    }
    if (filter.createdAt?.$lte) {
      params.push(filter.createdAt.$lte);
      clauses.push(`created_at <= $${params.length}`);
    }
    if (filter.$or) {
      const search = filter.$or[0]?.userName?.source;
      if (search) {
        params.push(`%${search}%`);
        clauses.push(
          `(user_name ILIKE $${params.length} OR action ILIKE $${params.length} OR summary ILIKE $${params.length})`
        );
      }
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    params.push(limit || 30, skip || 0);

    const { rows } = await pool.query(
      `SELECT * FROM audit_logs ${where}
       ORDER BY created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    return rows.map((row) => mapAuditRow(row));
  }

  static async countDocuments(filter = {}) {
    const pool = getPool();
    const params = [];
    const clauses = [];

    if (filter.businessId) {
      params.push(filter.businessId);
      clauses.push(`business_id = $${params.length}`);
    }
    if (filter.userId) {
      params.push(filter.userId);
      clauses.push(`user_id = $${params.length}`);
    }
    if (filter.action) {
      params.push(filter.action);
      clauses.push(`action = $${params.length}`);
    }
    if (filter.resourceType) {
      params.push(filter.resourceType);
      clauses.push(`resource_type = $${params.length}`);
    }
    if (filter.createdAt?.$gte) {
      params.push(filter.createdAt.$gte);
      clauses.push(`created_at >= $${params.length}`);
    }
    if (filter.createdAt?.$lte) {
      params.push(filter.createdAt.$lte);
      clauses.push(`created_at <= $${params.length}`);
    }
    if (filter.$or) {
      const search = filter.$or[0]?.userName?.source;
      if (search) {
        params.push(`%${search}%`);
        clauses.push(
          `(user_name ILIKE $${params.length} OR action ILIKE $${params.length} OR summary ILIKE $${params.length})`
        );
      }
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const { rows } = await pool.query(`SELECT COUNT(*)::int AS count FROM audit_logs ${where}`, params);
    return rows[0].count;
  }

  static async distinct(field, filter = {}) {
    const pool = getPool();
    const params = [];
    const clauses = [];

    if (filter.businessId) {
      params.push(filter.businessId);
      clauses.push(`business_id = $${params.length}`);
    }

    const column = field === 'action' ? 'action' : field === 'resourceType' ? 'resource_type' : field;
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const { rows } = await pool.query(
      `SELECT DISTINCT ${column} AS value FROM audit_logs ${where} ORDER BY value`,
      params
    );
    return rows.map((r) => r.value).filter(Boolean);
  }
}

module.exports = AuditLog;
