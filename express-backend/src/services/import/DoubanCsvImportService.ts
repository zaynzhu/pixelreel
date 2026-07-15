import { Request } from 'express';
import { getDb } from '../../config/db';
import { ImportSummary } from '../../dto/import-summary';
import { RecordStatus } from '../../enums/RecordStatus';

// 豆瓣 CSV 导入服务，与 Java 端 DoubanCsvImportService 完全对齐
// 使用 csv-parser 替代 Commons-CSV

interface CsvRow {
  [key: string]: string;
}

export const DOUBAN_CSV_MAX_ROWS = 20_000;
const MOVIE_TITLE_MAX_LENGTH = 255;
const SHORT_REVIEW_MAX_LENGTH = 1000;

export class DoubanCsvLimitError extends Error {
  readonly status = 413;

  constructor(message: string) {
    super(message);
    this.name = 'DoubanCsvLimitError';
  }
}

export function assertDoubanCsvRowLimit(currentRowCount: number) {
  if (currentRowCount >= DOUBAN_CSV_MAX_ROWS) {
    throw new DoubanCsvLimitError(`CSV 数据行不能超过 ${DOUBAN_CSV_MAX_ROWS} 行`);
  }
}

export async function importDoubanCsv(file: Express.Multer.File | undefined, defaultStatus?: string | null): Promise<ImportSummary> {
  const summary: ImportSummary = { total: 0, imported: 0, skipped: 0, errors: [] };

  if (!file || !file.buffer || file.buffer.length === 0) {
    summary.errors.push('CSV 文件为空');
    return summary;
  }

  const csvParser = await import('csv-parser');
  const rows: CsvRow[] = await parseCsvBuffer(file.buffer, csvParser);

  if (rows.length === 0) {
    summary.errors.push('CSV 无有效数据行');
    return summary;
  }

  // 构建 header 映射
  const headers = Object.keys(rows[0] || {});
  const headerMap = buildHeaderMap(headers);

  const titleCol = pickHeader(headerMap, 'title', 'name', '电影', '片名', '标题', '条目', '作品');
  const doubanIdCol = pickHeader(headerMap, 'douban', '豆瓣', 'subject', '条目id', 'subjectid', 'subject_id');
  const imdbIdCol = pickHeader(headerMap, 'imdb');
  const ratingCol = pickHeader(headerMap, 'rating', '评分', '分数', '星级');
  const statusCol = pickHeader(headerMap, 'status', '状态', '标记');
  const commentCol = pickHeader(headerMap, 'comment', '短评', '评论', '备注', '感想');
  const linkCol = pickHeader(headerMap, 'link', 'url', '链接', '豆瓣链接');
  const dateCol = pickHeader(headerMap, 'date', '标记日期', '看过日期', '时间', 'timestamp', '标记时间');

  // 批量查已有记录
  const doubanIds = rows
    .map((r) => extractDoubanId(r[doubanIdCol || ''] || null, r[linkCol || ''] || null))
    .filter(Boolean) as string[];
  const imdbIds = rows
    .map((r) => normalizeImdbId(r[imdbIdCol || ''] || null))
    .filter((v): v is string => !!v);

  const existingByDouban = doubanIds.length > 0
    ? new Map((await getDb().movie.findMany({ where: { doubanId: { in: doubanIds } } })).map((m) => [m.doubanId!, m]))
    : new Map<string, any>();
  const existingByImdb = imdbIds.length > 0
    ? new Map((await getDb().movie.findMany({ where: { imdbId: { in: imdbIds } } })).map((m) => [m.imdbId!, m]))
    : new Map<string, any>();
  const seenDoubanIds = new Set(existingByDouban.keys());
  const seenImdbIds = new Set(existingByImdb.keys());

  const toSave: any[] = [];

  for (const record of rows) {
    summary.total++;

    const title = ((titleCol ? record[titleCol] : null) || '').trim();
    if (!title) {
      summary.errors.push(`第 ${summary.total} 行缺少标题`);
      summary.skipped++;
      continue;
    }
    if (title.length > MOVIE_TITLE_MAX_LENGTH) {
      summary.errors.push(`第 ${summary.total} 行标题超过 ${MOVIE_TITLE_MAX_LENGTH} 个字符`);
      summary.skipped++;
      continue;
    }

    const doubanId = extractDoubanId(
      doubanIdCol ? record[doubanIdCol] || null : null,
      linkCol ? record[linkCol] || null : null,
    );
    const imdbIdVal = normalizeImdbId(imdbIdCol ? record[imdbIdCol] || null : null);
    const shortReview = (commentCol ? record[commentCol] : null)?.trim() || null;
    if (shortReview && shortReview.length > SHORT_REVIEW_MAX_LENGTH) {
      summary.errors.push(`第 ${summary.total} 行短评超过 ${SHORT_REVIEW_MAX_LENGTH} 个字符`);
      summary.skipped++;
      continue;
    }

    if (!claimCsvIdentifiers(doubanId, imdbIdVal, seenDoubanIds, seenImdbIds)) {
      summary.skipped++;
      continue;
    }

    const dateVal = dateCol ? record[dateCol] : null;
    const parsedDate = parseDate(dateVal);

    toSave.push({
      title,
      doubanId: doubanId || null,
      imdbId: imdbIdVal || null,
      status: csvParseStatus(statusCol ? record[statusCol] : undefined, defaultStatus),
      rating: csvParseRating(ratingCol ? record[ratingCol] : undefined),
      shortReview,
      createdAt: parsedDate,
    });
  }

  if (toSave.length > 0) {
    await getDb().movie.createMany({ data: toSave });
    summary.imported = toSave.length;
  }

  return summary;
}

