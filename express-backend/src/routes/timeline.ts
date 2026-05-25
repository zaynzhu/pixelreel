import { Router, Request, Response } from 'express';
import { listTimelineRecords } from '../services/TimelineService';
import { normalizeCategory } from '../services/LibraryService';
import { parseRecordStatus } from '../enums/RecordStatus';

const router = Router();

function normalizeTimelineCategory(value?: string): 'all' | 'media' | 'movie' | 'tv_show' | 'game' {
  if (value === 'movie' || value === 'tv_show' || value === 'game' || value === 'media') {
    return value;
  }
  return 'all';
}

function normalizeTimelineStatus(value?: string): string | undefined {
  if (!value) return undefined;
  const parsed = parseRecordStatus(value);
  return parsed ?? undefined;
}

router.get('/', async (req: Request, res: Response) => {
  const parsedLimit = parseInt(req.query.limit as string, 10);
  const limit = Math.min(Math.max(Number.isFinite(parsedLimit) ? parsedLimit : 96, 1), 200);
  const parsedYear = parseInt(req.query.year as string, 10);

  const result = await listTimelineRecords({
    cursor: req.query.cursor as string | undefined,
    limit,
    includeTotals: req.query.includeTotals !== 'false',
    category: normalizeTimelineCategory(req.query.category as string | undefined),
    year: Number.isFinite(parsedYear) ? parsedYear : undefined,
    status: normalizeTimelineStatus(req.query.status as string | undefined),
  });

  res.json(result);
});

export default router;