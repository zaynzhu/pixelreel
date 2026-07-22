import axios from 'axios';
import crypto from 'crypto';
import { config } from '../../config';
import type { ImportSummary } from '../../dto/import-summary';
import { buildPlatformGameRequestOptions } from '../import/PlatformGameSyncService';
import {
  importXboxTitleHistory,
  parseXboxTitles,
  type XboxImportedTitle,
} from '../import/OpenXblImportService';
import {
  microsoftXboxAuthStore,
  type MicrosoftXboxAuthProfile,
  type MicrosoftXboxAuthStore,
} from './MicrosoftXboxAuthStore';

const MICROSOFT_AUTHORIZE_URL = 'https://login.live.com/oauth20_authorize.srf';
const MICROSOFT_TOKEN_URL = 'https://login.live.com/oauth20_token.srf';
const XBOX_USER_AUTH_URL = 'https://user.auth.xboxlive.com/user/authenticate';
const XBOX_XSTS_URL = 'https://xsts.auth.xboxlive.com/xsts/authorize';
const XBOX_TITLE_HISTORY_URL = 'https://titlehub.xboxlive.com';
const MICROSOFT_XBOX_SCOPE = 'Xboxlive.signin Xboxlive.offline_access';
export const OPENXBOX_COMMUNITY_CLIENT_ID = '388ea51c-0b25-4029-aae2-17df49d23905';
export const OPENXBOX_COMMUNITY_REDIRECT_URI = 'http://localhost:8080/auth/callback';

interface OAuthTokenResponse {
  access_token?: unknown;
  refresh_token?: unknown;
}

interface XboxTokenResponse {
  Token?: unknown;
  DisplayClaims?: {
    xui?: Array<Record<string, unknown>>;
  };
}

export type MicrosoftXboxIdentity = {
  xuid: string;
  gamertag: string | null;
  userHash: string;
  token: string;
};

export class XboxOAuthStateStore {
  private readonly states = new Map<string, { expiresAt: number; profile: MicrosoftXboxAuthProfile }>();

  constructor(private readonly ttlMs = 10 * 60 * 1000) {}

  create(profile: MicrosoftXboxAuthProfile = 'community', now = Date.now()): string {
    this.removeExpired(now);
    const state = crypto.randomBytes(32).toString('hex');
    this.states.set(state, { expiresAt: now + this.ttlMs, profile });
    return state;
  }

  consume(state: string, now = Date.now()): MicrosoftXboxAuthProfile | null {
    const stored = this.states.get(state);
    this.states.delete(state);
    return stored != null && stored.expiresAt >= now ? stored.profile : null;
  }

  private removeExpired(now: number): void {
    for (const [state, stored] of this.states.entries()) {
      if (stored.expiresAt < now) this.states.delete(state);
    }
  }
}

export const xboxOAuthStateStore = new XboxOAuthStateStore();

export function buildMicrosoftXboxAuthorizationUrl(
  state: string,
  profile: MicrosoftXboxAuthProfile = 'community',
): string {
  const oauthClient = getMicrosoftXboxOAuthClient(profile);
  const parameters = new URLSearchParams({
    client_id: oauthClient.clientId,
    response_type: 'code',
    approval_prompt: 'auto',
    scope: MICROSOFT_XBOX_SCOPE,
    redirect_uri: oauthClient.redirectUri,
    state,
  });
  return `${MICROSOFT_AUTHORIZE_URL}?${parameters}`;
}

export async function authorizeMicrosoftXbox(
  authorizationCode: string,
  profile: MicrosoftXboxAuthProfile = 'community',
  store: MicrosoftXboxAuthStore = microsoftXboxAuthStore,
): Promise<void> {
  const oauthClient = getMicrosoftXboxOAuthClient(profile);
  const parameters = new URLSearchParams({
    client_id: oauthClient.clientId,
    grant_type: 'authorization_code',
    code: authorizationCode,
    scope: MICROSOFT_XBOX_SCOPE,
    redirect_uri: oauthClient.redirectUri,
  });
  if (oauthClient.clientSecret) parameters.set('client_secret', oauthClient.clientSecret);
  const response = await axios.post<OAuthTokenResponse>(
    MICROSOFT_TOKEN_URL,
    parameters,
    buildPlatformGameRequestOptions(),
  );
  const refreshToken = readRequiredString(response.data.refresh_token, 'Microsoft 未返回刷新令牌');
  store.writeRefreshToken(refreshToken, profile);
}

