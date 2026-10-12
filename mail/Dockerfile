# worker / mcp 共通の Cloud Run 用イメージ
#   docker build --build-arg APP=worker -t synedge-worker .
#   docker build --build-arg APP=mcp    -t synedge-mcp .
FROM node:22-slim AS build
ARG APP
RUN test -n "$APP" || (echo "--build-arg APP=worker|mcp を指定してください" && exit 1)
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @synedge/${APP} run build
RUN pnpm --filter @synedge/${APP} deploy --legacy --prod /out

FROM node:22-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out /app
USER node
EXPOSE 8080
CMD ["node", "dist/index.js"]
