FROM node:22-alpine AS build
WORKDIR /app

COPY package.json ./
RUN npm install

COPY src ./src
COPY tsconfig.json ./

RUN npx tsc

FROM node:22-alpine AS runtime
WORKDIR /app

RUN apk add --no-cache util-linux jq

COPY --from=build /app/dist ./dist
COPY package.json ./
RUN npm install --omit=dev

COPY run.sh /run.sh
RUN chmod +x /run.sh

ENV NODE_ENV=production
CMD ["/run.sh"]
