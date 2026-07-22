import { Router, type NextFunction, type Request, type Response } from 'express';
import http from 'node:http';
import { config } from '../config';
import { assertNoQueryParameters, parseBoundedStringParameter, RequestValidationError } from './request-validation';
import {
  authorizeMicrosoftXbox,
  buildMicrosoftXboxAuthorizationUrl,
  xboxOAuthStateStore,
} from '../services/xbox/MicrosoftXboxService';
import { microsoftXboxAuthStore } from '../services/xbox/MicrosoftXboxAuthStore';

const router = Router();
const COMMUNITY_CALLBACK_PORT = 8080;
let communityCallbackServer: http.Server | null = null;
let communityCallbackTimer: NodeJS.Timeout | null = null;

router.post('/auth-url', async (req: Request, res: Response) => {
  const mode = parseBoundedStringParameter(req.query.mode, 'mode', 20) ?? 'community';
  if (Object.keys(req.query).some(key => key !== 'mode')) {
    throw new RequestValidationError('未知参数');
  }
  if (mode !== 'community' && mode !== 'custom') {
    throw new RequestValidationError('mode 必须是 community 或 custom');
  }
  if (req.body !== undefined && (!req.body || typeof req.body !== 'object'
    || Array.isArray(req.body) || Object.keys(req.body).length > 0)) {
    throw new RequestValidationError('请求体必须为空');
  }
  if (mode === 'community') await startCommunityXboxCallbackServer();
  const state = xboxOAuthStateStore.create(mode);
  res.json({ url: buildMicrosoftXboxAuthorizationUrl(state, mode) });
});

router.get('/callback', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const unknownKey = Object.keys(req.query).find(key => !['code', 'state', 'error', 'error_description'].includes(key));
    if (unknownKey) throw new RequestValidationError(`未知参数: ${unknownKey}`);
    const oauthError = parseBoundedStringParameter(req.query.error_description ?? req.query.error, 'error', 500);
    if (oauthError) throw new RequestValidationError(`Microsoft 授权失败: ${oauthError}`);
    const code = parseBoundedStringParameter(req.query.code, 'code', 4096, true)!;
    const state = parseBoundedStringParameter(req.query.state, 'state', 128, true)!;
    const profile = xboxOAuthStateStore.consume(state);
    if (!profile) {
      res.status(400).send('Microsoft Xbox 授权状态已失效，请返回 PixelReel 重新发起连接。');
      return;
    }
    await authorizeMicrosoftXbox(code, profile);
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

export async function startCommunityXboxCallbackServer(): Promise<void> {
  if (communityCallbackServer?.listening) return;
  await new Promise<void>((resolve, reject) => {
    const server = http.createServer((request, response) => {
      if (!request.url?.startsWith('/auth/callback')) {
        response.writeHead(404).end('Not Found');
        return;
      }
      const callbackUrl = new URL(`/api/xbox/callback${new URL(request.url, 'http://localhost').search}`, `http://127.0.0.1:${config.port}`);
      response.once('finish', stopCommunityXboxCallbackServer);
      response.writeHead(302, { Location: callbackUrl.toString() }).end();
    });
    server.once('error', (error: NodeJS.ErrnoException) => {
      communityCallbackServer = null;
      reject(new Error(error.code === 'EADDRINUSE'
        ? '本机 8080 端口已被占用，无法接收 Microsoft 登录回调'
        : `无法启动 Microsoft 登录回调: ${error.message}`));
    });
    server.listen(COMMUNITY_CALLBACK_PORT, '127.0.0.1', () => {
      communityCallbackServer = server;
      communityCallbackTimer = setTimeout(stopCommunityXboxCallbackServer, 10 * 60 * 1000);
      communityCallbackTimer.unref();
      resolve();
    });
  });
}

function stopCommunityXboxCallbackServer(): void {
  if (communityCallbackTimer) clearTimeout(communityCallbackTimer);
  communityCallbackTimer = null;
  communityCallbackServer?.close();
  communityCallbackServer = null;
}
