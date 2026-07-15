import { Request, Response, NextFunction } from 'express';

function getPrismaErrorResponse(error: unknown) {
  if (!(error instanceof Error) || error.name !== 'PrismaClientKnownRequestError') return null;
  const code = (error as Error & { code?: unknown }).code;
  if (code === 'P2025') return { status: 404, message: '记录不存在' };
  if (code === 'P2002') return { status: 409, message: '记录已存在' };
  return null;
}

export function getHttpErrorResponse(error: unknown) {
  const rawStatus = typeof error === 'object' && error !== null
    ? Number((error as { status?: unknown }).status)
    : NaN;
  const hasValidStatus = Number.isInteger(rawStatus) && rawStatus >= 400 && rawStatus <= 599;
  const prismaResponse = hasValidStatus ? null : getPrismaErrorResponse(error);
  const status = hasValidStatus ? rawStatus : prismaResponse?.status ?? 500;
  const internalMessage = error instanceof Error ? error.message : String(error);
  return {
    status,
    message: status >= 500 ? '内部服务器错误' : prismaResponse?.message ?? internalMessage,
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
