const { getPool } = require('../config/db');
const { rowToDoc } = require('../db/helpers');

const DEFAULT_FEATURES = {
  inventoryTracking: true,
  cashWithdrawals: true,
  multipleLocations: false,
  advancedReporting: true,
  emailNotifications: false,
};

const DEFAULT_RECEIPT = {
  includeTerms: false,
  footerText: 'Thank you for your business!',
  showLogo: true,
  receiptPrefix: 'INV',
};

const DEFAULT_SETUP = {
  businessInfo: false,
  branding: false,
  firstProduct: false,
  firstTransaction: false,
};

const mapSettingsRow = (row) => {
  const doc = rowToDoc(row);
  doc.businessId = row.business_id;
  doc.address = row.address || { country: 'Pakistan' };
  doc.currency = row.currency || { code: 'PKR', symbol: 'Rs.' };
  doc.features = row.features || DEFAULT_FEATURES;
  doc.receiptSettings = row.receipt_settings || DEFAULT_RECEIPT;
  doc.setupSteps = row.setup_steps || DEFAULT_SETUP;
  doc.primaryColor = row.primary_color;
  doc.accentColor = row.accent_color;
  doc.businessName = row.business_name;
  doc.businessType = row.business_type;
  doc.defaultUnit = row.default_unit;
  doc.fiscalYearStart = row.fiscal_year_start;
  doc.dateFormat = row.date_format;
  doc.onboardingCompleted = row.onboarding_completed;
  return doc;
};

class BusinessSettings {
  constructor(row) {
    Object.assign(this, mapSettingsRow(row));
  }

  toObject() {
    return { ...this, _id: this.id };
  }

  async save() {
    const pool = getPool();
    const { rows } = await pool.query(
      `UPDATE business_settings SET
        business_name = $1, business_type = $2, tagline = $3, email = $4, phone = $5,
        website = $6, address = $7, logo = $8, primary_color = $9, accent_color = $10,
        currency = $11, default_unit = $12, fiscal_year_start = $13, timezone = $14,
        date_format = $15, features = $16, receipt_settings = $17,
        onboarding_completed = $18, setup_steps = $19, updated_at = NOW()
      WHERE id = $20
      RETURNING *`,
      [
        this.businessName,
        this.businessType,
        this.tagline ?? null,
        this.email ?? null,
        this.phone ?? null,
        this.website ?? null,
        JSON.stringify(this.address || {}),
        this.logo ?? null,
        this.primaryColor,
        this.accentColor,
        JSON.stringify(this.currency || {}),
        this.defaultUnit,
        this.fiscalYearStart,
        this.timezone,
        this.dateFormat,
        JSON.stringify(this.features || {}),
        JSON.stringify(this.receiptSettings || {}),
        this.onboardingCompleted ?? false,
        JSON.stringify(this.setupSteps || {}),
        this.id,
      ]
    );
    Object.assign(this, mapSettingsRow(rows[0]));
    return this;
  }

  static async findOne(filter) {
    const pool = getPool();
    const { rows } = await pool.query('SELECT * FROM business_settings WHERE business_id = $1', [
      filter.businessId,
    ]);
    return rows[0] ? new BusinessSettings(rows[0]) : null;
  }

  static async createDefaultSettings(businessId, businessName) {
    const pool = getPool();
    const { rows } = await pool.query(
      `INSERT INTO business_settings (business_id, business_name)
       VALUES ($1, $2)
       RETURNING *`,
      [businessId, businessName || 'My Business']
    );
    return new BusinessSettings(rows[0]);
  }

  static async deleteMany() {
    const pool = getPool();
    const result = await pool.query('DELETE FROM business_settings');
    return { deletedCount: result.rowCount };
  }
}

BusinessSettings.createDefaultSettings = BusinessSettings.createDefaultSettings;

module.exports = BusinessSettings;
