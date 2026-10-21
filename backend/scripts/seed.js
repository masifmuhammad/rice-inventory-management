/**
 * Creates the first admin account and default businesses for a fresh deployment.
 *
 *   npm run seed
 */
require('../config/env');
const { connectDB, closeDB } = require('../config/db');
const User = require('../models/User');
const Business = require('../models/Business');
const BusinessSettings = require('../models/BusinessSettings');

const run = async () => {
  const name = process.env.SEED_ADMIN_NAME || 'Admin';
  const email = (process.env.SEED_ADMIN_EMAIL || '').toLowerCase().trim();
  const password = process.env.SEED_ADMIN_PASSWORD || '';
  const primaryBusiness = process.env.SEED_BUSINESS_NAME || 'Haji Rice Mills';
  const secondaryBusiness = process.env.SEED_SECOND_BUSINESS || '';

  if (!email || !password) {
    console.error('❌ Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD before seeding.');
    process.exit(1);
  }

  if (password.length < 6) {
    console.error('❌ SEED_ADMIN_PASSWORD must be at least 6 characters.');
    process.exit(1);
  }

  await connectDB({ retries: 3 });

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
    if (process.env.SEED_RESET_EXISTING !== 'true') {
      console.log('Account already exists. No credentials or permissions were changed.');
      await closeDB();
      return;
    }
    existing.password = password;
    existing.role = 'admin';
    existing.status = 'active';
    existing.failedLoginAttempts = 0;
    existing.lockedUntil = undefined;
    existing.businessId = existing.businessId || haji.id;
    existing.mustChangePassword = true;
    await existing.save();
    console.log('Existing admin reset; a password change is required at next login.');
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
      mustChangePassword: process.env.SEED_FORCE_PASSWORD_CHANGE !== 'false',
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
