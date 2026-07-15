import { RecordStatus } from '../enums/RecordStatus';
import type { LibraryRecordUpdateRequest } from '../dto/library';

const EXTERNAL_SEARCH_PARAMETER_KEYS = new Set(['query', 'page', 'providers']);

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
  if (value == null || value === '') {
    if (required) throw new RequestValidationError(`缺少 ${name} 参数`);
    return null;
  }
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

export function parseBoundedStringParameter(
  value: unknown,
  name: string,
  maxLength: number,
  required = false,
): string | null {
  const parsed = parseStringParameter(value, name, required);
  if (parsed && parsed.length > maxLength) {
    throw new RequestValidationError(`${name} 不能超过 ${maxLength} 个字符`);
  }
  return parsed;
}

export function parsePatternParameter(
  value: unknown,
  name: string,
  pattern: RegExp,
  maxLength: number,
): string {
  const parsed = parseBoundedStringParameter(value, name, maxLength, true)!;
  if (!pattern.test(parsed)) throw new RequestValidationError(`${name} 格式无效`);
  return parsed;
}

export function parseStringListParameter(
  value: unknown,
  name: string,
  allowedValues: readonly string[],
): string[] | undefined {
  if (value == null) return undefined;
  const values = Array.isArray(value) ? value : [value];
  if (values.length === 0 || values.some(item => typeof item !== 'string')) {
    throw new RequestValidationError(`${name} 必须是字符串列表`);
  }

  const result = new Set<string>();
  for (const valueItem of values as string[]) {
    const parts = valueItem.split(',');
    if (parts.length === 0 || parts.some(part => !part.trim())) {
      throw new RequestValidationError(`${name} 不能包含空值`);
    }
    for (const part of parts) {
      const normalized = part.trim().toLowerCase();
      if (!allowedValues.includes(normalized)) {
        throw new RequestValidationError(`${name} 只支持 ${allowedValues.join('、')}`);
      }
      result.add(normalized);
    }
  }
  return [...result];
}

export function parseExternalSearchParameters(
  value: Record<string, unknown>,
  allowedProviders: readonly string[],
) {
  const unknownKey = Object.keys(value).find(key => !EXTERNAL_SEARCH_PARAMETER_KEYS.has(key));
  if (unknownKey) throw new RequestValidationError(`未知参数: ${unknownKey}`);

  return {
    query: parseBoundedStringParameter(value.query, 'query', 200, true)!,
    page: parsePositiveIntegerParameter(value.page, 'page', 1, 1000),
    providers: parseStringListParameter(value.providers, 'providers', allowedProviders),
  };
}

export function parseEnumParameter<T extends string>(
  value: unknown,
  name: string,
  allowedValues: readonly T[],
  required = false,
): T | null {
  const parsed = parseStringParameter(value, name, required);
  if (!parsed) return null;
  if (!allowedValues.includes(parsed as T)) {
    throw new RequestValidationError(`${name} 必须是 ${allowedValues.join('、')} 之一`);
  }
  return parsed as T;
}

export function parseBooleanParameter(value: unknown, name: string, defaultValue: boolean): boolean {
  if (value == null) return defaultValue;
  const parsed = parseStringParameter(value, name, true);
  if (parsed === 'true') return true;
  if (parsed === 'false') return false;
  throw new RequestValidationError(`${name} 必须是 true 或 false`);
}

export function parseYearParameter(value: unknown, name = 'year'): number | null {
  if (value == null) return null;
  const parsed = parseStringParameter(value, name, true)!;
  if (!/^\d{4}$/.test(parsed)) {
    throw new RequestValidationError(`${name} 必须是 1900 到 3000 之间的年份`);
  }
  const year = Number(parsed);
  if (year < 1900 || year > 3000) {
    throw new RequestValidationError(`${name} 必须是 1900 到 3000 之间的年份`);
  }
  return year;
}

export function parsePaginationCursorParameter(value: unknown, name = 'cursor'): string | null {
  if (value == null) return null;
  const parsed = parseBoundedStringParameter(value, name, 100, true)!;
  const separatorIndex = parsed.lastIndexOf('__');
  if (separatorIndex <= 0) throw new RequestValidationError(`${name} 格式无效`);

  const dateText = parsed.slice(0, separatorIndex);
  const idText = parsed.slice(separatorIndex + 2);
  const date = new Date(dateText);
  const id = Number(idText);
  if (Number.isNaN(date.getTime()) || date.toISOString() !== dateText
    || !/^[1-9]\d*$/.test(idText) || !Number.isSafeInteger(id)) {
    throw new RequestValidationError(`${name} 格式无效`);
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
  return parsePositiveBigIntParameter(value, name);
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
