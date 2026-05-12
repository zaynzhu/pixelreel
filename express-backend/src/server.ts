import express from 'express';
import cors from 'cors';
import { config } from './config';
import apiRoutes from './routes';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler';

// JSON 序列化 BigInt 支持（Prisma 使用 BigInt 作为主键类型）
(BigInt.prototype as any).toJSON = function () {
  return Number(this);
};

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
});

export default app;