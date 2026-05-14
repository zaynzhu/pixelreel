-- PixelReel 数据库初始化
-- 仅建库，建表由 Prisma db push 完成（从 express-backend/prisma/schema.prisma 生成）
-- 用法: mysql -u root -p < db/init.sql

CREATE DATABASE IF NOT EXISTS pixelreel
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
USE pixelreel;
