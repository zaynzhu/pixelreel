import { Router } from 'express';
import { getDb } from '../config/db';

const router = Router();

type DatabaseCheck = () => Promise<void>;

async function checkDatabase(): Promise<void> {
  await getDb().$queryRaw`SELECT 1`;
}

export async function getHealthStatus(databaseCheck: DatabaseCheck = checkDatabase) {
  try {
    await databaseCheck();
    return {
      status: 'ok' as const,
      service: 'ok' as const,
      database: 'ok' as const,
    };
  } catch {
    return {
      status: 'degraded' as const,
      service: 'ok' as const,
      database: 'unavailable' as const,
    };
  }
}

router.get('/', async (_req, res) => {
  const health = await getHealthStatus();
  res.status(health.database === 'ok' ? 200 : 503).json(health);
});

export default router;
