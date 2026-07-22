import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';

const AUTH_EXEMPT_PATHS = new Set(['/trakt/callback', '/xbox/callback']);

// JWT 鉴权中间件
export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const isExemptRequest = req.method === 'GET' && AUTH_EXEMPT_PATHS.has(req.path);
  if (!config.authEnabled || isExemptRequest) {
    next();
    return;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: '未提供认证令牌' });
    return;
  }

  const token = authHeader.substring(7);
  try {
    const decoded = jwt.verify(token, config.jwt.secret) as { username: string };
    (req as any).user = decoded;
    next();
  } catch {
    res.status(401).json({ error: '令牌无效或已过期' });
  }
}
