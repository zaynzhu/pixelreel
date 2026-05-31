import { Router } from 'express';
import movieRoutes from '../routes/movie';
import gameRoutes from '../routes/game';
import tvShowRoutes from '../routes/tvShow';
import searchRoutes from '../routes/search';
import searchTvShowRoutes from '../routes/searchTvShows';
import importRoutes from '../routes/import';
import libraryRoutes from '../routes/library';
import profileRoutes from '../routes/profile';
import authRoutes from '../routes/auth';
import traktRoutes from '../routes/trakt';
import activityRoutes from '../routes/activity';
import analyticsRoutes from '../routes/analytics';
import settingsRoutes from '../routes/settings';
import timelineRoutes from '../routes/timeline';
import radarRoutes from '../routes/radar';
import toolsRoutes from '../routes/tools';

const router = Router();

// 认证路由（无需鉴权）
router.use('/auth', authRoutes);

// Trakt OAuth + 导入路由
router.use('/trakt', traktRoutes);

// 业务路由
router.use('/movies', movieRoutes);
router.use('/games', gameRoutes);
router.use('/tv-shows', tvShowRoutes);
router.use('/search', searchRoutes);
router.use('/search', searchTvShowRoutes);
router.use('/import', importRoutes);
router.use('/library', libraryRoutes);
router.use('/profile', profileRoutes);
router.use('/activity', activityRoutes);
router.use('/analytics', analyticsRoutes);

// 系统设置路由
router.use('/settings', settingsRoutes);

// 时间线轻量接口
router.use('/timeline', timelineRoutes);

// 雷达路由
router.use('/radar', radarRoutes);

// 工具路由
router.use('/tools', toolsRoutes);

export default router;