const bcrypt = require('bcryptjs');
const { getPool } = require('../config/db');
const { rowToDoc, rowsToDocs, pgError } = require('../db/helpers');

const ROLES = ['admin', 'accountant', 'worker'];
const STATUSES = ['pending', 'active', 'suspended', 'rejected'];

const USER_COLUMNS = `
  id, business_id, name, email, role, status, status_reason, approved_by, approved_at,
  must_change_password, sessions_valid_from, last_login_at, last_login_ip,
  failed_login_attempts, locked_until, avatar, created_at, updated_at
`;

const USER_COLUMNS_WITH_PASSWORD = `${USER_COLUMNS.trim().replace(/\n/g, ' ')}, password`;

class User {
  constructor(row) {
    const doc = rowToDoc(row);
    // Never route the stored hash through the password setter — that marks it
    // modified and the next save() bcrypt-hashes it again, breaking login.
    const { password, ...rest } = doc;
    Object.assign(this, rest);
    this._password = password ?? row?.password ?? null;
  }

  comparePassword(candidate) {
    return bcrypt.compare(candidate, this._password || this.password);
  }

  isLocked() {
    return Boolean(this.lockedUntil && new Date(this.lockedUntil) > new Date());
  }

  toPublic() {
    return {
      id: this.id,
      _id: this.id,
      businessId: this.businessId,
      name: this.name,
      email: this.email,
      role: this.role,
      status: this.status,
      statusReason: this.statusReason,
      mustChangePassword: this.mustChangePassword,
      avatar: this.avatar || null,
      createdAt: this.createdAt,
      lastLoginAt: this.lastLoginAt,
    };
  }

  toObject() {
    const { _password, password, ...rest } = this;
    return { ...rest, _id: this.id };
  }

  async save({ validateBeforeSave = true } = {}) {
    const pool = getPool();

    if (this._passwordModified) {
      this._password = await bcrypt.hash(this._password || this.password, 10);
      this.sessionsValidFrom = new Date();
      this._passwordModified = false;

      const { rows } = await pool.query(
        `UPDATE users SET
          business_id = $1, name = $2, email = $3, password = $4, role = $5, status = $6,
          status_reason = $7, approved_by = $8, approved_at = $9,
          must_change_password = $10, sessions_valid_from = $11,
          last_login_at = $12, last_login_ip = $13,
          failed_login_attempts = $14, locked_until = $15, avatar = $16,
          updated_at = NOW()
        WHERE id = $17
        RETURNING ${USER_COLUMNS_WITH_PASSWORD}`,
        [
          this.businessId ?? null,
          this.name,
          this.email,
          this._password,
          this.role,
          this.status,
          this.statusReason ?? null,
          this.approvedBy ?? null,
          this.approvedAt ?? null,
          this.mustChangePassword ?? false,
          this.sessionsValidFrom ?? new Date(),
          this.lastLoginAt ?? null,
          this.lastLoginIp ?? null,
          this.failedLoginAttempts ?? 0,
          this.lockedUntil ?? null,
          this.avatar ?? null,
          this.id,
        ]
      );

      Object.assign(this, rowToDoc(rows[0]));
      this._password = rows[0].password;
      return this;
    }

    const { rows } = await pool.query(
      `UPDATE users SET
        business_id = $1, name = $2, email = $3, role = $4, status = $5, status_reason = $6,
        approved_by = $7, approved_at = $8, must_change_password = $9,
        sessions_valid_from = $10, last_login_at = $11, last_login_ip = $12,
        failed_login_attempts = $13, locked_until = $14, avatar = $15, updated_at = NOW()
      WHERE id = $16
      RETURNING ${USER_COLUMNS}`,
      [
        this.businessId ?? null,
        this.name,
        this.email,
        this.role,
        this.status,
        this.statusReason ?? null,
        this.approvedBy ?? null,
        this.approvedAt ?? null,
        this.mustChangePassword ?? false,
        this.sessionsValidFrom ?? new Date(),
        this.lastLoginAt ?? null,
        this.lastLoginIp ?? null,
        this.failedLoginAttempts ?? 0,
        this.lockedUntil ?? null,
        this.avatar ?? null,
        this.id,
      ]
    );

    Object.assign(this, rowToDoc(rows[0]));
    return this;
  }

