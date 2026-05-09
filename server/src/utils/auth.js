import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'nodepanel-secret';

export function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, name: user.name, role: user.role || 'full_admin' },
    JWT_SECRET,
    { expiresIn: '12h' },
  );
}

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) return res.status(401).json({ error: 'unauthorized' });

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (error) {
    return res.status(401).json({ error: 'invalid_token' });
  }
}

export function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}
