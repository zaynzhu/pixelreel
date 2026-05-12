import { Request, Response, NextFunction } from 'express';

// 全局错误处理中间件
export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction) {
  console.error(`[Error] ${err.message}`, err.stack);
  const status = (err as any).status || 500;
  const message = status === 500 ? '内部服务器错误' : err.message;
  res.status(status).json({ error: message });
}

// 404 中间件
export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ error: '接口不存在' });
}