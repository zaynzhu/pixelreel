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

export default router;