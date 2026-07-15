import { Router, Request, Response } from 'express';
import {
  DATA_HEALTH_CATEGORIES,
  DATA_HEALTH_ISSUES,
  getDataHealthSummary,
  isDataHealthIssueApplicable,
  listDataHealthIssues,
} from '../services/DataHealthService';
import {
  getDataHealthRepairUnavailableReason,
  isDataHealthRepairSupported,
  startDataHealthRepairTask,
} from '../services/DataHealthRepairService';
import {
  listDuplicateGroups,
  restoreDuplicateGroupReview,
  reviewDuplicateGroup,
} from '../services/DuplicateDetectionService';
import {
  assertEmptyRequestBody,
  assertNoQueryParameters,
  parseBoundedStringParameter,
  parseEnumParameter,
  parsePositiveBigIntParameter,
  parsePositiveIntegerParameter,
  RequestValidationError,
} from './request-validation';

const router = Router();
const ISSUE_PARAMETER_KEYS = new Set(['category', 'issue', 'cursor', 'limit']);
const REPAIR_BODY_KEYS = new Set(['category', 'issue', 'limit']);
const DUPLICATE_PARAMETER_KEYS = new Set(['category', 'cursor', 'limit', 'review']);
const DUPLICATE_REVIEW_BODY_KEYS = new Set(['category', 'groupKey']);

export function parseDataHealthIssueParameters(query: Record<string, unknown>) {
  const unknownKey = Object.keys(query).find(key => !ISSUE_PARAMETER_KEYS.has(key));
  if (unknownKey) throw new RequestValidationError(`未知参数: ${unknownKey}`);

  const category = parseEnumParameter(query.category, 'category', DATA_HEALTH_CATEGORIES, true)!;
  const issue = parseEnumParameter(query.issue, 'issue', DATA_HEALTH_ISSUES, true)!;
  if (!isDataHealthIssueApplicable(category, issue)) {
    throw new RequestValidationError(`issue ${issue} 不适用于 ${category}`);
  }
  return {
    category,
    issue,
    cursor: parsePositiveBigIntParameter(query.cursor, 'cursor'),
    limit: parsePositiveIntegerParameter(query.limit, 'limit', 50, 100),
  };
}

export function parseDataHealthRepairBody(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new RequestValidationError('请求体必须是对象');
  }
  const body = value as Record<string, unknown>;
  const unknownKey = Object.keys(body).find(key => !REPAIR_BODY_KEYS.has(key));
  if (unknownKey) throw new RequestValidationError(`未知字段: ${unknownKey}`);
  const category = parseEnumParameter(body.category, 'category', DATA_HEALTH_CATEGORIES, true)!;
  const issue = parseEnumParameter(body.issue, 'issue', DATA_HEALTH_ISSUES, true)!;
  const limit = body.limit == null ? 50 : body.limit;
  if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1 || limit > 50) {
    throw new RequestValidationError('limit 必须是 1 到 50 之间的整数');
  }
  if (!isDataHealthRepairSupported(category, issue)) {
    throw new RequestValidationError('该问题需要人工核对，暂不支持自动修复');
  }
  return { category, issue, limit };
}

export function parseDuplicateListParameters(query: Record<string, unknown>) {
  const unknownKey = Object.keys(query).find(key => !DUPLICATE_PARAMETER_KEYS.has(key));
  if (unknownKey) throw new RequestValidationError(`未知参数: ${unknownKey}`);
  return {
    category: parseEnumParameter(query.category, 'category', DATA_HEALTH_CATEGORIES, true)!,
    cursor: parsePositiveIntegerParameter(query.cursor, 'cursor', 0, 1_000_000),
    limit: parsePositiveIntegerParameter(query.limit, 'limit', 20, 50),
    review: parseEnumParameter(query.review, 'review', ['unreviewed', 'reviewed'] as const) ?? 'unreviewed',
  };
}

export function parseDuplicateReviewBody(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new RequestValidationError('请求体必须是对象');
  }
  const body = value as Record<string, unknown>;
  const unknownKey = Object.keys(body).find(key => !DUPLICATE_REVIEW_BODY_KEYS.has(key));
  if (unknownKey) throw new RequestValidationError(`未知字段: ${unknownKey}`);
  return {
    category: parseEnumParameter(body.category, 'category', DATA_HEALTH_CATEGORIES, true)!,
    groupKey: parseBoundedStringParameter(body.groupKey, 'groupKey', 80, true)!,
  };
}

router.get('/summary', async (req: Request, res: Response) => {
  assertNoQueryParameters(req.query);
  res.json(await getDataHealthSummary());
});

router.get('/issues', async (req: Request, res: Response) => {
  const parameters = parseDataHealthIssueParameters(req.query);
  res.json(await listDataHealthIssues(
    parameters.category,
    parameters.issue,
    parameters.limit,
    parameters.cursor,
  ));
});

router.get('/duplicates', async (req: Request, res: Response) => {
  const parameters = parseDuplicateListParameters(req.query);
  res.json(await listDuplicateGroups(
    parameters.category,
    parameters.limit,
    parameters.cursor,
    parameters.review,
  ));
});

router.post('/duplicates/review', async (req: Request, res: Response) => {
  assertNoQueryParameters(req.query);
  const parameters = parseDuplicateReviewBody(req.body);
  res.json(await reviewDuplicateGroup(parameters.category, parameters.groupKey));
});

router.delete('/duplicates/review/:id', async (req: Request, res: Response) => {
  assertNoQueryParameters(req.query);
  assertEmptyRequestBody(req.body);
  const id = parsePositiveBigIntParameter(req.params.id, 'id', true)!;
  await restoreDuplicateGroupReview(id);
  res.status(204).end();
});

router.post('/repair', (req: Request, res: Response) => {
  assertNoQueryParameters(req.query);
  const parameters = parseDataHealthRepairBody(req.body);
  const unavailableReason = getDataHealthRepairUnavailableReason(parameters.category, parameters.issue);
  if (unavailableReason) throw new RequestValidationError(unavailableReason);
  const task = startDataHealthRepairTask(parameters.category, parameters.issue, parameters.limit);
  res.json({ taskId: task.taskId, status: task.status, type: task.type, label: task.label });
});

export default router;
