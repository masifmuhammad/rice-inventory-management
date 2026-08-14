const { getPool } = require('../config/db');
const { rowToDoc, pgError, resolveUuid, likePattern } = require('../db/helpers');

const IN_CATEGORIES = ['Sale', 'Owner investment', 'Loan received', 'Customer advance', 'Refund', 'Other income'];
const OUT_CATEGORIES = [
  'Personal expense',
  'Shop maintenance',
  'Supplier payment',
  'Salary',
  'Utilities',
  'Transport',
  'Rent',
  'Loan repayment',
  'Other expense',
];

const mapEntryRow = (row) => {
  const doc = rowToDoc(row);
  if (row.creator_id) {
    doc.createdBy = {
      _id: row.creator_id,
      id: row.creator_id,
      name: row.creator_name,
      email: row.creator_email,
    };
  }
  if (row.transaction_id_join) {
    doc.transaction = {
      _id: row.transaction_id_join,
      id: row.transaction_id_join,
      reference: row.transaction_reference,
      customer: row.transaction_customer,
      quantity: row.transaction_quantity != null ? Number(row.transaction_quantity) : undefined,
      unit: row.transaction_unit,
    };
  }
  return doc;
};

class CashEntry {
  constructor(row) {
    Object.assign(this, mapEntryRow(row));
  }

  toObject() {
    return { ...this, _id: this.id };
  }

  async save() {
    const pool = getPool();
    const { rows } = await pool.query(
      `UPDATE cash_entries SET
        direction = $1, amount = $2, category = $3, purpose = $4, party = $5,
        reference = $6, notes = $7, occurred_at = $8, updated_at = NOW()
      WHERE id = $9
      RETURNING *`,
      [
        this.direction,
        this.amount,
        this.category,
        this.purpose,
        this.party ?? null,
        this.reference ?? null,
        this.notes ?? null,
        this.occurredAt,
        this.id,
      ]
    );
    Object.assign(this, mapEntryRow(rows[0]));
    return this;
  }

  async populate(field) {
    const pool = getPool();
    if (field === 'createdBy') {
      const { rows } = await pool.query('SELECT id, name, email FROM users WHERE id = $1', [this.createdBy]);
      if (rows[0]) {
        this.createdBy = { _id: rows[0].id, id: rows[0].id, name: rows[0].name, email: rows[0].email };
      }
    }
    if (field === 'transaction' && this.transactionId) {
      const { rows } = await pool.query(
        'SELECT id, reference, customer, quantity, unit FROM transactions WHERE id = $1',
        [this.transactionId]
      );
      if (rows[0]) {
        this.transaction = {
          _id: rows[0].id,
          id: rows[0].id,
          reference: rows[0].reference,
          customer: rows[0].customer,
          quantity: Number(rows[0].quantity),
          unit: rows[0].unit,
        };
      }
    }
    return this;
  }

  async deleteOne() {
    const pool = getPool();
    await pool.query('DELETE FROM cash_entries WHERE id = $1', [this.id]);
  }

  static selectWithJoins() {
    return `
      ce.*,
      u.id AS creator_id, u.name AS creator_name, u.email AS creator_email,
      tr.id AS transaction_id_join, tr.reference AS transaction_reference,
      tr.customer AS transaction_customer, tr.quantity AS transaction_quantity,
      tr.unit AS transaction_unit
    `;
  }

  static joins() {
    return `
      LEFT JOIN users u ON ce.created_by = u.id
      LEFT JOIN transactions tr ON ce.transaction_id = tr.id
    `;
  }

  static buildWhere(filter = {}) {
    const params = [];
    const clauses = [];

    if (filter.businessId) {
      params.push(filter.businessId);
      clauses.push(`ce.business_id = $${params.length}`);
    }

    if (filter.direction) {
      params.push(filter.direction);
      clauses.push(`ce.direction = $${params.length}`);
    }
    if (filter.category) {
      params.push(filter.category);
      clauses.push(`ce.category = $${params.length}`);
    }
    if (filter.source) {
      params.push(filter.source);
      clauses.push(`ce.source = $${params.length}`);
    }
    if (filter._id) {
      params.push(filter._id);
      clauses.push(`ce.id = $${params.length}`);
    }
    if (filter.transaction) {
      params.push(filter.transaction);
      clauses.push(`ce.transaction_id = $${params.length}`);
    }
    if (filter.occurredAt?.$gte) {
      params.push(filter.occurredAt.$gte);
      clauses.push(`ce.occurred_at >= $${params.length}`);
    }
    if (filter.occurredAt?.$lte) {
      params.push(filter.occurredAt.$lte);
      clauses.push(`ce.occurred_at <= $${params.length}`);
    }
    if (filter.occurredAt?.$lt) {
      params.push(filter.occurredAt.$lt);
      clauses.push(`ce.occurred_at < $${params.length}`);
    }
    if (filter.$or) {
      const search = filter.$or[0]?.purpose?.source;
      if (search) {
        params.push(likePattern(search));
        clauses.push(
          `(ce.purpose ILIKE $${params.length} OR ce.party ILIKE $${params.length} OR ce.reference ILIKE $${params.length} OR ce.notes ILIKE $${params.length} OR ce.category ILIKE $${params.length})`
        );
      }
    }

    if (filter.$and) {
      for (const part of filter.$and) {
        if (part.$or) {
          const oldest = part.$or[0]?.occurredAt?.$lt;
          const sameTime = part.$or[1];
          if (oldest) {
            params.push(oldest);
            let sub = `(ce.occurred_at < $${params.length}`;
            if (sameTime?.occurredAt && sameTime?._id?.$lt) {
              params.push(sameTime.occurredAt, sameTime._id.$lt);
              sub += ` OR (ce.occurred_at = $${params.length - 1} AND ce.id < $${params.length})`;
            }
            sub += ')';
            clauses.push(sub);
          }
        }
      }
    }

    return {
      where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '',
      params,
    };
  }

