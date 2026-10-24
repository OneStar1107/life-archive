# syntax=docker/dockerfile:1
# ══════════════════════════════════════════════════════════════
# 人生档案 · 冰川记忆 —— 后端生产镜像
# 多阶段构建：builder 装依赖编译，runner 只带产物
# ══════════════════════════════════════════════════════════════

# ── 阶段 1：依赖 ──────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
COPY package.json pnpm-lock.yaml* ./
# 生产依赖（--prod 跳过 devDependencies）
RUN pnpm install --frozen-lockfile --prod

# ── 阶段 2：构建 ──────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile
COPY tsconfig.json nest-cli.json ./
COPY prisma ./prisma
RUN pnpm prisma generate
COPY src ./src
RUN pnpm build
# 把生产依赖搬过来，避免二次安装
RUN pnpm deploy --filter=. --prod /prod

# ── 阶段 3：运行 ──────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV TZ=Asia/Shanghai

# 非 root 运行
RUN addgroup -g 1001 -S nodejs && adduser -S nestjs -u 1001

# openssl：Prisma 查询引擎需要
RUN apk add --no-cache openssl

COPY --from=builder --chown=nestjs:nodejs /prod/node_modules ./node_modules
COPY --from=builder --chown=nestjs:nodejs /app/dist ./dist
COPY --from=builder --chown=nestjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nestjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nestjs:nodejs /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY --chown=nestjs:nodejs package.json ./

USER nestjs

EXPOSE 3000

# 优雅停机：给 Nest enableShutdownHooks 留出时间
STOPSIGNAL SIGTERM

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||3000)+'/health/live',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

# ★ 产物路径是 dist/src/main.js 而不是 dist/main.js：
#   tsconfig 的 include 同时覆盖 src/、prisma/、test/、scripts/，
#   所以 outDir 下会保留这些顶层目录，main 的相对路径带 src/ 前缀。
#   与 package.json 的 start:prod 保持一致。
CMD ["node", "dist/src/main.js"]
