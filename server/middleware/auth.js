const jwt = require('jsonwebtoken');

const ROLE_PRIORITY = {
  operator: 1,
  admin: 2
};

function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Please log in to continue.' });
  }

  const token = authHeader.slice(7);

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = {
      id: decoded.id,
      email: decoded.email,
      role: decoded.role
    };
    return next();
  } catch (error) {
    return res.status(401).json({ error: 'Session expired. Please log in again.' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    const currentPriority = ROLE_PRIORITY[req.user.role] || 0;
    const allowed = roles.some((role) => currentPriority >= (ROLE_PRIORITY[role] || 0));

    if (!allowed) {
      return res.status(403).json({ error: 'You do not have permission for this action.' });
    }

    return next();
  };
}

module.exports = {
  authenticate,
  requireRole
};
