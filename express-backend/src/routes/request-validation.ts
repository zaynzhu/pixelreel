import { RecordStatus } from '../enums/RecordStatus';
import type { LibraryRecordUpdateRequest } from '../dto/library';

export class RequestValidationError extends Error {
  readonly status = 400;

  constructor(message: string) {
    super(message);
    this.name = 'RequestValidationError';
  }
}

export function parsePositiveIntegerParameter(
  value: unknown,
  name: string,
  defaultValue: number,
  maxValue: number,
): number {
  if (value == null) return defaultValue;
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) {
    throw new RequestValidationError(`${name} 必须是正整数`);
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed > maxValue) {
    throw new RequestValidationError(`${name} 必须是 1 到 ${maxValue} 之间的整数`);
  }
  return parsed;
}

export function parseRequiredPositiveIntegerParameter(value: unknown, name: string): number {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) {
    throw new RequestValidationError(`${name} 必须是正整数`);
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new RequestValidationError(`${name} 超出安全整数范围`);
  }
  return parsed;
}

export function parsePositiveBigIntParameter(
  value: unknown,
  name: string,
  required = false,
): bigint | null {
  const parsed = parseStringParameter(value, name, required);
  if (!parsed) return null;
  if (!/^[1-9]\d*$/.test(parsed)) {
    throw new RequestValidationError(`${name} 必须是正整数`);
  }
  return BigInt(parsed);
}

export function parseDateParameter(value: unknown, name: string): Date | null {
  const parsed = parseStringParameter(value, name);
  if (!parsed) return null;
  const date = new Date(parsed);
  if (Number.isNaN(date.getTime())) {
    throw new RequestValidationError(`${name} 必须是有效日期`);
  }
  return date;
}

export function parseStringParameter(value: unknown, name: string, required = false): string | null {
  if (value == null) {
    if (required) throw new RequestValidationError(`缺少 ${name} 参数`);
    return null;
  }
  if (typeof value !== 'string') throw new RequestValidationError(`${name} 必须是字符串`);

  const parsed = value.trim();
  if (!parsed) {
    if (required) throw new RequestValidationError(`缺少 ${name} 参数`);
    return null;
  }
  return parsed;
}

export function parseRecordStatusParameter(value: unknown, defaultValue: RecordStatus): RecordStatus;
export function parseRecordStatusParameter(value: unknown, defaultValue: null): RecordStatus | null;
export function parseRecordStatusParameter(
  value: unknown,
  defaultValue: RecordStatus | null,
): RecordStatus | null {
  const parsed = parseStringParameter(value, 'status');
  if (!parsed) return defaultValue;

  const normalized = parsed.toUpperCase();
  if (!Object.values(RecordStatus).includes(normalized as RecordStatus)) {
    throw new RequestValidationError(`status 必须是 ${Object.values(RecordStatus).join('、')} 之一`);
  }
  return normalized as RecordStatus;
}

export function parseLibraryRecordUpdateBody(value: unknown): LibraryRecordUpdateRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new RequestValidationError('请求体必须是对象');
  }

  const body = value as Record<string, unknown>;
  const allowedKeys = new Set(['status', 'rating', 'shortReview']);
  const unknownKey = Object.keys(body).find(key => !allowedKeys.has(key));
  if (unknownKey) throw new RequestValidationError(`未知字段: ${unknownKey}`);

  const status = parseRecordStatusParameter(body.status, null);
  if (!status) throw new RequestValidationError('缺少 status 参数');

  const rating = body.rating;
  if (rating !== undefined && rating !== null
    && (typeof rating !== 'number' || !Number.isInteger(rating) || rating < 1 || rating > 5)) {
    throw new RequestValidationError('rating 必须是 1 到 5 之间的整数或 null');
  }

  const shortReview = body.shortReview;
  if (shortReview !== undefined && shortReview !== null && typeof shortReview !== 'string') {
    throw new RequestValidationError('shortReview 必须是字符串或 null');
  }
  if (typeof shortReview === 'string' && shortReview.length > 1000) {
    throw new RequestValidationError('shortReview 不能超过 1000 个字符');
  }

  return {
    status,
    ...(rating !== undefined ? { rating: rating as number | null } : {}),
    ...(shortReview !== undefined ? { shortReview: shortReview as string | null } : {}),
  };
}
