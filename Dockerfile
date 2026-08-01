FROM node:20.19.2-alpine

WORKDIR /app

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json tsconfig.base.json vitest.config.ts ./
COPY packages/core/package.json packages/core/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/indexer/package.json packages/indexer/package.json

RUN pnpm install --frozen-lockfile

COPY packages ./packages
COPY spec ./spec

CMD ["pnpm", "test"]
