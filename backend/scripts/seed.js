/**
 * Creates the first admin account and default businesses for a fresh deployment.
 *
 *   npm run seed
 */
require('../config/env');
const { connectDB, closeDB } = require('../config/db');
const { runMigrations } = require('../db/migrate');
const User = require('../models/User');
const Business = require('../models/Business');
const BusinessSettings = require('../models/BusinessSettings');

const run = async () => {
  const name = process.env.SEED_ADMIN_NAME || 'Admin';
  const email = (process.env.SEED_ADMIN_EMAIL || '').toLowerCase().trim();
  const password = process.env.SEED_ADMIN_PASSWORD || '';
  const primaryBusiness = process.env.SEED_BUSINESS_NAME || 'Haji Rice Mills';
  const secondaryBusiness = process.env.SEED_SECOND_BUSINESS || '999';

  if (!email || !password) {
    console.error('❌ Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD before seeding.');
    process.exit(1);
  }

  if (password.length < 6) {
    console.error('❌ SEED_ADMIN_PASSWORD must be at least 6 characters.');
    process.exit(1);
  }

  await connectDB({ retries: 3 });
  await runMigrations();

  const ensureBusiness = async (businessName) => {
    const slug = businessName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    let business = await Business.findOne({ slug });
    if (!business) {
      business = await Business.create({ name: businessName, slug });
      await BusinessSettings.createDefaultSettings(business.id, business.name);
      console.log(`✅ Created business "${businessName}"`);
    }
    return business;
  };

  const haji = await ensureBusiness(primaryBusiness);
  const second = secondaryBusiness ? await ensureBusiness(secondaryBusiness) : null;

  const existing = await User.findOne({ email });
  if (existing) {
    let updated = false;
    existing.password = password;
    existing.failedLoginAttempts = 0;
    existing.lockedUntil = undefined;
    updated = true;
    if (existing.role !== 'admin') {
      existing.role = 'admin';
      updated = true;
    }
    if (existing.status !== 'active') {
      existing.status = 'active';
      updated = true;
    }
    if (!existing.businessId) {
      existing.businessId = haji.id;
      updated = true;
    }
    if (existing.mustChangePassword) {
      existing.mustChangePassword = false;
      updated = true;
    }
    if (updated) {
      await existing.save();
      console.log(`✅ Updated ${email} (password reset, active admin).`);
    } else {
      console.log(`ℹ️  ${email} already exists as an active admin.`);
    }
    await Business.addAdminMembership(existing.id, haji.id);
    if (second) await Business.addAdminMembership(existing.id, second.id);
  } else {
    const admin = await User.create({
      name,
      email,
      password,
      businessId: haji.id,
      role: 'admin',
      status: 'active',
      mustChangePassword: process.env.SEED_FORCE_PASSWORD_CHANGE === 'true',
    });
    await Business.addAdminMembership(admin.id, haji.id);
    if (second) await Business.addAdminMembership(admin.id, second.id);
    console.log(`✅ Created admin account for ${email}`);
  }

  await closeDB();
  process.exit(0);
};

run().catch((error) => {
  console.error('❌ Seed failed:', error.message);
  process.exit(1);
});
