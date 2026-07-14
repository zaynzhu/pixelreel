import { Request, Response, NextFunction } from 'express';

export function getHttpErrorResponse(error: unknown) {
  const rawStatus = typeof error === 'object' && error !== null
    ? Number((error as { status?: unknown }).status)
    : NaN;
  const status = Number.isInteger(rawStatus) && rawStatus >= 400 && rawStatus <= 599
    ? rawStatus
    : 500;
  const internalMessage = error instanceof Error ? error.message : String(error);
  return {
    status,
    message: status >= 500 ? '内部服务器错误' : internalMessage,
    internalMessage,
    stack: error instanceof Error ? error.stack : undefined,
  };
}

// 全局错误处理中间件
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  const { status, message, internalMessage, stack } = getHttpErrorResponse(err);
  if (status >= 500) {
    console.error(`[HTTP ${status}] ${internalMessage}`, stack);
  } else {
    console.warn(`[HTTP ${status}] ${message}`);
  }
  res.status(status).json({ error: message });
}

// 404 中间件
export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ error: '接口不存在' });
}