  static async findById(id, { select } = {}) {
    if (!id) return null;
    const pool = getPool();
    const columns = select === '+password' ? USER_COLUMNS_WITH_PASSWORD : USER_COLUMNS;
    const { rows } = await pool.query(`SELECT ${columns} FROM users WHERE id = $1`, [id]);
    return rows[0] ? new User(rows[0]) : null;
  }

  static async findOne(filter = {}, { select } = {}) {
    const pool = getPool();
    const params = [];
    const clauses = [];

    if (filter.businessId) {
      params.push(filter.businessId);
      clauses.push(`business_id = $${params.length}`);
    }

    if (filter.email) {
      params.push(filter.email);
      clauses.push(`email = $${params.length}`);
    }

    if (filter._id && filter._id.$ne) {
      params.push(filter._id.$ne);
      clauses.push(`id <> $${params.length}`);
    }

    if (filter.status) {
      params.push(filter.status);
      clauses.push(`status = $${params.length}`);
    }

    if (filter.role) {
      params.push(filter.role);
      clauses.push(`role = $${params.length}`);
    }

    const columns = select === '+password' ? USER_COLUMNS_WITH_PASSWORD : USER_COLUMNS;
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const { rows } = await pool.query(
      `SELECT ${columns} FROM users ${where} LIMIT 1`,
      params
    );
    return rows[0] ? new User(rows[0]) : null;
  }

