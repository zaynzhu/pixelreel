import { Router, Request, Response } from 'express';
import { searchTvShows } from '../services/ExternalSearchService';
import { parseExternalSearchParameters } from './request-validation';

const router = Router();
const TV_SHOW_SEARCH_PROVIDERS = ['tmdb', 'douban'] as const;

// GET /api/search/tv-shows?query=xxx&page=1&providers=tmdb
router.get('/tv-shows', async (req: Request, res: Response) => {
  const { query, page, providers } = parseExternalSearchParameters(
    req.query as Record<string, unknown>,
    TV_SHOW_SEARCH_PROVIDERS,
  );
  const result = await searchTvShows(query, page, providers);
  res.json(result);
});

export default router;
