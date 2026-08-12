/**
 * Wipes business data so a deployment starts clean. User accounts are kept.
 *
 *   npm run reset
 *
 * To remove everything including Postgres volumes:
 *   docker compose down -v
 */
require('../config/env');
const { connectDB, closeDB } = require('../config/db');
const Product = require('../models/Product');
const Transaction = require('../models/Transaction');
const CashEntry = require('../models/CashEntry');
const BusinessSettings = require('../models/BusinessSettings');
const AuditLog = require('../models/AuditLog');
const User = require('../models/User');

const migrateUsers = async () => {
  const [staffToWorker, statusPending, clearedPasswordLock, removedTestUsers] = await Promise.all([
    User.updateMany({ role: 'staff' }, { $set: { role: 'worker' } }),
    User.updateMany({ status: { $exists: false } }, { $set: { status: 'pending' } }),
    User.updateMany({ mustChangePassword: true }, { $set: { mustChangePassword: false } }),
    User.deleteMany({ email: { $regex: /@(test\.com|t\.com)$/i } }),
  ]);

  return {
    staffToWorker: staffToWorker.modifiedCount,
    statusPending: statusPending.modifiedCount,
    clearedPasswordLock: clearedPasswordLock.modifiedCount,
    removedTestUsers: removedTestUsers.deletedCount,
  };
};

const run = async () => {
  await connectDB({ retries: 3 });

  const [products, transactions, cashEntries, settings, audit, userMigration] = await Promise.all([
    Product.deleteMany({}),
    Transaction.deleteMany({}),
    CashEntry.deleteMany({}),
    BusinessSettings.deleteMany({}),
    AuditLog.deleteMany({}),
    migrateUsers(),
  ]);

  console.log('✅ Database reset complete');
  console.log(`   Products removed:     ${products.deletedCount}`);
  console.log(`   Transactions removed: ${transactions.deletedCount}`);
  console.log(`   Cash entries removed: ${cashEntries.deletedCount}`);
  console.log(`   Settings removed:     ${settings.deletedCount}`);
  console.log(`   Audit logs removed:   ${audit.deletedCount}`);
  console.log(`   staff → worker:       ${userMigration.staffToWorker}`);
  console.log(`   status fixed:         ${userMigration.statusPending}`);
  console.log(`   password lock cleared:${userMigration.clearedPasswordLock}`);
  console.log(`   test accounts removed:${userMigration.removedTestUsers}`);

  await closeDB();
  process.exit(0);
};

run().catch((error) => {
  console.error('❌ Reset failed:', error.message);
  process.exit(1);
});
