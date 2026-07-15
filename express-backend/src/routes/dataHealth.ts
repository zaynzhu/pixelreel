import { Router, Request, Response } from 'express';
import {
  DATA_HEALTH_CATEGORIES,
  DATA_HEALTH_ISSUES,
  getDataHealthSummary,
  isDataHealthIssueApplicable,
  listDataHealthIssues,
} from '../services/DataHealthService';
import {
  assertNoQueryParameters,
  parseEnumParameter,
  parsePositiveBigIntParameter,
  parsePositiveIntegerParameter,
  RequestValidationError,
} from './request-validation';

const router = Router();
const ISSUE_PARAMETER_KEYS = new Set(['category', 'issue', 'cursor', 'limit']);

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

export default router;
