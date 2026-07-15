import {
  parsePaginationCursorParameter,
  parsePositiveIntegerParameter,
  RequestValidationError,
} from './request-validation';

const RECORD_LIST_PARAMETER_KEYS = new Set(['cursor', 'limit']);

export interface RecordListParameters {
  cursor: { createdAt: Date; id: bigint } | null;
  limit: number;
}

export function parseRecordListParameters(query: Record<string, unknown>): RecordListParameters {
  const unknownKey = Object.keys(query).find(key => !RECORD_LIST_PARAMETER_KEYS.has(key));
  if (unknownKey) throw new RequestValidationError(`未知参数: ${unknownKey}`);

  const cursorText = parsePaginationCursorParameter(query.cursor);
  if (!cursorText) {
    return {
      cursor: null,
      limit: parsePositiveIntegerParameter(query.limit, 'limit', 50, 200),
    };
  }

  const separatorIndex = cursorText.lastIndexOf('__');
  return {
    cursor: {
      createdAt: new Date(cursorText.slice(0, separatorIndex)),
      id: BigInt(cursorText.slice(separatorIndex + 2)),
    },
    limit: parsePositiveIntegerParameter(query.limit, 'limit', 50, 200),
  };
}

export function buildRecordListCursorWhere(cursor: RecordListParameters['cursor']) {
  if (!cursor) return undefined;
  return {
    OR: [
      { createdAt: { lt: cursor.createdAt } },
      { createdAt: { equals: cursor.createdAt }, id: { lt: cursor.id } },
    ],
  };
}

export function createRecordListResponse<T extends { createdAt: Date; id: number | bigint }>(
  rows: T[],
  limit: number,
) {
  const records = rows.slice(0, limit);
  const lastRecord = records[records.length - 1];
  const nextCursor = rows.length > limit && lastRecord
    ? `${lastRecord.createdAt.toISOString()}__${lastRecord.id}`
    : null;
  return { records, nextCursor };
}
