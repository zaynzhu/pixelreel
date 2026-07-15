import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { createHash, timingSafeEqual } from 'node:crypto';
import { config } from '../config';
import { assertNoQueryParameters, RequestValidationError } from './request-validation';

const router = Router();
const LOGIN_MAX_FAILURES = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

interface LoginAttempt {
  failures: number;
  resetAt: number;
}

export class LoginAttemptLimiter {
  private readonly attempts = new Map<string, LoginAttempt>();

  constructor(
    private readonly maxFailures = LOGIN_MAX_FAILURES,
    private readonly windowMs = LOGIN_WINDOW_MS,
    private readonly now = () => Date.now(),
  ) {}

  check(key: string): { allowed: boolean; retryAfterSeconds: number } {
    const current = this.attempts.get(key);
    if (!current) return { allowed: true, retryAfterSeconds: 0 };

    const now = this.now();
    if (now >= current.resetAt) {
      this.attempts.delete(key);
      return { allowed: true, retryAfterSeconds: 0 };
    }
    if (current.failures < this.maxFailures) return { allowed: true, retryAfterSeconds: 0 };
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
    };
  }

  recordFailure(key: string) {
    const now = this.now();
    const current = this.attempts.get(key);
    if (!current || now >= current.resetAt) {
      this.attempts.set(key, { failures: 1, resetAt: now + this.windowMs });
      return;
    }
    current.failures += 1;
  }

  reset(key: string) {
    this.attempts.delete(key);
  }
}

const loginAttemptLimiter = new LoginAttemptLimiter();

export function parseLoginBody(value: unknown): { username: string; password: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new RequestValidationError('请求体必须是对象');
  }
  const body = value as Record<string, unknown>;
  const unknownKey = Object.keys(body).find(key => key !== 'username' && key !== 'password');
  if (unknownKey) throw new RequestValidationError(`未知字段: ${unknownKey}`);
  if (typeof body.username !== 'string' || !body.username.trim() || body.username.length > 100) {
    throw new RequestValidationError('username 必须是 1 到 100 个字符的字符串');
  }
  if (typeof body.password !== 'string' || !body.password.trim() || body.password.length > 1000) {
    throw new RequestValidationError('password 必须是 1 到 1000 个字符的字符串');
  }
  return { username: body.username, password: body.password };
}

export function secureCredentialEqual(value: string, expected: string): boolean {
  const valueHash = createHash('sha256').update(value).digest();
  const expectedHash = createHash('sha256').update(expected).digest();
  return timingSafeEqual(valueHash, expectedHash);
}

export function getAuthStatus() {
  return { enabled: config.authEnabled };
}

// 前端启动时据此决定是否展示登录页
router.get('/status', (_req: Request, res: Response) => {
  res.json(getAuthStatus());
});

// 登录接口：简单的单用户验证
router.post('/login', (req: Request, res: Response) => {
  assertNoQueryParameters(req.query);
  if (!config.authEnabled) {
    res.status(409).json({ error: '认证未启用' });
    return;
  }

  const attemptKey = req.ip || req.socket.remoteAddress || 'unknown';
  const attemptStatus = loginAttemptLimiter.check(attemptKey);
  if (!attemptStatus.allowed) {
    res.set('Retry-After', String(attemptStatus.retryAfterSeconds));
    res.status(429).json({ error: '登录尝试过于频繁，请稍后再试' });
    return;
  }

  const { username, password } = parseLoginBody(req.body);
  const usernameMatches = secureCredentialEqual(username, config.jwt.username);
  const passwordMatches = secureCredentialEqual(password, config.jwt.password);
  if (!usernameMatches || !passwordMatches) {
    loginAttemptLimiter.recordFailure(attemptKey);
    res.status(401).json({ error: '用户名或密码错误' });
    return;
  }
  loginAttemptLimiter.reset(attemptKey);
  const token = jwt.sign({ username }, config.jwt.secret, { expiresIn: '7d' });
  res.json({ token });
});

export default router;
