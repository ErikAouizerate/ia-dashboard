FROM node:24-alpine AS base
RUN corepack enable
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:5173/ || exit 1

FROM base AS dev
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY api/package.json api/package.json
COPY webapp/package.json webapp/package.json
RUN pnpm install --filter @ia-dashboard/webapp
RUN chown -R node:node /app
COPY . .
USER node
CMD ["pnpm", "--filter", "@ia-dashboard/webapp", "dev"]

FROM base AS prod
WORKDIR /app
COPY --from=dev /app/node_modules ./node_modules
COPY . .
RUN pnpm --filter @ia-dashboard/webapp build
EXPOSE 5173
USER node
CMD ["pnpm", "--filter", "@ia-dashboard/webapp", "preview"]
