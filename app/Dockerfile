FROM node:24.4.1-alpine AS dev-deps

COPY package.json package-lock.json ./
RUN --mount=type=cache,sharing=locked,target=/node/.npm,gid=1000,uid=1000 npm install
USER 1000

FROM node:24.4.1-alpine AS prod-deps

COPY \
  package.json \
  package-lock.json \
  ./

RUN --mount=type=cache,sharing=locked,target=/node/.npm,gid=1000,uid=1000 npm install --production

USER 1000

FROM node:24.4.1-alpine AS build

COPY --from=dev-deps \
  node_modules /node_modules

COPY src /src

RUN --mount=type=bind,source=tsconfig.json,target=/tsconfig.json npx tsc --project tsconfig.json

USER 1000

# Depending on scaling needs, this may be better served by something like nginx
FROM node:24.4.1-alpine AS server 

USER root 
WORKDIR /app


COPY --chown=1000:1000 --from=build \
    dist .
COPY --chown=1000:1000 --from=prod-deps \
  node_modules ./node_modules
COPY --chown=1000:1000 \
  package.json ./

USER 1000
EXPOSE 3000
CMD ["node", "server.js"]
