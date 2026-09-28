const AuditLog = require("../models/AuditLog");

const auditLog = (action, targetType = "System") => {
  return async (req, res, next) => {
    const originalJson = res.json.bind(res);
    res.json = async (data) => {
      if (res.statusCode < 400 && req.user) {
        try {
          await AuditLog.create({
            actor: req.user._id,
            actorName: req.user.name,
            actorRole: req.user.role,
            action,
            targetType,
            targetId: data?._id || req.params?.id || null,
            targetName: data?.name || data?.email || null,
            details: { body: req.body, params: req.params },
            ipAddress: req.ip,
            userAgent: req.get("user-agent")
          });
        } catch (e) {
          console.error("Audit log error:", e.message);
        }
      }
      originalJson(data);
    };
    next();
  };
};

module.exports = { auditLog };
