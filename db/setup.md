# PixelReel 开发环境搭建

从零开始搭建 PixelReel 开发环境。

## 前置要求

- Node.js 18+
- MySQL 8.0+
- npm

## 步骤

### 1. 安装 MySQL

如果还没有 MySQL，先安装并确保服务运行。

### 2. 创建数据库

```bash
mysql -u root -p < db/init.sql
```

这会创建 `pixelreel` 数据库（utf8mb4 字符集）。

### 3. 配置环境变量

```bash
cd express-backend
cp .env.example .env
```

编辑 `.env`，至少配置：

- `DATABASE_URL` — MySQL 连接串，格式：`mysql://用户名:密码@localhost:3306/pixelreel`
- `TMDB_API_KEY` — TMDB API 密钥（搜索电影/电视剧需要）

后端默认只监听 `127.0.0.1`，CORS 默认允许本机 `18888` 前端。需要从局域网访问时，再显式设置 `HOST=0.0.0.0` 和对应的 `CORS_ALLOWED_ORIGINS`。

### 4. 安装依赖 & 建表

```bash
cd express-backend
npm install
npx prisma generate
npx prisma db push
```

`prisma db push` 会根据 `prisma/schema.prisma` 自动创建所有表。

### 5. 启动后端

```bash
cd express-backend
npm run dev
```

后端运行在 http://localhost:18889

### 6. 启动前端

```bash
cd frontend
npm install
npm run dev
```

前端运行在 http://localhost:18888，自动代理 `/api` 到后端。

### 7. 运行交付检查

```bash
cd express-backend && npm run check
cd frontend && npm run check
```

后端检查包含 TypeScript 构建和核心回归测试，前端检查包含 TypeScript 与 Vite 生产构建。

## 数据说明

不提供 seed 数据，避免污染真实数据。通过前端搜索功能添加电影/电视剧/游戏记录即可。

## 常见问题

### prisma db push 报连接错误

检查 `.env` 中的 `DATABASE_URL` 格式和 MySQL 是否在运行。

### 端口被占用

后端端口可在 `.env` 的 `PORT` 修改，前端代理目标在 `frontend/vite.config.ts` 中修改。
