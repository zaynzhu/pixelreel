import { Router, Request, Response } from 'express';
import { searchTvShows } from '../services/ExternalSearchService';

const router = Router();

// GET /api/search/tv-shows?query=xxx&page=1&providers=tmdb
router.get('/tv-shows', async (req: Request, res: Response) => {
  const query = req.query.query as string;
  const page = parseInt(req.query.page as string) || 1;
  const providers = req.query.providers as string | string[] | undefined;

  let providerList: string[] | undefined;
  if (providers) {
    providerList = Array.isArray(providers) ? providers : [providers];
  }

  const result = await searchTvShows(query ?? '', page, providerList);
  res.json(result);
});

export default router;