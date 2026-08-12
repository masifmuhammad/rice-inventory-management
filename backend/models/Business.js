const { getPool } = require('../config/db');
const { rowToDoc, pgError } = require('../db/helpers');

const slugify = (name) =>
  String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'business';

class Business {
  constructor(row) {
    Object.assign(this, rowToDoc(row));
    this.isActive = row?.is_active ?? this.isActive ?? true;
    this.createdBy = row?.created_by ?? this.createdBy;
  }

  toPublic() {
    return {
      id: this.id,
      _id: this.id,
      name: this.name,
      slug: this.slug,
      isActive: this.isActive,
    };
  }

  static async findById(id) {
    if (!id) return null;
    const pool = getPool();
    const { rows } = await pool.query('SELECT * FROM businesses WHERE id = $1', [id]);
    return rows[0] ? new Business(rows[0]) : null;
  }

  static async findOne(filter = {}) {
    const pool = getPool();
    const params = [];
    const clauses = [];

    if (filter.id || filter._id) {
      params.push(filter.id || filter._id);
      clauses.push(`id = $${params.length}`);
    }
    if (filter.slug) {
      params.push(filter.slug);
      clauses.push(`slug = $${params.length}`);
    }
    if (filter.isActive !== undefined) {
      params.push(filter.isActive);
      clauses.push(`is_active = $${params.length}`);
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const { rows } = await pool.query(`SELECT * FROM businesses ${where} LIMIT 1`, params);
    return rows[0] ? new Business(rows[0]) : null;
  }

  static async find(filter = {}, { sort, limit } = {}) {
    const pool = getPool();
    const params = [];
    const clauses = [];

    if (filter.isActive !== undefined) {
      params.push(filter.isActive);
      clauses.push(`is_active = $${params.length}`);
    }

    if (filter.ids?.length) {
      params.push(filter.ids);
      clauses.push(`id = ANY($${params.length}::uuid[])`);
    }

    let orderBy = 'name ASC';
    if (sort?.name === 1) orderBy = 'name ASC';
    if (sort?.createdAt === -1) orderBy = 'created_at DESC';

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const limitSql = limit ? `LIMIT $${params.push(limit)}` : '';

    const { rows } = await pool.query(
      `SELECT * FROM businesses ${where} ORDER BY ${orderBy} ${limitSql}`,
      params
    );
    return rows.map((row) => new Business(row));
  }

  static async create({ name, slug, createdBy, isActive = true }) {
    const pool = getPool();
    let candidate = slug || slugify(name);
    let attempt = 0;

    while (attempt < 5) {
      try {
        const { rows } = await pool.query(
          `INSERT INTO businesses (name, slug, is_active, created_by)
           VALUES ($1, $2, $3, $4)
           RETURNING *`,
          [name, candidate, isActive, createdBy ?? null]
        );
        return new Business(rows[0]);
      } catch (error) {
        if (error.code === '23505' && attempt < 4) {
          attempt += 1;
          candidate = `${slugify(name)}-${attempt}`;
          continue;
        }
        throw pgError(error);
      }
    }
    throw new Error('Could not create business');
  }

  async save() {
    const pool = getPool();
    const { rows } = await pool.query(
      `UPDATE businesses SET name = $1, slug = $2, is_active = $3, updated_at = NOW()
       WHERE id = $4 RETURNING *`,
      [this.name, this.slug, this.isActive, this.id]
    );
    Object.assign(this, rowToDoc(rows[0]));
    this.isActive = rows[0].is_active;
    return this;
  }

  static async addAdminMembership(userId, businessId) {
    const pool = getPool();
    await pool.query(
      `INSERT INTO business_admin_memberships (user_id, business_id)
       VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [userId, businessId]
    );
  }

  static async removeAdminMembership(userId, businessId) {
    const pool = getPool();
    await pool.query(
      'DELETE FROM business_admin_memberships WHERE user_id = $1 AND business_id = $2',
      [userId, businessId]
    );
  }

  static async getAdminBusinessIds(userId) {
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT business_id FROM business_admin_memberships WHERE user_id = $1`,
      [userId]
    );
    return rows.map((r) => r.business_id);
  }

  static async userCanAccess(userId, businessId, { userBusinessId, role } = {}) {
    if (!businessId) return false;
    if (userBusinessId && String(userBusinessId) === String(businessId)) return true;
    if (role !== 'admin') return false;
    const ids = await Business.getAdminBusinessIds(userId);
    return ids.some((id) => String(id) === String(businessId));
  }

  static async getAccessibleBusinesses(user) {
    if (!user) return [];
    const pool = getPool();
    const userId = user.id || user._id;
    const homeBusinessId = user.businessId || user.business_id;

    if (user.role === 'admin') {
      const { rows } = await pool.query(
        `SELECT DISTINCT b.*
         FROM businesses b
         LEFT JOIN business_admin_memberships m ON m.business_id = b.id AND m.user_id = $1
         WHERE ($2::uuid IS NOT NULL AND b.id = $2) OR m.user_id IS NOT NULL
         ORDER BY b.name ASC`,
        [userId, homeBusinessId]
      );
      return rows.map((row) => new Business(row));
    }

    if (homeBusinessId) {
      const business = await Business.findById(homeBusinessId);
      return business ? [business] : [];
    }
    return [];
  }
}

module.exports = Business;