  static async find(filter = {}, { sort, limit, populate, select } = {}) {
    const pool = getPool();
    const params = [];
    const clauses = [];

    if (filter.businessId) {
      params.push(filter.businessId);
      clauses.push(`u.business_id = $${params.length}`);
    }

    if (filter.status && filter.status !== 'all') {
      params.push(filter.status);
      clauses.push(`u.status = $${params.length}`);
    }

    if (filter.role) {
      params.push(filter.role);
      clauses.push(`u.role = $${params.length}`);
    }

    if (filter._id && filter._id.$ne) {
      params.push(filter._id.$ne);
      clauses.push(`u.id <> $${params.length}`);
    }

    if (filter.$or) {
      const search = filter.$or[0]?.name?.source || filter.$or[0]?.email?.source;
      if (search) {
        params.push(`%${search}%`);
        clauses.push(`(u.name ILIKE $${params.length} OR u.email ILIKE $${params.length})`);
      }
    }

    let orderBy = 'u.created_at DESC';
    if (sort?.status === 1) orderBy = 'u.status ASC, u.created_at DESC';
    if (sort?.name === 1) orderBy = 'u.name ASC';

    if (limit) {
      params.push(limit);
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const limitSql = limit ? `LIMIT $${params.length}` : '';
    const columns =
      select === 'name' ? 'u.id, u.name' : `u.${USER_COLUMNS.trim().replace(/\s+/g, ', u.').replace(/^u\./, 'u.')}`;

    const join = populate?.approvedBy
      ? 'LEFT JOIN users approver ON u.approved_by = approver.id'
      : '';
    const approverSelect = populate?.approvedBy ? ', approver.name AS approver_name' : '';

    const { rows } = await pool.query(
      `SELECT ${select === 'name' ? 'u.id, u.name' : 'u.*'}${approverSelect}
       FROM users u
       ${join}
       ${where}
       ORDER BY ${orderBy}
       ${limitSql}`,
      params
    );

    return rows.map((row) => {
      const user = new User(row);
      if (populate?.approvedBy) {
        user.approvedBy = row.approver_name ? { name: row.approver_name } : null;
      }
      return user;
    });
  }

  static async countDocuments(filter = {}) {
    const pool = getPool();
    const params = [];
    const clauses = [];

    if (filter.businessId) {
      params.push(filter.businessId);
      clauses.push(`business_id = $${params.length}`);
    }

    if (filter.status) {
      params.push(filter.status);
      clauses.push(`status = $${params.length}`);
    }

    if (filter.role) {
      params.push(filter.role);
      clauses.push(`role = $${params.length}`);
    }

    if (filter._id && filter._id.$ne) {
      params.push(filter._id.$ne);
      clauses.push(`id <> $${params.length}`);
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const { rows } = await pool.query(`SELECT COUNT(*)::int AS count FROM users ${where}`, params);
    return rows[0].count;
  }

  static async create(data) {
    const pool = getPool();
    const password = await bcrypt.hash(data.password, 10);

    try {
      const { rows } = await pool.query(
        `INSERT INTO users (
          business_id, name, email, password, role, status, must_change_password, sessions_valid_from
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
        RETURNING ${USER_COLUMNS_WITH_PASSWORD}`,
        [
          data.businessId ?? null,
          data.name,
          data.email,
          password,
          data.role || 'worker',
          data.status || 'pending',
          data.mustChangePassword ?? false,
        ]
      );
      return new User(rows[0]);
    } catch (error) {
      throw pgError(error);
    }
  }

  static async updateMany(filter, update) {
    const pool = getPool();
    const params = [];
    const setClauses = [];
    const whereClauses = [];

    if (update.$set?.role) {
      params.push(update.$set.role);
      setClauses.push(`role = $${params.length}`);
    }
    if (update.$set?.status) {
      params.push(update.$set.status);
      setClauses.push(`status = $${params.length}`);
    }
    if (update.$set?.mustChangePassword !== undefined) {
      params.push(update.$set.mustChangePassword);
      setClauses.push(`must_change_password = $${params.length}`);
    }

    if (filter.role) {
      params.push(filter.role);
      whereClauses.push(`role = $${params.length}`);
    }

    if (filter.status?.$exists === false) {
      whereClauses.push('status IS NULL');
    }

    if (filter.mustChangePassword) {
      params.push(filter.mustChangePassword);
      whereClauses.push(`must_change_password = $${params.length}`);
    }

    if (filter.email?.$regex) {
      params.push(filter.email.$regex.source);
      whereClauses.push(`email ~* $${params.length}`);
    }

    const where = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';
    const set = setClauses.length ? `SET ${setClauses.join(', ')}, updated_at = NOW()` : '';

    if (set) {
      const result = await pool.query(`UPDATE users ${set} ${where}`, params);
      return { modifiedCount: result.rowCount };
    }

    if (filter.email?.$regex) {
      const result = await pool.query(`DELETE FROM users ${where}`, params);
      return { deletedCount: result.rowCount };
    }

    return { modifiedCount: 0 };
  }

  static async deleteMany(filter) {
    const pool = getPool();
    const params = [];
    const whereClauses = [];

    if (filter.email?.$regex) {
      params.push(filter.email.$regex.source);
      whereClauses.push(`email ~* $${params.length}`);
    }

    const where = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';
    const result = await pool.query(`DELETE FROM users ${where}`, params);
    return { deletedCount: result.rowCount };
  }

  static async aggregate(pipeline) {
    const pool = getPool();
    if (pipeline[0]?.$group?._id === '$status') {
      const { rows } = await pool.query(
        'SELECT status AS _id, COUNT(*)::int AS count FROM users GROUP BY status'
      );
      return rows;
    }
    return [];
  }

  set password(value) {
    this._password = value;
    this._passwordModified = true;
  }

  get password() {
    return this._password;
  }
}

User.ROLES = ROLES;
User.STATUSES = STATUSES;

module.exports = User;
module.exports.ROLES = ROLES;
module.exports.STATUSES = STATUSES;
