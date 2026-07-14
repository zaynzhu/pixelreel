import { RecordStatus } from '../enums/RecordStatus';

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
