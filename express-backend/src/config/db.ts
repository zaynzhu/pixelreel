import { PrismaClient } from '@prisma/client';

// Prisma 单例，避免开发时热重载创建多个连接
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

const rawPrisma = globalForPrisma.prisma || new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = rawPrisma;
}

// 扩展后的客户端（初始为 rawPrisma，registerExtensions 后替换为带扩展的版本）
let extendedPrisma: PrismaClient = rawPrisma;

/**
 * 获取扩展后的 Prisma 客户端。
 * 所有业务代码应使用 getDb() 而非直接引用 rawPrisma。
 */
export function getDb(): PrismaClient {
  return extendedPrisma;
}

/**
 * 注册 Prisma 扩展。必须在路由挂载前调用。
 */
export function registerExtensions(...extensions: Parameters<PrismaClient['$extends']>[0][]) {
  for (const ext of extensions) {
    extendedPrisma = extendedPrisma.$extends(ext) as unknown as PrismaClient;
  }
}