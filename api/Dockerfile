FROM node:24-alpine AS base
RUN corepack enable

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY api/package.json api/package.json
COPY webapp/package.json webapp/package.json
RUN pnpm install --filter @ia-dashboard/api

FROM deps AS dev
COPY . .
CMD ["pnpm", "--filter", "@ia-dashboard/api", "start:dev"]

FROM base AS prod
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm --filter @ia-dashboard/api build
EXPOSE 3000
CMD ["node", "api/dist/src/main.js"]