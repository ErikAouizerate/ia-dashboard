FROM node:24-alpine AS base
RUN corepack enable
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY api/package.json api/package.json
COPY webapp/package.json webapp/package.json
RUN pnpm install --filter @ia-dashboard/api
RUN chown -R node:node /app

FROM deps AS dev
COPY . .
USER node
CMD ["pnpm", "--filter", "@ia-dashboard/api", "start:dev"]

FROM base AS prod
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm --filter @ia-dashboard/api build
EXPOSE 3000
USER node
CMD ["node", "api/dist/src/main.js"]
