import { Router, type NextFunction, type Request, type Response } from 'express';
import { config } from '../config';
import { assertNoQueryParameters, parseBoundedStringParameter, RequestValidationError } from './request-validation';
import {
  authorizeMicrosoftXbox,
  buildMicrosoftXboxAuthorizationUrl,
  xboxOAuthStateStore,
} from '../services/xbox/MicrosoftXboxService';
import { microsoftXboxAuthStore } from '../services/xbox/MicrosoftXboxAuthStore';

const router = Router();

router.post('/auth-url', (req: Request, res: Response) => {
  assertNoQueryParameters(req.query);
  if (req.body !== undefined && (!req.body || typeof req.body !== 'object'
    || Array.isArray(req.body) || Object.keys(req.body).length > 0)) {
    throw new RequestValidationError('请求体必须为空');
  }
  res.json({ url: buildMicrosoftXboxAuthorizationUrl(xboxOAuthStateStore.create()) });
});

router.get('/callback', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const unknownKey = Object.keys(req.query).find(key => !['code', 'state', 'error', 'error_description'].includes(key));
    if (unknownKey) throw new RequestValidationError(`未知参数: ${unknownKey}`);
    const oauthError = parseBoundedStringParameter(req.query.error_description ?? req.query.error, 'error', 500);
    if (oauthError) throw new RequestValidationError(`Microsoft 授权失败: ${oauthError}`);
    const code = parseBoundedStringParameter(req.query.code, 'code', 4096, true)!;
    const state = parseBoundedStringParameter(req.query.state, 'state', 128, true)!;
    if (!xboxOAuthStateStore.consume(state)) {
      res.status(400).send('Microsoft Xbox 授权状态已失效，请返回 PixelReel 重新发起连接。');
      return;
    }
    await authorizeMicrosoftXbox(code);
    res.redirect(buildXboxAuthorizationSuccessUrl(config.cors.allowedOrigins));
  } catch (error) {
    next(error);
  }
});

router.post('/disconnect', (req: Request, res: Response) => {
  assertNoQueryParameters(req.query);
  if (req.body !== undefined && (!req.body || typeof req.body !== 'object'
    || Array.isArray(req.body) || Object.keys(req.body).length > 0)) {
    throw new RequestValidationError('请求体必须为空');
  }
  microsoftXboxAuthStore.clear();
  res.json({ success: true });
});

export default router;

export function buildXboxAuthorizationSuccessUrl(allowedOrigins: string[]): string {
  for (const origin of allowedOrigins) {
    try {
      const parsed = new URL(origin);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        return new URL('/sync?xboxAuth=success', parsed.origin).toString();
      }
    } catch {
      continue;
    }
  }
  return 'http://localhost:18888/sync?xboxAuth=success';
}
