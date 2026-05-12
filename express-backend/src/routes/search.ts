import { Router, Request, Response } from 'express';
import { searchMovies, searchGames } from '../services/ExternalSearchService';

const router = Router();

// GET /api/search/movies?query=xxx&page=1&providers=tmdb,omdb
router.get('/movies', async (req: Request, res: Response) => {
  const query = req.query.query as string;
  const page = parseInt(req.query.page as string) || 1;
  const providers = req.query.providers as string | string[] | undefined;

  let providerList: string[] | undefined;
  if (providers) {
    providerList = Array.isArray(providers) ? providers : [providers];
  }

  const result = await searchMovies(query ?? '', page, providerList);
  res.json(result);
});

// GET /api/search/games?query=xxx&page=1&providers=rawg,steam
router.get('/games', async (req: Request, res: Response) => {
  const query = req.query.query as string;
  const page = parseInt(req.query.page as string) || 1;
  const providers = req.query.providers as string | string[] | undefined;

  let providerList: string[] | undefined;
  if (providers) {
    providerList = Array.isArray(providers) ? providers : [providers];
  }

  const result = await searchGames(query ?? '', page, providerList);
  res.json(result);
});

export default router;