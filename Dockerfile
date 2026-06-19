FROM node:22-alpine AS build
WORKDIR /repo

COPY package.json pnpm-workspace.yaml ./
COPY shared/package.json shared/package.json
COPY agent/package.json agent/package.json

RUN corepack enable && pnpm install --filter @komdash/agent... --filter @komdash/shared

COPY shared shared
COPY agent agent

RUN pnpm --filter @komdash/shared build && pnpm --filter @komdash/agent build

FROM node:22-alpine AS runtime
WORKDIR /app

RUN apk add --no-cache util-linux

COPY --from=build /repo/agent/dist ./dist
COPY --from=build /repo/agent/node_modules ./node_modules
COPY --from=build /repo/agent/package.json ./package.json
COPY --from=build /repo/shared ./node_modules/@komdash/shared

ENV NODE_ENV=production

CMD ["node", "dist/index.js"]
