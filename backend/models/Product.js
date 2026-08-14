const { getPool } = require('../config/db');
const { rowToDoc, rowsToDocs, pgError, resolveUuid, likePattern } = require('../db/helpers');

const PRODUCT_COLUMNS = `
  p.id, p.business_id, p.name, p.sku, p.category, p.description, p.unit, p.current_stock,
  p.min_stock_level, p.max_stock_level, p.cost_price, p.selling_price,
  p.location, p.batch_number, p.expiry_date, p.supplier, p.is_active,
  p.created_by, p.created_at, p.updated_at
`;

const attachCreator = (doc, row) => {
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

const mapProductRow = (row) => attachCreator(rowToDoc(row), row);

class Product {
  constructor(row) {
    Object.assign(this, mapProductRow(row));
  }

  toObject() {
    return { ...this, _id: this.id };
  }

  async save() {
    const pool = getPool();
    const { rows } = await pool.query(
      `UPDATE products SET
        name = $1, sku = $2, category = $3, description = $4, unit = $5,
        current_stock = $6, min_stock_level = $7, max_stock_level = $8,
        cost_price = $9, selling_price = $10, location = $11, batch_number = $12,
        expiry_date = $13, supplier = $14, is_active = $15, updated_at = NOW()
      WHERE id = $16 AND business_id = $17
      RETURNING *`,
      [
        this.name,
        this.sku ?? null,
        this.category,
        this.description ?? null,
        this.unit,
        this.currentStock,
        this.minStockLevel,
        this.maxStockLevel ?? null,
        this.costPrice,
        this.sellingPrice,
        this.location ?? null,
        this.batchNumber ?? null,
        this.expiryDate ?? null,
        this.supplier ?? null,
        this.isActive,
        this.id,
        this.businessId,
      ]
    );

    // The tenant predicate above means a mismatched row simply matches nothing.
    // Without this check the miss would surface as a TypeError deep inside the
    // row mapper rather than as the 404 it actually is.
    if (!rows[0]) {
      const error = new Error('Product not found');
      error.status = 404;
      throw error;
    }

    Object.assign(this, mapProductRow(rows[0]));
    return this;
  }

  async populate(field, select) {
    if (field === 'createdBy' && this.createdBy) return this;
    if (field === 'createdBy' && this.createdById) {
      const pool = getPool();
      const { rows } = await pool.query('SELECT id, name, email FROM users WHERE id = $1', [
        this.createdById || this.createdBy,
      ]);
      if (rows[0]) {
        this.createdBy = { _id: rows[0].id, id: rows[0].id, name: rows[0].name, email: rows[0].email };
      }
    }
    return this;
  }

  static creatorJoin() {
    return `
      LEFT JOIN users creator ON p.created_by = creator.id
    `;
  }

  static creatorSelect() {
    return `, creator.id AS creator_id, creator.name AS creator_name, creator.email AS creator_email`;
  }

  static async findById(id, { businessId } = {}) {
    const pool = getPool();
    const params = [id];
    let where = 'WHERE p.id = $1';
    if (businessId) {
      params.push(businessId);
      where += ` AND p.business_id = $${params.length}`;
    }
    const { rows } = await pool.query(
      `SELECT ${PRODUCT_COLUMNS}${Product.creatorSelect()}
       FROM products p
       ${Product.creatorJoin()}
       ${where}`,
      params
    );
    return rows[0] ? new Product(rows[0]) : null;
  }

  static async findOne(filter = {}, { sort, select } = {}) {
    const pool = getPool();
    const params = [];
    const clauses = [];

    if (filter.businessId) {
      params.push(filter.businessId);
      clauses.push(`p.business_id = $${params.length}`);
    }

    if (filter._id) {
      params.push(filter._id);
      clauses.push(`p.id = $${params.length}`);
    }

    if (filter.sku) {
      if (filter.sku instanceof RegExp) {
        params.push(filter.sku.source);
        clauses.push(`p.sku ~* $${params.length}`);
      } else {
        params.push(filter.sku);
        clauses.push(`p.sku = $${params.length}`);
      }
    }

    if (filter.isActive !== undefined) {
      params.push(filter.isActive);
      clauses.push(`p.is_active = $${params.length}`);
    }

    if (filter._id?.$ne) {
      params.push(filter._id.$ne);
      clauses.push(`p.id <> $${params.length}`);
    }

    let orderBy = '';
    if (sort?.sku === -1) orderBy = 'ORDER BY p.sku DESC';

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const { rows } = await pool.query(
      `SELECT ${select === 'sku' ? 'p.sku' : `${PRODUCT_COLUMNS}${Product.creatorSelect()}`}
       FROM products p
       ${select === 'sku' ? '' : Product.creatorJoin()}
       ${where}
       ${orderBy}
       LIMIT 1`,
      params
    );

    if (!rows[0]) return null;
    if (select === 'sku') return { sku: rows[0].sku };
    return new Product(rows[0]);
  }

  static async find(filter = {}, { sort, limit, select } = {}) {
    const pool = getPool();
    const params = [];
    const clauses = [];

    if (filter.businessId) {
      params.push(filter.businessId);
      clauses.push(`p.business_id = $${params.length}`);
    }

    if (filter.isActive !== undefined) {
      params.push(filter.isActive);
      clauses.push(`p.is_active = $${params.length}`);
    }

    if (filter.category) {
      params.push(filter.category);
      clauses.push(`p.category = $${params.length}`);
    }

    if (filter.$expr?.$lte) {
      clauses.push('p.current_stock <= p.min_stock_level');
    }

    if (filter.expiryDate?.$gte) {
      params.push(filter.expiryDate.$gte);
      clauses.push(`p.expiry_date >= $${params.length}`);
    }

    if (filter.expiryDate?.$lte) {
      params.push(filter.expiryDate.$lte);
      clauses.push(`p.expiry_date <= $${params.length}`);
    }

    if (filter.$or) {
      const search = filter.$or[0]?.name?.source;
      if (search) {
        params.push(likePattern(search));
        clauses.push(
          `(p.name ILIKE $${params.length} OR p.sku ILIKE $${params.length} OR p.supplier ILIKE $${params.length} OR p.batch_number ILIKE $${params.length})`
        );
      }
    }

    const sortMap = {
      name: 'p.name ASC',
      newest: 'p.created_at DESC',
      stock: 'p.current_stock DESC',
      value: 'p.created_at DESC',
      currentStock: 'p.current_stock ASC',
      expiryDate: 'p.expiry_date ASC',
    };

    const orderKey = sort ? Object.keys(sort)[0] : null;
    const orderBy = sortMap[orderKey] || 'p.created_at DESC';

    if (limit) params.push(limit);

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const limitSql = limit ? `LIMIT $${params.length}` : '';
    const columns =
      select === 'name sku unit currentStock minStockLevel'
        ? 'p.id, p.name, p.sku, p.unit, p.current_stock, p.min_stock_level'
        : select === 'name sku expiryDate currentStock unit'
          ? 'p.id, p.name, p.sku, p.expiry_date, p.current_stock, p.unit'
          : `${PRODUCT_COLUMNS}${Product.creatorSelect()}`;

    const { rows } = await pool.query(
      `SELECT ${columns}
       FROM products p
       ${columns.includes('creator_id') || columns.includes('created_by') ? Product.creatorJoin() : ''}
       ${where}
       ORDER BY ${orderBy}
       ${limitSql}`,
      params
    );

    return rows.map((row) => (select ? rowToDoc(row) : new Product(row)));
  }

  static async create(data) {
    const pool = getPool();
    try {
      const { rows } = await pool.query(
        `INSERT INTO products (
          business_id, name, sku, category, description, unit, current_stock, min_stock_level,
          max_stock_level, cost_price, selling_price, location, batch_number,
          expiry_date, supplier, is_active, created_by
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
        RETURNING *`,
        [
          data.businessId,
          data.name,
          data.sku ?? null,
          data.category,
          data.description ?? null,
          data.unit || 'kg',
          data.currentStock ?? 0,
          data.minStockLevel ?? 0,
          data.maxStockLevel ?? null,
          data.costPrice,
          data.sellingPrice,
          data.location ?? null,
          data.batchNumber ?? null,
          data.expiryDate ?? null,
          data.supplier ?? null,
          data.isActive ?? true,
          data.createdBy,
        ]
      );
      return new Product(rows[0]);
    } catch (error) {
      throw pgError(error);
    }
  }

  static async findOneAndUpdate(filter, update, { new: returnNew } = {}) {
    const pool = getPool();
    const id = resolveUuid(filter._id);
    if (!id) return null;

    if (update.$inc?.currentStock !== undefined) {
      const delta = update.$inc.currentStock;
      const guard = filter.currentStock?.$gte;

      if (delta < 0 && guard !== undefined) {
        const { rows } = await pool.query(
          `UPDATE products
           SET current_stock = current_stock + $2, updated_at = NOW()
           WHERE id = $1 AND is_active = TRUE AND current_stock >= $3
           RETURNING *`,
          [id, delta, guard]
        );
        return rows[0] ? new Product(rows[0]) : null;
      }

      const { rows } = await pool.query(
        `UPDATE products
         SET current_stock = current_stock + $2, updated_at = NOW()
         WHERE id = $1 AND is_active = TRUE
         RETURNING *`,
        [id, delta]
      );
      return rows[0] ? new Product(rows[0]) : null;
    }

    if (update.$set?.currentStock !== undefined) {
      const { rows } = await pool.query(
        `UPDATE products
         SET current_stock = $2, updated_at = NOW()
         WHERE id = $1 AND is_active = TRUE
         RETURNING *`,
        [id, update.$set.currentStock]
      );
      return rows[0] ? new Product(rows[0]) : null;
    }

    return null;
  }

  static async updateOne(filter, update) {
    const pool = getPool();
    const id = resolveUuid(filter._id);
    if (!id) return;

    if (update.$inc?.currentStock !== undefined) {
      await pool.query(
        'UPDATE products SET current_stock = current_stock + $2, updated_at = NOW() WHERE id = $1',
        [id, update.$inc.currentStock]
      );
    } else if (update.$set?.currentStock !== undefined) {
      await pool.query(
        'UPDATE products SET current_stock = $2, updated_at = NOW() WHERE id = $1',
        [id, update.$set.currentStock]
      );
    }
  }

  static async aggregate(pipeline, { businessId } = {}) {
    const pool = getPool();
    const match = pipeline.find((p) => p.$match)?.$match || {};
    const group = pipeline.find((p) => p.$group)?.$group;
    const businessClause = businessId ? 'AND business_id = $1' : '';
    const params = businessId ? [businessId] : [];

    if (group?._id === null && group.totalProducts) {
      const { rows } = await pool.query(
        `SELECT
          COUNT(*)::int AS total_products,
          COALESCE(SUM(current_stock), 0) AS total_stock_quantity,
          COALESCE(SUM(current_stock * cost_price), 0) AS total_stock_value,
          COALESCE(SUM(current_stock * selling_price), 0) AS total_potential_value
        FROM products
        WHERE is_active = TRUE ${businessClause}`,
        params
      );
      return [
        {
          _id: null,
          totalProducts: rows[0].total_products,
          totalStockQuantity: Number(rows[0].total_stock_quantity),
          totalStockValue: Number(rows[0].total_stock_value),
          totalPotentialValue: Number(rows[0].total_potential_value),
        },
      ];
    }

    if (group?._id === '$category') {
      const { rows } = await pool.query(
        `SELECT
          category AS _id,
          COALESCE(SUM(current_stock), 0) AS total_stock,
          COALESCE(SUM(current_stock * cost_price), 0) AS total_value,
          COALESCE(SUM(current_stock * selling_price), 0) AS total_potential_value,
          COUNT(*)::int AS product_count
        FROM products
        WHERE is_active = TRUE ${businessClause}
        GROUP BY category
        ORDER BY total_value DESC`,
        params
      );
      return rows.map((r) => ({
        _id: r._id,
        totalStock: Number(r.total_stock),
        totalValue: Number(r.total_value),
        totalPotentialValue: Number(r.total_potential_value),
        productCount: r.product_count,
      }));
    }

    if (group?._id === null && group.total) {
      const { rows } = await pool.query(
        `SELECT
          COUNT(*)::int AS total,
          COALESCE(SUM(current_stock * cost_price), 0) AS stock_value,
          COALESCE(SUM(current_stock * selling_price), 0) AS retail_value,
          COUNT(*) FILTER (WHERE current_stock <= min_stock_level)::int AS low_stock
        FROM products
        WHERE is_active = TRUE ${businessClause}`,
        params
      );
      return [
        {
          _id: null,
          total: rows[0].total,
          stockValue: Number(rows[0].stock_value),
          retailValue: Number(rows[0].retail_value),
          lowStock: rows[0].low_stock,
        },
      ];
    }

    if (group?._id === null && group.value) {
      const { rows } = await pool.query(
        `SELECT
          COALESCE(SUM(current_stock * cost_price), 0) AS value,
          COUNT(*)::int AS count
        FROM products
        WHERE is_active = TRUE ${businessClause}`,
        params
      );
      return [{ _id: null, value: Number(rows[0].value), count: rows[0].count }];
    }

    return [];
  }

  static async deleteMany() {
    const pool = getPool();
    const result = await pool.query('DELETE FROM products');
    return { deletedCount: result.rowCount };
  }
}

module.exports = Product;
