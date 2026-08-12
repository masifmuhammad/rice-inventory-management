const { getPool } = require('../config/db');
const { rowToDoc, pgError } = require('../db/helpers');

const mapTransactionRow = (row) => {
  const doc = rowToDoc(row);
  if (row.product_id_join) {
    doc.product = {
      _id: row.product_id_join,
      id: row.product_id_join,
      name: row.product_name,
      sku: row.product_sku,
      category: row.product_category,
      unit: row.product_unit,
      costPrice: row.product_cost_price != null ? Number(row.product_cost_price) : undefined,
      sellingPrice: row.product_selling_price != null ? Number(row.product_selling_price) : undefined,
    };
  }
  if (row.creator_id) {
    doc.createdBy = {
      _id: row.creator_id,
      id: row.creator_id,
      name: row.creator_name,
      email: row.creator_email,
    };
  }
  return doc;
};

class Transaction {
  constructor(row) {
    Object.assign(this, mapTransactionRow(row));
    this.product = this.product || this.productId;
  }

  toObject() {
    return { ...this, _id: this.id };
  }

  async populate(field, select) {
    const pool = getPool();
    if (field === 'product') {
      const { rows } = await pool.query(
        'SELECT id, name, sku, category, unit, cost_price, selling_price FROM products WHERE id = $1',
        [this.productId || this.product]
      );
      if (rows[0]) {
        this.product = {
          _id: rows[0].id,
          id: rows[0].id,
          name: rows[0].name,
          sku: rows[0].sku,
          category: rows[0].category,
          unit: rows[0].unit,
          costPrice: Number(rows[0].cost_price),
          sellingPrice: Number(rows[0].selling_price),
        };
      }
    }
    if (field === 'createdBy') {
      const { rows } = await pool.query('SELECT id, name, email FROM users WHERE id = $1', [this.createdBy]);
      if (rows[0]) {
        this.createdBy = { _id: rows[0].id, id: rows[0].id, name: rows[0].name, email: rows[0].email };
      }
    }
    return this;
  }

  async deleteOne() {
    const pool = getPool();
    await pool.query('DELETE FROM transactions WHERE id = $1', [this.id]);
  }

  static baseSelect() {
    return `
      t.*,
      pr.id AS product_id_join, pr.name AS product_name, pr.sku AS product_sku,
      pr.category AS product_category, pr.unit AS product_unit,
      pr.cost_price AS product_cost_price, pr.selling_price AS product_selling_price,
      u.id AS creator_id, u.name AS creator_name, u.email AS creator_email
    `;
  }

  static joins() {
    return `
      LEFT JOIN products pr ON t.product_id = pr.id
      LEFT JOIN users u ON t.created_by = u.id
    `;
  }

  static async findById(id, { businessId } = {}) {
    const pool = getPool();
    const params = [id];
    let where = 'WHERE t.id = $1';
    if (businessId) {
      params.push(businessId);
      where += ` AND t.business_id = $${params.length}`;
    }
    const { rows } = await pool.query(
      `SELECT ${Transaction.baseSelect()} FROM transactions t ${Transaction.joins()} ${where}`,
      params
    );
    return rows[0] ? new Transaction(rows[0]) : null;
  }

