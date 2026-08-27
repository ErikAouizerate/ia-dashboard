FROM node:24-alpine AS base
RUN corepack enable

FROM base AS dev
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY api/package.json api/package.json
COPY webapp/package.json webapp/package.json
RUN pnpm install --filter @ia-dashboard/webapp
COPY . .
CMD ["pnpm", "--filter", "@ia-dashboard/webapp", "dev"]

FROM base AS prod
WORKDIR /app
COPY --from=dev /app/node_modules ./node_modules
COPY . .
RUN pnpm --filter @ia-dashboard/webapp build
EXPOSE 5173
CMD ["pnpm", "--filter", "@ia-dashboard/webapp", "preview"]