export async function verifyMicrosoftXboxConnection(signal?: AbortSignal): Promise<{
  ok: true;
  gamertag: string | null;
}> {
  const identity = await authenticateMicrosoftXbox(signal);
  await fetchMicrosoftXboxTitleHistory(identity, signal);
  return { ok: true, gamertag: identity.gamertag };
}

export async function importMicrosoftXboxGames(
  _accountId: string,
  status?: string | null,
  onProgress?: (processed: number, total: number, currentTitle: string) => void,
  signal?: AbortSignal,
): Promise<ImportSummary> {
  const summary: ImportSummary = { total: 0, imported: 0, updated: 0, skipped: 0, errors: [] };
  try {
    onProgress?.(0, 0, '验证 Microsoft Xbox 账号');
    const identity = await authenticateMicrosoftXbox(signal);
    onProgress?.(0, 0, '读取 Xbox 游戏库');
    const titles = await fetchMicrosoftXboxTitleHistory(identity, signal);
    return await importXboxTitleHistory(titles, status, onProgress, signal);
  } catch (error) {
    if (!signal?.aborted) {
      summary.errors.push(error instanceof Error ? error.message : 'Microsoft Xbox 同步失败');
    }
    return summary;
  }
}

export async function authenticateMicrosoftXbox(
  signal?: AbortSignal,
  store: MicrosoftXboxAuthStore = microsoftXboxAuthStore,
): Promise<MicrosoftXboxIdentity> {
  const refreshToken = store.readRefreshToken();
  if (!refreshToken) throw new Error('Microsoft Xbox 账号尚未授权');
  const profile = store.readProfile() ?? 'custom';
  const oauthClient = getMicrosoftXboxOAuthClient(profile);

  try {
    const parameters = new URLSearchParams({
      client_id: oauthClient.clientId,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      scope: MICROSOFT_XBOX_SCOPE,
      redirect_uri: oauthClient.redirectUri,
    });
    if (oauthClient.clientSecret) parameters.set('client_secret', oauthClient.clientSecret);
    const oauthResponse = await axios.post<OAuthTokenResponse>(
      MICROSOFT_TOKEN_URL,
      parameters,
      buildPlatformGameRequestOptions(signal),
    );
    const accessToken = readRequiredString(oauthResponse.data.access_token, 'Microsoft Access Token 响应无效');
    if (typeof oauthResponse.data.refresh_token === 'string' && oauthResponse.data.refresh_token.trim()) {
      store.writeRefreshToken(oauthResponse.data.refresh_token, profile);
    }

    const userResponse = await axios.post<XboxTokenResponse>(XBOX_USER_AUTH_URL, {
      RelyingParty: 'http://auth.xboxlive.com',
      TokenType: 'JWT',
      Properties: {
        AuthMethod: 'RPS',
        SiteName: 'user.auth.xboxlive.com',
        RpsTicket: `d=${accessToken}`,
      },
    }, {
      headers: { 'x-xbl-contract-version': '1' },
      ...buildPlatformGameRequestOptions(signal),
    });
    const userToken = readRequiredString(userResponse.data.Token, 'Xbox User Token 响应无效');

    const xstsResponse = await axios.post<XboxTokenResponse>(XBOX_XSTS_URL, {
      RelyingParty: 'http://xboxlive.com',
      TokenType: 'JWT',
      Properties: { UserTokens: [userToken], SandboxId: 'RETAIL' },
    }, {
      headers: { 'x-xbl-contract-version': '1' },
      ...buildPlatformGameRequestOptions(signal),
    });
    return parseMicrosoftXboxIdentity(xstsResponse.data);
  } catch (error) {
    throw new Error(getMicrosoftXboxRequestError(error));
  }
}