export function parseCsvBuffer(buffer: Buffer, csvParser: any): Promise<CsvRow[]> {
  return new Promise((resolve, reject) => {
    const rows: CsvRow[] = [];
    const stream = require('stream').Readable.from(buffer);
    const parser = csvParser.default();
    parser
      .on('data', (row: CsvRow) => {
        try {
          assertDoubanCsvRowLimit(rows.length);
          rows.push(row);
        } catch (error) {
          parser.destroy(error as Error);
        }
      })
      .on('end', () => resolve(rows))
      .on('error', (err: Error) => reject(err));
    stream.pipe(parser);
  });
}

function buildHeaderMap(headers: string[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const header of headers) {
    if (!header) continue;
    map.set(normalize(header), header);
  }
  return map;
}

function pickHeader(headerMap: Map<string, string>, ...candidates: string[]): string | null {
  for (const candidate of candidates) {
    const normalized = normalize(candidate);
    if (headerMap.has(normalized)) return headerMap.get(normalized)!;
    for (const [key, value] of headerMap) {
      if (key.includes(normalized)) return value;
    }
  }
  return null;
}

function normalize(value: string): string {
  return value ? value.trim().toLowerCase() : '';
}

export function extractDoubanId(
  doubanIdValue: string | null,
  linkValue: string | null,
): string | null {
  for (const candidate of [doubanIdValue, linkValue]) {
    if (!candidate?.trim()) continue;
    const normalized = candidate.trim();
    if (/^\d{1,20}$/.test(normalized)) return normalized;
    const subjectMatch = normalized.match(/\/subject\/(\d{1,20})(?:[/?#]|$)/);
    if (subjectMatch) return subjectMatch[1];
  }
  return null;
}

export function normalizeImdbId(value: string | null): string | null {
  const normalized = value?.trim().toLowerCase() ?? '';
  return /^tt\d{7,10}$/.test(normalized) ? normalized : null;
}

export function claimCsvIdentifiers(
  doubanId: string | null,
  imdbId: string | null,
  seenDoubanIds: Set<string>,
  seenImdbIds: Set<string>,
): boolean {
  const duplicate = Boolean(
    (doubanId && seenDoubanIds.has(doubanId))
    || (imdbId && seenImdbIds.has(imdbId)),
  );
  if (doubanId) seenDoubanIds.add(doubanId);
  if (imdbId) seenImdbIds.add(imdbId);
  return !duplicate;
}

function csvParseStatus(value: string | undefined, defaultStatus: string | null | undefined): string {
  if (!value || !value.trim()) return defaultStatus || RecordStatus.WANT;
  const normalized = value.trim();
  if (normalized.includes('想') || normalized.toLowerCase() === 'want') return RecordStatus.WANT;
  if (normalized.includes('在') || normalized.toLowerCase() === 'in_progress') return RecordStatus.IN_PROGRESS;
  if (normalized.includes('看') || normalized.includes('已') || normalized.toLowerCase() === 'done') return RecordStatus.DONE;
  return defaultStatus || RecordStatus.WANT;
}

export function csvParseRating(value: string | undefined): number | null {
  if (!value || !value.trim()) return null;
  const parsed = Number.parseFloat(value.trim());
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.min(Math.round(parsed), 5);
}

export function parseDate(value: string | null | undefined): string | undefined {
  if (!value || !value.trim()) return undefined;
  const trimmed = value.trim();
  // 匹配 YYYY-MM-DD 或 YYYY/MM/DD
  const match = trimmed.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})$/);
  if (match) {
    const [, year, month, day] = match;
    const yearNumber = Number(year);
    const monthNumber = Number(month);
    const dayNumber = Number(day);
    const date = new Date(Date.UTC(yearNumber, monthNumber - 1, dayNumber));
    if (date.getUTCFullYear() !== yearNumber
      || date.getUTCMonth() !== monthNumber - 1
      || date.getUTCDate() !== dayNumber) {
      return undefined;
    }
    return date.toISOString();
  }
  // 兜底：尝试原生解析
  const d = new Date(trimmed);
  if (!Number.isNaN(d.getTime())) {
    return d.toISOString();
  }
  return undefined;
}
