FROM node:25-bookworm-slim AS build

ENV PNPM_HOME="/pnpm"
ENV PATH="${PNPM_HOME}:${PATH}"

RUN npm install -g --force corepack@latest && corepack enable && corepack prepare pnpm@9.15.2 --activate

WORKDIR /workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/backend/package.json packages/backend/package.json
COPY packages/frontend/package.json packages/frontend/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN pnpm install --frozen-lockfile

COPY . .

RUN find . -name '*.tsbuildinfo' -delete
RUN pnpm run build
RUN pnpm --filter @signalform/backend deploy --prod /app
RUN mkdir -p /app/frontend && cp -r packages/frontend/dist /app/frontend/dist

FROM node:25-bookworm-slim AS runtime

ENV NODE_ENV=production
ENV PORT=3001
ENV SIGNALFORM_FRONTEND_DIST_PATH=/app/frontend/dist

WORKDIR /app/config

RUN mkdir -p /app/config && chown -R node:node /app

COPY --from=build --chown=node:node /app /app

EXPOSE 3001

VOLUME ["/app/config"]

USER node

CMD ["node", "/app/dist/index.js"]