export async function fetchMicrosoftXboxTitleHistory(
  identity: MicrosoftXboxIdentity,
  signal?: AbortSignal,
): Promise<XboxImportedTitle[]> {
  try {
    const response = await axios.get(
      `${XBOX_TITLE_HISTORY_URL}/users/xuid(${encodeURIComponent(identity.xuid)})/titles/titlehistory/decoration/achievement,image,scid`,
      {
        params: { maxItems: 1000 },
        headers: {
          Authorization: `XBL3.0 x=${identity.userHash};${identity.token}`,
          'x-xbl-contract-version': '2',
          'x-xbl-client-name': 'XboxApp',
          'x-xbl-client-type': 'UWA',
          'x-xbl-client-version': '39.39.22001.0',
          'Accept-Language': 'zh-CN',
        },
        ...buildPlatformGameRequestOptions(signal),
      },
    );
    return parseXboxTitles(response.data);
  } catch (error) {
    throw new Error(getMicrosoftXboxRequestError(error));
  }
}

export function parseMicrosoftXboxIdentity(data: XboxTokenResponse): MicrosoftXboxIdentity {
  const claims = data.DisplayClaims?.xui?.[0];
  return {
    token: readRequiredString(data.Token, 'XSTS Token 响应无效'),
    userHash: readRequiredString(claims?.uhs, 'XSTS 用户哈希响应无效'),
    xuid: readRequiredString(claims?.xid, 'XSTS XUID 响应无效'),
    gamertag: typeof claims?.gtg === 'string' && claims.gtg.trim() ? claims.gtg : null,
  };
}

export function getMicrosoftXboxRequestError(error: unknown): string {
  if (!axios.isAxiosError(error)) {
    return error instanceof Error && error.message.trim() ? error.message : 'Microsoft Xbox 请求失败';
  }
  const status = error.response?.status;
  const data = error.response?.data as { XErr?: unknown; error_description?: unknown } | undefined;
  const xErr = typeof data?.XErr === 'number' ? data.XErr : Number(data?.XErr);
  if (xErr === 2148916233) return '该 Microsoft 账号尚未创建 Xbox 档案';
  if (xErr === 2148916236 || xErr === 2148916237 || xErr === 2148916238) {
    return '该 Xbox 账号受年龄或家庭设置限制，无法授权';
  }
  if (status === 400 && typeof data?.error_description === 'string') {
    return `Microsoft 授权已失效，请重新连接账号: ${data.error_description}`;
  }
  if (status === 401) return 'Microsoft Xbox 授权无效，请重新连接账号';
  if (status === 403) return 'Microsoft Xbox 账号无权读取游戏历史';
  if (status === 429) return 'Microsoft Xbox 请求过于频繁，请稍后重试';
  return `Microsoft Xbox 请求失败${status ? `（HTTP ${status}）` : ''}`;
}

function getMicrosoftXboxOAuthClient(profile: MicrosoftXboxAuthProfile) {
  if (profile === 'community') {
    return {
      clientId: OPENXBOX_COMMUNITY_CLIENT_ID,
      clientSecret: '',
      redirectUri: OPENXBOX_COMMUNITY_REDIRECT_URI,
    };
  }
  if (!config.microsoftXbox.enabled) throw new Error('Microsoft Xbox 自有应用同步未启用');
  if (!config.microsoftXbox.clientId.trim()) throw new Error('缺少 Microsoft Xbox Client ID');
  if (!config.microsoftXbox.clientSecret.trim()) throw new Error('缺少 Microsoft Xbox Client Secret');
  return {
    clientId: config.microsoftXbox.clientId,
    clientSecret: config.microsoftXbox.clientSecret,
    redirectUri: config.microsoftXbox.redirectUri,
  };
}

function readRequiredString(value: unknown, errorMessage: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(errorMessage);
  return value;
}
