# 秘密情報は .dockerignore でビルドの入力から除外している。
#   ビルド: docker build --build-arg NEXT_PUBLIC_APP_ID=<アプリID> -t chatbot .
#   起動:   docker run -p 3000:3000 -e DIFY_API_KEY=<APIキー> chatbot
# DIFY_API_KEY はイメージに焼き込まず、起動時の環境変数で渡す。

FROM node:24.22.1-alpine AS base
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS builder
# NEXT_PUBLIC_* はビルド時にブラウザ向けの JavaScript へ埋め込まれる（秘密ではない値）
ARG NEXT_PUBLIC_APP_ID=
ARG NEXT_PUBLIC_API_URL=https://api.dify.ai/v1
ENV NEXT_PUBLIC_APP_ID=$NEXT_PUBLIC_APP_ID \
    NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

FROM node:24.22.1-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
# root ではなく、公式イメージの一般ユーザー（node, uid 1000）で動かす
USER node
EXPOSE 3000
CMD ["node", "server.js"]
