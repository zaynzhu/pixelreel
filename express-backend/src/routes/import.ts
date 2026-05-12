import { Router, Request, Response } from 'express';
import multer from 'multer';
import { importSteamOwnedGames } from '../services/import/SteamOwnedGamesImportService';
import { importXboxOwnedGames } from '../services/import/OpenXblImportService';
import { importPsnOwnedGames } from '../services/import/PsnProfilesImportService';
import { importDoubanCsv } from '../services/import/DoubanCsvImportService';
import { fillMissingCovers } from '../services/import/RawgCoverFillService';

const router = Router();

// multer 内存存储，用于豆瓣 CSV 上传
const upload = multer({ storage: multer.memoryStorage() });

// POST /api/import/steam/owned?steamId=xxx&status=WANT
router.post('/steam/owned', async (req: Request, res: Response) => {
  const steamId = req.query.steamId as string | undefined;
  const status = req.query.status as string | undefined;
  const result = await importSteamOwnedGames(steamId || null, status || null);
  res.json(result);
});

// POST /api/import/xbox/owned?gamertag=xxx&status=UNSET
router.post('/xbox/owned', async (req: Request, res: Response) => {
  const gamertag = req.query.gamertag as string;
  const status = req.query.status as string | undefined;
  if (!gamertag) {
    res.status(400).json({ error: '缺少 gamertag 参数' });
    return;
  }
  const result = await importXboxOwnedGames(gamertag, status || null);
  res.json(result);
});

// POST /api/import/psn/owned?psnId=xxx&status=UNSET
router.post('/psn/owned', async (req: Request, res: Response) => {
  const psnId = req.query.psnId as string;
  const status = req.query.status as string | undefined;
  if (!psnId) {
    res.status(400).json({ error: '缺少 psnId 参数' });
    return;
  }
  const result = await importPsnOwnedGames(psnId, status || null);
  res.json(result);
});

// POST /api/import/douban — multipart 文件上传
router.post('/douban', upload.single('file'), async (req: Request, res: Response) => {
  const defaultStatus = req.query.status as string | undefined;
  const file = req.file;
  const result = await importDoubanCsv(file, defaultStatus || null);
  res.json(result);
});

// POST /api/import/covers/fill?limit=50
router.post('/covers/fill', async (req: Request, res: Response) => {
  const limitParam = req.query.limit as string | undefined;
  const limit = limitParam ? parseInt(limitParam, 10) : null;
  const result = await fillMissingCovers(isNaN(limit ?? 0) ? null : limit);
  res.json(result);
});

export default router;