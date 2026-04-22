function authRequired(req, res, next) {
  if (req.session && req.session.user) return next();
  return res.status(401).json({ message: 'Not authenticated' });
}

function roleRequired(roles) {
  const allowed = Array.isArray(roles) ? roles : [roles];
  return (req, res, next) => {
    if (!req.session || !req.session.user) {
      return res.status(401).json({ message: 'Not authenticated' });
    }
    if (!allowed.includes(req.session.user.role)) {
      return res.status(403).json({ message: 'Forbidden: insufficient role' });
    }
    return next();
  };
}

module.exports = { authRequired, roleRequired };