  static async findById(id, { businessId } = {}) {
    const pool = getPool();
    const params = [id];
    let where = 'WHERE ce.id = $1';
    if (businessId) {
      params.push(businessId);
      where += ` AND ce.business_id = $${params.length}`;
    }
    const { rows } = await pool.query(
      `SELECT ${CashEntry.selectWithJoins()} FROM cash_entries ce ${CashEntry.joins()} ${where}`,
      params
    );
    return rows[0] ? new CashEntry(rows[0]) : null;
  }

  static async findOne(filter) {
    const { where, params } = CashEntry.buildWhere(filter);
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT ${CashEntry.selectWithJoins()} FROM cash_entries ce ${CashEntry.joins()} ${where} LIMIT 1`,
      params
    );
    return rows[0] ? new CashEntry(rows[0]) : null;
  }

  static async find(filter = {}, { sort, skip, limit } = {}) {
    const { where, params } = CashEntry.buildWhere(filter);
    const pool = getPool();
    const queryParams = [...params];
    queryParams.push(limit || 25, skip || 0);

    const { rows } = await pool.query(
      `SELECT ${CashEntry.selectWithJoins()}
       FROM cash_entries ce
       ${CashEntry.joins()}
       ${where}
       ORDER BY ce.occurred_at DESC, ce.id DESC
       LIMIT $${queryParams.length - 1} OFFSET $${queryParams.length}`,
      queryParams
    );

    return rows.map((row) => mapEntryRow(row));
  }

  static async countDocuments(filter = {}) {
    const { where, params } = CashEntry.buildWhere(filter);
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS count FROM cash_entries ce ${where}`,
      params
    );
    return rows[0].count;
  }

  static async create(data) {
    const pool = getPool();
    try {
      const { rows } = await pool.query(
        `INSERT INTO cash_entries (
          business_id, direction, amount, category, purpose, party, reference, notes,
          source, transaction_id, occurred_at, created_by, migrated_from
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
        RETURNING *`,
        [
          data.businessId,
          data.direction,
          data.amount,
          data.category || (data.direction === 'in' ? 'Other income' : 'Other expense'),
          data.purpose,
          data.party ?? null,
          data.reference ?? null,
          data.notes ?? null,
          data.source || 'manual',
          data.transaction ?? null,
          data.occurredAt || new Date(),
          data.createdBy,
          data.migratedFrom ?? null,
        ]
      );
      return new CashEntry(rows[0]);
    } catch (error) {
      if (error.code === '23505') {
        error.code = 11000;
      }
      throw pgError(error);
    }
  }

  static async deleteOne(filter) {
    const pool = getPool();
    const transactionId = resolveUuid(filter.transaction);
    if (!transactionId) return;

    await pool.query('DELETE FROM cash_entries WHERE transaction_id = $1 AND source = $2', [
      transactionId,
      filter.source,
    ]);
  }

  static async aggregate(pipeline) {
    const pool = getPool();
    const match = pipeline.find((p) => p.$match)?.$match || {};
    const group = pipeline.find((p) => p.$group)?.$group;
    const { where, params } = CashEntry.buildWhere(match);

    if (group?._id === '$direction') {
      const { rows } = await pool.query(
        `SELECT direction AS _id, COALESCE(SUM(amount), 0) AS total, COUNT(*)::int AS count
         FROM cash_entries ce ${where}
         GROUP BY direction`,
        params
      );
      return rows.map((r) => ({ _id: r._id, total: Number(r.total), count: r.count }));
    }

    if (group?._id?.direction) {
      const { rows } = await pool.query(
        `SELECT ce.direction, ce.category,
          COALESCE(SUM(ce.amount), 0) AS total, COUNT(*)::int AS count
         FROM cash_entries ce ${where}
         GROUP BY ce.direction, ce.category
         ORDER BY total DESC`,
        params
      );
      return rows.map((r) => ({
        _id: { direction: r.direction, category: r.category },
        total: Number(r.total),
        count: r.count,
      }));
    }

    if (group?._id === null) {
      const { rows } = await pool.query(
        `SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*)::int AS count
         FROM cash_entries ce ${where}`,
        params
      );
      return [{ _id: null, total: Number(rows[0].total), count: rows[0].count }];
    }

    return [];
  }

  static async deleteMany() {
    const pool = getPool();
    const result = await pool.query('DELETE FROM cash_entries');
    return { deletedCount: result.rowCount };
  }
}

CashEntry.IN_CATEGORIES = IN_CATEGORIES;
CashEntry.OUT_CATEGORIES = OUT_CATEGORIES;

module.exports = CashEntry;
module.exports.IN_CATEGORIES = IN_CATEGORIES;
module.exports.OUT_CATEGORIES = OUT_CATEGORIES;
