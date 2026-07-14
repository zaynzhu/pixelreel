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

type RecordWriteMode = 'create' | 'update';
type FieldParser = (value: unknown, name: string) => unknown;

function parseRequiredTextField(value: unknown, name: string, maxLength: number): string {
  if (typeof value !== 'string') throw new RequestValidationError(`${name} 必须是字符串`);
  const parsed = value.trim();
  if (!parsed) throw new RequestValidationError(`${name} 不能为空`);
  if (parsed.length > maxLength) throw new RequestValidationError(`${name} 不能超过 ${maxLength} 个字符`);
  return parsed;
}

function parseNullableTextField(value: unknown, name: string, maxLength?: number): string | null {
  if (value == null) return null;
  if (typeof value !== 'string') throw new RequestValidationError(`${name} 必须是字符串或 null`);
  if (maxLength != null && value.length > maxLength) {
    throw new RequestValidationError(`${name} 不能超过 ${maxLength} 个字符`);
  }
  return value;
}

function parseNullableIdentifierField(value: unknown, name: string, maxLength: number): string | null {
  const parsed = parseNullableTextField(value, name, maxLength)?.trim() ?? null;
  return parsed || null;
}

function parseNullablePositiveBigIntField(value: unknown, name: string): bigint | null {
  if (value == null) return null;
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new RequestValidationError(`${name} 必须是正整数`);
    }
    return BigInt(value);
  }
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value.trim())) {
    throw new RequestValidationError(`${name} 必须是正整数`);
  }
  return BigInt(value.trim());
}

function parseNullableIntegerField(
  value: unknown,
  name: string,
  min: number,
  max: number,
): number | null {
  if (value == null) return null;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw new RequestValidationError(`${name} 必须是 ${min} 到 ${max} 之间的整数或 null`);
  }
  return value;
}

function parseNullableNumberField(
  value: unknown,
  name: string,
  min: number,
  max?: number,
): number | null {
  if (value == null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || (max != null && value > max)) {
    const range = max == null ? `不小于 ${min}` : `${min} 到 ${max} 之间`;
    throw new RequestValidationError(`${name} 必须是${range}的数字或 null`);
  }
  return value;
}

function parseNullableDateTimeField(value: unknown, name: string): Date | null {
  if (value == null) return null;
  if (typeof value !== 'string') throw new RequestValidationError(`${name} 必须是日期字符串或 null`);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new RequestValidationError(`${name} 必须是有效日期`);
  return parsed;
}

function parseStatusField(value: unknown): RecordStatus {
  const status = parseRecordStatusParameter(value, null);
  if (!status) throw new RequestValidationError('缺少 status 参数');
  return status;
}

function parseRatingField(value: unknown, name: string): number | null {
  return parseNullableIntegerField(value, name, 1, 5);
}

const COMMON_RECORD_FIELDS: Record<string, FieldParser> = {
  title: (value, name) => parseRequiredTextField(value, name, 255),
  posterUrl: (value, name) => parseNullableTextField(value, name, 500),
  status: value => parseStatusField(value),
  rating: parseRatingField,
  shortReview: (value, name) => parseNullableTextField(value, name, 1000),
};

const COMMON_MEDIA_FIELDS: Record<string, FieldParser> = {
  ...COMMON_RECORD_FIELDS,
  overview: (value, name) => parseNullableTextField(value, name),
  doubanId: (value, name) => parseNullableIdentifierField(value, name, 20),
  tmdbId: parseNullablePositiveBigIntField,
  imdbId: (value, name) => parseNullableIdentifierField(value, name, 20),
  traktId: (value, name) => parseNullableIdentifierField(value, name, 20),
  tmdbTitle: (value, name) => parseNullableTextField(value, name, 255),
  tmdbPosterUrl: (value, name) => parseNullableTextField(value, name, 500),
  tmdbReleaseDate: (value, name) => parseNullableTextField(value, name, 20),
  tmdbOverview: (value, name) => parseNullableTextField(value, name),
  tmdbVoteAverage: (value, name) => parseNullableNumberField(value, name, 0, 10),
  tmdbPopularity: (value, name) => parseNullableNumberField(value, name, 0),
  tmdbGenreIds: (value, name) => parseNullableTextField(value, name, 200),
  imdbRating: (value, name) => parseNullableNumberField(value, name, 0, 10),
};

const MOVIE_FIELDS: Record<string, FieldParser> = {
  ...COMMON_MEDIA_FIELDS,
  releaseDate: (value, name) => parseNullableTextField(value, name, 20),
};

const TV_SHOW_FIELDS: Record<string, FieldParser> = {
  ...COMMON_MEDIA_FIELDS,
  firstAirDate: (value, name) => parseNullableTextField(value, name, 20),
};

const GAME_FIELDS: Record<string, FieldParser> = {
  ...COMMON_RECORD_FIELDS,
  platform: (value, name) => parseNullableTextField(value, name, 20),
  playtimeMinutes: (value, name) => parseNullableIntegerField(value, name, 0, 2147483647),
  achievementTotal: (value, name) => parseNullableIntegerField(value, name, 0, 2147483647),
  achievementUnlocked: (value, name) => parseNullableIntegerField(value, name, 0, 2147483647),
  importedAt: parseNullableDateTimeField,
  rawgId: parseNullablePositiveBigIntField,
  steamAppId: parseNullablePositiveBigIntField,
  xboxId: (value, name) => parseNullableIdentifierField(value, name, 50),
  psnId: (value, name) => parseNullableIdentifierField(value, name, 50),
};

function parseRecordWriteBody(
  value: unknown,
  mode: RecordWriteMode,
  fields: Record<string, FieldParser>,
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new RequestValidationError('请求体必须是对象');
  }

  const body = value as Record<string, unknown>;
  const keys = Object.keys(body);
  if (keys.length === 0) throw new RequestValidationError('请求体不能为空');

  const unknownKey = keys.find(key => !Object.prototype.hasOwnProperty.call(fields, key));
  if (unknownKey) throw new RequestValidationError(`未知字段: ${unknownKey}`);

  if (mode === 'create') {
    if (!Object.prototype.hasOwnProperty.call(body, 'title')) throw new RequestValidationError('缺少 title 参数');
    if (!Object.prototype.hasOwnProperty.call(body, 'status')) throw new RequestValidationError('缺少 status 参数');
  }

  return Object.fromEntries(keys.map(key => [key, fields[key](body[key], key)]));
}

export function parseMovieRecordWriteBody(value: unknown, mode: RecordWriteMode): Record<string, unknown> {
  return parseRecordWriteBody(value, mode, MOVIE_FIELDS);
}

export function parseTvShowRecordWriteBody(value: unknown, mode: RecordWriteMode): Record<string, unknown> {
  return parseRecordWriteBody(value, mode, TV_SHOW_FIELDS);
}

export function parseGameRecordWriteBody(value: unknown, mode: RecordWriteMode): Record<string, unknown> {
  return parseRecordWriteBody(value, mode, GAME_FIELDS);
}
