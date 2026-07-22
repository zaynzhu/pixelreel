import fs from 'fs';
import path from 'path';

interface StoredMicrosoftXboxAuth {
  version: 1;
  refreshToken: string;
  profile?: MicrosoftXboxAuthProfile;
}

export type MicrosoftXboxAuthProfile = 'community' | 'custom';

export class MicrosoftXboxAuthStore {
  constructor(
    private readonly filePath = path.resolve(__dirname, '../../../data/xbox-microsoft-auth.json'),
  ) {}

  hasRefreshToken(): boolean {
    return this.readRefreshToken() != null;
  }

  readRefreshToken(): string | null {
    return this.read()?.refreshToken ?? null;
  }

  readProfile(): MicrosoftXboxAuthProfile | null {
    return this.read()?.profile ?? null;
  }

  private read(): { refreshToken: string; profile: MicrosoftXboxAuthProfile } | null {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf-8')) as Partial<StoredMicrosoftXboxAuth>;
      if (parsed.version !== 1 || typeof parsed.refreshToken !== 'string' || !parsed.refreshToken.trim()) {
        return null;
      }
      return {
        refreshToken: parsed.refreshToken,
        profile: parsed.profile === 'community' ? 'community' : 'custom',
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      return null;
    }
  }

  writeRefreshToken(refreshToken: string, profile: MicrosoftXboxAuthProfile = 'custom'): void {
    if (!refreshToken.trim()) throw new Error('Microsoft 未返回可用的刷新令牌');
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.tmp`;
    fs.writeFileSync(temporaryPath, JSON.stringify({
      version: 1,
      refreshToken,
      profile,
    } satisfies StoredMicrosoftXboxAuth), { encoding: 'utf-8', mode: 0o600 });
    fs.chmodSync(temporaryPath, 0o600);
    fs.renameSync(temporaryPath, this.filePath);
  }

  clear(): void {
    try {
      fs.unlinkSync(this.filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
}

export const microsoftXboxAuthStore = new MicrosoftXboxAuthStore();
