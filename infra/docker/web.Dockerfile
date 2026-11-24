# Next.js frontend image (standalone server behind the reverse proxy).
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc* ./
COPY apps/web/package.json apps/web/
COPY packages/ packages/
RUN pnpm install --frozen-lockfile
COPY apps/web/ apps/web/
ARG NEXT_PUBLIC_BUILD_ID
ENV NEXT_PUBLIC_BUILD_ID=${NEXT_PUBLIC_BUILD_ID} NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter web build

FROM node:22-alpine
RUN corepack enable && adduser -D -u 10001 app
WORKDIR /repo
COPY --from=build --chown=app:app /repo /repo
USER app
ENV NODE_ENV=production PORT=3000
EXPOSE 3000
CMD ["pnpm", "--filter", "web", "start"]
