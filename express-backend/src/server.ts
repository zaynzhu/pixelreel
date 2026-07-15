import express from 'express';
import cors from 'cors';
import { config, validateAuthConfiguration } from './config';
import { getDb, registerExtensions } from './config/db';
import { createActivityLogExtension } from './middlewares/activity-log';
import apiRoutes from './routes';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler';
import cron from 'node-cron';
import { runRadarSync, runNewReleaseRadarSync } from './services/radar/radarSyncService';
import { registerExternalApiRateLimiter } from './services/external-api-rate-limiter';
import { initializeTaskManager } from './services/task-manager';

// JSON 序列化 BigInt 支持（Prisma 使用 BigInt 作为主键类型）
(BigInt.prototype as any).toJSON = function () {
  return Number(this);
};

const authConfigurationError = validateAuthConfiguration({
  enabled: config.authEnabled,
  secret: config.jwt.secret,
  username: config.jwt.username,
  password: config.jwt.password,
});
if (authConfigurationError) throw new Error(`[Auth] ${authConfigurationError}`);

// 注册活动日志 Prisma 扩展（必须在路由挂载前）
registerExtensions(createActivityLogExtension());

// 加载持久化任务，并把重启前遗留的运行中任务标记为中断
const recoveredTaskCount = initializeTaskManager();
if (recoveredTaskCount > 0) {
  console.warn(`[TaskManager] 已恢复 ${recoveredTaskCount} 个因服务重启中断的任务`);
}

// 所有 Axios 外部 API 请求按服务统一限流
registerExternalApiRateLimiter();

const app = express();
app.disable('x-powered-by');

// 中间件
app.use(cors({
  origin: (origin, callback) => {
    const allowed = !origin || config.cors.allowedOrigins.includes(origin);
    callback(null, allowed);
  },
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 全局设置响应为 UTF-8 JSON
app.use((_req, res, next) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  next();
});

// API 路由
app.use('/api', apiRoutes);

// 错误处理
app.use(notFoundHandler);
app.use(errorHandler);

const startupTimers: NodeJS.Timeout[] = [];
let shutdownStarted = false;

// 启动服务
const server = app.listen(config.port, config.host, () => {
  if (shutdownStarted) return;
  console.log(`[PixelReel Express] 服务已启动，监听 ${config.host}:${config.port}`);
  console.log(`[PixelReel Express] 数据库: ${config.database.url.replace(/\/\/[^:]+:[^@]+@/, '//***:***@')}`);

  // Radar cron + startup sync
  if (config.radar.enabled) {
    if (config.radar.syncOnStart) {
      startupTimers.push(setTimeout(() => {
        console.log('[Radar] 启动热门同步...');
        runRadarSync().catch(err => console.error('[Radar] 热门启动同步失败:', err.message));
      }, 5000));
      startupTimers.push(setTimeout(() => {
        console.log('[Radar] 启动新片同步...');
        runNewReleaseRadarSync().catch(err => console.error('[Radar] 新片启动同步失败:', err.message));
      }, 15000));
    }
    if (config.radar.cronEnabled) {
      cron.schedule(config.radar.syncCoreCron, () => {
        console.log('[Radar] 定时同步热门 TMDB...');
        runRadarSync('tmdb').catch(err => console.error('[Radar] 热门 TMDB 同步失败:', err.message));
      });
      cron.schedule(config.radar.syncCoreCron, () => {
        console.log('[Radar] 定时同步新片 TMDB...');
        runNewReleaseRadarSync('tmdb').catch(err => console.error('[Radar] 新片 TMDB 同步失败:', err.message));
      });
      if (config.radar.scrapersEnabled) {
        cron.schedule(config.radar.syncScraperCron, () => {
          console.log('[Radar] 定时同步所有热门源...');
          runRadarSync().catch(err => console.error('[Radar] 热门定时同步失败:', err.message));
        });
        cron.schedule(config.radar.syncScraperCron, () => {
          console.log('[Radar] 定时同步所有新片源...');
          runNewReleaseRadarSync().catch(err => console.error('[Radar] 新片定时同步失败:', err.message));
        });
      }
    }
  }
});

function shutdown(signal: NodeJS.Signals) {
  if (shutdownStarted) return;
  shutdownStarted = true;
  console.log(`[PixelReel Express] 收到 ${signal}，正在关闭服务...`);

  for (const timer of startupTimers) clearTimeout(timer);
  const scheduledTasksStopped = Promise.all(
    [...cron.getTasks().values()].map(task => task.destroy()),
  ).catch(error => {
    console.error('[PixelReel Express] 停止定时任务失败:', error);
  });

  const forceExitTimer = setTimeout(() => {
    console.error('[PixelReel Express] 关闭超时，强制退出');
    server.closeAllConnections();
    process.exit(1);
  }, 10_000);
  forceExitTimer.unref();

  server.close(async error => {
    await scheduledTasksStopped;
    let exitCode = error ? 1 : 0;
    if (error) console.error('[PixelReel Express] 关闭 HTTP 服务失败:', error);
    try {
      await getDb().$disconnect();
    } catch (disconnectError) {
      exitCode = 1;
      console.error('[PixelReel Express] 断开数据库失败:', disconnectError);
    }
    clearTimeout(forceExitTimer);
    console.log('[PixelReel Express] 服务已关闭');
    process.exit(exitCode);
  });
}

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));

export default app;