  static async find(filter = {}, { sort, skip, limit } = {}) {
    const pool = getPool();
    const params = [];
    const clauses = [];

    if (filter.businessId) {
      params.push(filter.businessId);
      clauses.push(`t.business_id = $${params.length}`);
    }

    if (filter.product) {
      params.push(filter.product);
      clauses.push(`t.product_id = $${params.length}`);
    }

    if (filter.type) {
      params.push(filter.type);
      clauses.push(`t.type = $${params.length}`);
    }

    if (filter.createdAt?.$gte) {
      params.push(filter.createdAt.$gte);
      clauses.push(`t.created_at >= $${params.length}`);
    }

    if (filter.createdAt?.$lte) {
      params.push(filter.createdAt.$lte);
      clauses.push(`t.created_at <= $${params.length}`);
    }

    if (filter.createdAt?.$lt) {
      params.push(filter.createdAt.$lt);
      clauses.push(`t.created_at < $${params.length}`);
    }

    if (filter.$or) {
      const search = filter.$or[0]?.reference?.source;
      if (search) {
        params.push(`%${search}%`);
        clauses.push(
          `(t.reference ILIKE $${params.length} OR t.supplier ILIKE $${params.length} OR t.customer ILIKE $${params.length} OR t.notes ILIKE $${params.length})`
        );
      }
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const offset = skip || 0;
    params.push(limit || 25, offset);

    const { rows } = await pool.query(
      `SELECT ${Transaction.baseSelect()}
       FROM transactions t
       ${Transaction.joins()}
       ${where}
       ORDER BY t.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    return rows.map((row) => mapTransactionRow(row));
  }

  static async countDocuments(filter = {}) {
    const pool = getPool();
    const params = [];
    const clauses = [];

    if (filter.businessId) {
      params.push(filter.businessId);
      clauses.push(`business_id = $${params.length}`);
    }

    if (filter.product) {
      params.push(filter.product);
      clauses.push(`product_id = $${params.length}`);
    }
    if (filter.type) {
      params.push(filter.type);
      clauses.push(`type = $${params.length}`);
    }
    if (filter.createdAt?.$gte) {
      params.push(filter.createdAt.$gte);
      clauses.push(`created_at >= $${params.length}`);
    }
    if (filter.createdAt?.$lte) {
      params.push(filter.createdAt.$lte);
      clauses.push(`created_at <= $${params.length}`);
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const { rows } = await pool.query(`SELECT COUNT(*)::int AS count FROM transactions ${where}`, params);
    return rows[0].count;
  }

  static async create(data) {
    const pool = getPool();
    try {
      const { rows } = await pool.query(
        `INSERT INTO transactions (
          business_id, type, product_id, quantity, unit, price, total_value, reference,
          batch_number, expiry_date, supplier, customer, notes, created_by,
          stock_before, stock_after
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
        RETURNING *`,
        [
          data.businessId,
          data.type,
          data.product,
          data.quantity,
          data.unit,
          data.price ?? null,
          data.totalValue ?? null,
          data.reference ?? null,
          data.batchNumber ?? null,
          data.expiryDate ?? null,
          data.supplier ?? null,
          data.customer ?? null,
          data.notes ?? null,
          data.createdBy,
          data.stockBefore,
          data.stockAfter,
        ]
      );
      return new Transaction(rows[0]);
    } catch (error) {
      throw pgError(error);
    }
  }

  static async aggregate(pipeline) {
    const pool = getPool();
    const matchStage = pipeline.find((p) => p.$match)?.$match || {};
    const groupStage = pipeline.find((p) => p.$group)?.$group;
    const params = [];

    let where = 'WHERE 1=1';
    if (matchStage.businessId) {
      params.push(matchStage.businessId);
      where += ` AND t.business_id = $${params.length}`;
    }
    if (matchStage.createdAt?.$gte) {
      params.push(matchStage.createdAt.$gte);
      where += ` AND t.created_at >= $${params.length}`;
    }
    if (matchStage.createdAt?.$lte) {
      params.push(matchStage.createdAt.$lte);
      where += ` AND t.created_at <= $${params.length}`;
    }
    if (matchStage.createdAt?.$lt) {
      params.push(matchStage.createdAt.$lt);
      where += ` AND t.created_at < $${params.length}`;
    }
    if (matchStage.product) {
      params.push(matchStage.product);
      where += ` AND t.product_id = $${params.length}`;
    }
    if (matchStage.type) {
      params.push(matchStage.type);
      where += ` AND t.type = $${params.length}`;
    }

    if (groupStage?._id === '$type') {
      const { rows } = await pool.query(
        `SELECT type AS _id,
          COALESCE(SUM(quantity), 0) AS quantity,
          COALESCE(SUM(total_value), 0) AS value,
          COUNT(*)::int AS count
        FROM transactions t ${where}
        GROUP BY type`,
        params
      );
      return rows.map((r) => ({
        _id: r._id,
        quantity: Number(r.quantity),
        value: Number(r.value),
        count: r.count,
      }));
    }

    if (groupStage?._id?.$dateToString) {
      const { rows } = await pool.query(
        `SELECT to_char(t.created_at, 'YYYY-MM-DD') AS _id,
          COALESCE(SUM(CASE WHEN type = 'stock_in' THEN quantity ELSE 0 END), 0) AS stock_in,
          COALESCE(SUM(CASE WHEN type = 'stock_out' THEN quantity ELSE 0 END), 0) AS stock_out,
          COALESCE(SUM(CASE WHEN type = 'stock_out' THEN total_value ELSE 0 END), 0) AS revenue
        FROM transactions t ${where}
        GROUP BY 1
        ORDER BY 1`,
        params
      );
      return rows.map((r) => ({
        _id: r._id,
        stock_in: Number(r.stock_in),
        stock_out: Number(r.stock_out),
        revenue: Number(r.revenue),
      }));
    }

    if (groupStage?._id === '$product') {
      const { rows } = await pool.query(
        `SELECT t.product_id AS _id,
          COALESCE(SUM(CASE WHEN t.type = 'stock_in' THEN t.quantity ELSE 0 END), 0) AS stock_in,
          COALESCE(SUM(CASE WHEN t.type = 'stock_out' THEN t.quantity ELSE 0 END), 0) AS stock_out,
          COUNT(*) FILTER (WHERE t.type = 'adjustment')::int AS adjustments,
          COALESCE(SUM(CASE WHEN t.type = 'stock_out' THEN t.total_value ELSE 0 END), 0) AS revenue,
          COUNT(*)::int AS transaction_count,
          p.name AS product_name, p.sku AS product_sku, p.category AS product_category, p.unit AS product_unit
        FROM transactions t
        LEFT JOIN products p ON t.product_id = p.id
        ${where}
        GROUP BY t.product_id, p.name, p.sku, p.category, p.unit
        ORDER BY stock_out DESC`,
        params
      );
      return rows.map((r) => ({
        _id: r._id,
        stockIn: Number(r.stock_in),
        stockOut: Number(r.stock_out),
        adjustments: r.adjustments,
        revenue: Number(r.revenue),
        transactionCount: r.transaction_count,
        product: r.product_name
          ? {
              name: r.product_name,
              sku: r.product_sku,
              category: r.product_category,
              unit: r.product_unit,
            }
          : null,
      }));
    }

    if (groupStage?._id === '$product.category') {
      const { rows } = await pool.query(
        `SELECT p.category AS _id,
          COALESCE(SUM(t.total_value), 0) AS revenue,
          COALESCE(SUM(t.quantity), 0) AS quantity
        FROM transactions t
        JOIN products p ON t.product_id = p.id
        ${where}
        GROUP BY p.category
        ORDER BY revenue DESC`,
        params
      );
      return rows.map((r) => ({ _id: r._id, revenue: Number(r.revenue), quantity: Number(r.quantity) }));
    }

    if (groupStage?._id === null && groupStage.totalTransactions) {
      const { rows } = await pool.query(
        `SELECT COUNT(*)::int AS total_transactions,
          COALESCE(SUM(CASE WHEN type = 'stock_out' THEN total_value ELSE 0 END), 0) AS total_revenue
        FROM transactions t ${where}`,
        params
      );
      return [
        {
          _id: null,
          totalTransactions: rows[0].total_transactions,
          totalRevenue: Number(rows[0].total_revenue),
        },
      ];
    }

    if (groupStage?._id && groupStage.totalQuantitySold) {
      const { rows } = await pool.query(
        `SELECT t.product_id AS _id,
          COALESCE(SUM(t.quantity), 0) AS total_quantity_sold,
          COALESCE(SUM(t.total_value), 0) AS total_revenue,
          COUNT(*)::int AS transaction_count,
          p.name AS product_name, p.category AS product_category, p.unit AS product_unit
        FROM transactions t
        LEFT JOIN products p ON t.product_id = p.id
        ${where}
        GROUP BY t.product_id, p.name, p.category, p.unit
        ORDER BY total_revenue DESC
        LIMIT 10`,
        params
      );
      return rows.map((r) => ({
        _id: r._id,
        totalQuantitySold: Number(r.total_quantity_sold),
        totalRevenue: Number(r.total_revenue),
        transactionCount: r.transaction_count,
        product: r.product_name
          ? { name: r.product_name, category: r.product_category, unit: r.product_unit }
          : null,
      }));
    }

    return [];
  }

  static async deleteMany() {
    const pool = getPool();
    const result = await pool.query('DELETE FROM transactions');
    return { deletedCount: result.rowCount };
  }
}

module.exports = Transaction;
