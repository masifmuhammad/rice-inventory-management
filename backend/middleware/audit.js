const AuditLog = require('../models/AuditLog');

/**
 * Audit middleware to log all important actions
 */
const createAuditLog = async (req, action, resourceType, resourceId, details = {}, previousState = null, newState = null) => {
  try {
    const auditLog = new AuditLog({
      userId: req.user._id,
      userName: req.user.name,
      action,
      resourceType,
      resourceId,
      details,
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.get('user-agent'),
      previousState,
      newState
    });

    await auditLog.save();
    console.log(`✅ Audit log created: ${action} by ${req.user.name}`);
  } catch (error) {
    // Don't fail the request if audit logging fails
    console.error('❌ Error creating audit log:', error);
  }
};

module.exports = { createAuditLog };
