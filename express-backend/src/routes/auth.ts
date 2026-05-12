import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';

const router = Router();

// 登录接口：简单的单用户验证
router.post('/login', (req: Request, res: Response) => {
  const { username, password } = req.body;
  if (username !== config.jwt.username || password !== config.jwt.password) {
    res.status(401).json({ error: '用户名或密码错误' });
    return;
  }
  const token = jwt.sign({ username }, config.jwt.secret, { expiresIn: '7d' });
  res.json({ token });
});

export default router;