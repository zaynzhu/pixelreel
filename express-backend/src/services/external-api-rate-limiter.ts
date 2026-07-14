import axios from 'axios';

export const MIN_EXTERNAL_API_INTERVAL_MS = 2000;

type Clock = () => number;
type Sleep = (ms: number) => Promise<void>;

export class RateLimiter {
  private readonly lastStartedAt = new Map<string, number>();
  private readonly queues = new Map<string, Promise<void>>();

  constructor(
    private readonly minIntervalMs = MIN_EXTERNAL_API_INTERVAL_MS,
    private readonly now: Clock = Date.now,
    private readonly sleep: Sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms)),
  ) {}

  async wait(key: string): Promise<void> {
    const previous = this.queues.get(key) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(async () => {
      const lastStartedAt = this.lastStartedAt.get(key);
      if (lastStartedAt != null) {
        const waitMs = Math.max(0, this.minIntervalMs - (this.now() - lastStartedAt));
        if (waitMs > 0) await this.sleep(waitMs);
      }
      this.lastStartedAt.set(key, this.now());
    });

    this.queues.set(key, current);
    try {
      await current;
    } finally {
      if (this.queues.get(key) === current) this.queues.delete(key);
    }
  }
}

interface RateLimitedRequest {
  url?: string;
  baseURL?: string;
  method?: string;
  responseType?: string;
}

export function getExternalServiceKey(request: RateLimitedRequest): string | null {
  if (!request.url) return null;

  try {
    const url = request.baseURL ? new URL(request.url, request.baseURL) : new URL(request.url);
    const hostname = url.hostname.toLowerCase();
    if (!hostname || hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
      return null;
    }

    const parts = hostname.split('.');
    return parts.length >= 2 ? parts.slice(-2).join('.') : hostname;
  } catch {
    return null;
  }
}

export function shouldRateLimitRequest(request: RateLimitedRequest): boolean {
  if (request.method?.toLowerCase() === 'head') return false;
  if (request.responseType === 'arraybuffer') return false;
  return getExternalServiceKey(request) != null;
}

const externalApiRateLimiter = new RateLimiter();
let interceptorRegistered = false;

export function registerExternalApiRateLimiter(): void {
  if (interceptorRegistered) return;
  interceptorRegistered = true;

  axios.interceptors.request.use(async request => {
    const serviceKey = getExternalServiceKey(request);
    if (serviceKey && shouldRateLimitRequest(request)) {
      await externalApiRateLimiter.wait(serviceKey);
    }
    return request;
  });
}
