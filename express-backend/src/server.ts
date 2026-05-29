import express from 'express';
import cors from 'cors';
import { config } from './config';
import { registerExtensions } from './config/db';
import { createActivityLogExtension } from './middlewares/activity-log';
import apiRoutes from './routes';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler';
import cron from 'node-cron';
import { runRadarSync, runNewReleaseRadarSync } from './services/radar/radarSyncService';

// JSON 序列化 BigInt 支持（Prisma 使用 BigInt 作为主键类型）
(BigInt.prototype as any).toJSON = function () {
  return Number(this);
};

// 注册活动日志 Prisma 扩展（必须在路由挂载前）
registerExtensions(createActivityLogExtension());

const app = express();

// 中间件
app.use(cors());
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

// 启动服务
app.listen(config.port, () => {
  console.log(`[PixelReel Express] 服务已启动，监听端口 ${config.port}`);
  console.log(`[PixelReel Express] 数据库: ${config.database.url.replace(/\/\/[^:]+:[^@]+@/, '//***:***@')}`);

  // Radar cron + startup sync
  if (config.radar.enabled) {
    if (config.radar.syncOnStart) {
      setTimeout(() => {
        console.log('[Radar] 启动热门同步...');
        runRadarSync().catch(err => console.error('[Radar] 热门启动同步失败:', err.message));
      }, 5000);
      setTimeout(() => {
        console.log('[Radar] 启动新片同步...');
        runNewReleaseRadarSync().catch(err => console.error('[Radar] 新片启动同步失败:', err.message));
      }, 15000);
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

export default app;