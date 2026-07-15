import { config } from '../../config';
import { getDb } from '../../config/db';
import { ImportSummary } from '../../dto/import-summary';
import { lookupRawgPosterUrl } from './RawgPosterLookupService';

// RAWG 封面补全服务，与 Java 端 RawgCoverFillService 完全对齐
export async function fillMissingCovers(limit?: number | null): Promise<ImportSummary> {
  const summary: ImportSummary = { total: 0, imported: 0, skipped: 0, errors: [] };

  if (!config.rawg.apiKey) {
    summary.errors.push('缺少 RAWG API Key');
    return summary;
  }

  const effectiveLimit = limit == null || limit <= 0 ? undefined : limit;
  const targets = await getDb().game.findMany({
    where: { posterUrl: null },
    orderBy: { id: 'asc' },
    ...(effectiveLimit ? { take: effectiveLimit } : {}),
  });

  summary.total = targets.length;

  for (const game of targets) {
    if (!game.title) {
      summary.skipped++;
      continue;
    }

    try {
      const posterUrl = await lookupRawgPosterUrl(game.title);
      if (!posterUrl) {
        summary.skipped++;
        continue;
      }

      await getDb().game.update({
        where: { id: game.id },
        data: { posterUrl },
      });
      summary.imported++;
    } catch (ex: any) {
      summary.errors.push(`补全失败: ${game.title}，原因: ${ex.message}`);
      summary.skipped++;
    }
  }

  return summary;
}
