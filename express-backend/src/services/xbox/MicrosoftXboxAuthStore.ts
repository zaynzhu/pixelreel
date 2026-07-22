import fs from 'fs';
import path from 'path';

interface StoredMicrosoftXboxAuth {
  version: 1;
  refreshToken: string;
}

export class MicrosoftXboxAuthStore {
  constructor(
    private readonly filePath = path.resolve(__dirname, '../../../data/xbox-microsoft-auth.json'),
  ) {}

  hasRefreshToken(): boolean {
    return this.readRefreshToken() != null;
  }

  readRefreshToken(): string | null {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf-8')) as Partial<StoredMicrosoftXboxAuth>;
      return parsed.version === 1 && typeof parsed.refreshToken === 'string' && parsed.refreshToken.trim()
        ? parsed.refreshToken
        : null;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      return null;
    }
  }

  writeRefreshToken(refreshToken: string): void {
    if (!refreshToken.trim()) throw new Error('Microsoft 未返回可用的刷新令牌');
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.tmp`;
    fs.writeFileSync(temporaryPath, JSON.stringify({
      version: 1,
      refreshToken,
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
