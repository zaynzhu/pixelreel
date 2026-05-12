import { Request } from 'express';
import { prisma } from '../../config/db';
import { ImportSummary } from '../../dto/import-summary';
import { RecordStatus } from '../../enums/RecordStatus';

// 豆瓣 CSV 导入服务，与 Java 端 DoubanCsvImportService 完全对齐
// 使用 csv-parser 替代 Commons-CSV

interface CsvRow {
  [key: string]: string;
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

  // 批量查已有记录
  const doubanIds = rows
    .map((r) => extractDoubanId(r[doubanIdCol || ''] || null, r[linkCol || ''] || null))
    .filter(Boolean) as string[];
  const imdbIds = rows
    .map((r) => r[imdbIdCol || ''] || null)
    .filter((v): v is string => !!v);

  const existingByDouban = doubanIds.length > 0
    ? new Map((await prisma.movie.findMany({ where: { doubanId: { in: doubanIds } } })).map((m) => [m.doubanId!, m]))
    : new Map<string, any>();
  const existingByImdb = imdbIds.length > 0
    ? new Map((await prisma.movie.findMany({ where: { imdbId: { in: imdbIds } } })).map((m) => [m.imdbId!, m]))
    : new Map<string, any>();

  const toSave: any[] = [];

  for (const record of rows) {
    summary.total++;

    const title = (titleCol ? record[titleCol] : null) || null;
    if (!title || !title.trim()) {
      summary.errors.push(`第 ${summary.total} 行缺少标题`);
      summary.skipped++;
      continue;
    }

    const doubanId = extractDoubanId(
      doubanIdCol ? record[doubanIdCol] || null : null,
      linkCol ? record[linkCol] || null : null,
    );
    const imdbIdVal = imdbIdCol ? record[imdbIdCol] || null : null;

    if (doubanId && existingByDouban.has(doubanId)) {
      summary.skipped++;
      continue;
    }
    if (imdbIdVal && existingByImdb.has(imdbIdVal)) {
      summary.skipped++;
      continue;
    }

    toSave.push({
      title: title.trim(),
      doubanId: doubanId || null,
      imdbId: imdbIdVal || null,
      status: csvParseStatus(statusCol ? record[statusCol] : undefined, defaultStatus),
      rating: csvParseRating(ratingCol ? record[ratingCol] : undefined),
      shortReview: (commentCol ? record[commentCol] : null)?.trim() || null,
    });
  }

  if (toSave.length > 0) {
    await prisma.movie.createMany({ data: toSave });
    summary.imported = toSave.length;
  }

  return summary;
}

function parseCsvBuffer(buffer: Buffer, csvParser: any): Promise<CsvRow[]> {
  return new Promise((resolve, reject) => {
    const rows: CsvRow[] = [];
    const stream = require('stream').Readable.from(buffer);
    stream
      .pipe(new csvParser.default())
      .on('data', (row: CsvRow) => rows.push(row))
      .on('end', () => resolve(rows))
      .on('error', (err: Error) => reject(err));
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

function extractDoubanId(doubanIdValue: string | null, linkValue: string | null): string | null {
  if (doubanIdValue && doubanIdValue.trim()) return doubanIdValue.trim();
  if (!linkValue || !linkValue.trim()) return null;
  const normalized = linkValue.trim();
  const idx = normalized.indexOf('/subject/');
  if (idx >= 0) {
    let tail = normalized.substring(idx + 9);
    const slash = tail.indexOf('/');
    return slash > 0 ? tail.substring(0, slash) : tail;
  }
  return null;
}

function csvParseStatus(value: string | undefined, defaultStatus: string | null | undefined): string {
  if (!value || !value.trim()) return defaultStatus || RecordStatus.WANT;
  const normalized = value.trim();
  if (normalized.includes('想') || normalized.toLowerCase() === 'want') return RecordStatus.WANT;
  if (normalized.includes('在') || normalized.toLowerCase() === 'in_progress') return RecordStatus.IN_PROGRESS;
  if (normalized.includes('看') || normalized.includes('已') || normalized.toLowerCase() === 'done') return RecordStatus.DONE;
  return defaultStatus || RecordStatus.WANT;
}

function csvParseRating(value: string | undefined): number | null {
  if (!value || !value.trim()) return null;
  try {
    let parsed = parseFloat(value.trim());
    if (parsed <= 0) return null;
    if (parsed <= 5) parsed = parsed * 2;
    const rounded = Math.round(parsed);
    return rounded > 10 ? 10 : rounded;
  } catch {
    return null;
  }
}