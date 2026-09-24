# One image, one process: the API serves its own routes and the built SPA.
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY shared/package.json shared/
COPY api/package.json api/
COPY web/package.json web/
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
# web/package.json is copied because the lockfile describes all three workspaces;
# only shared and api are installed, since the SPA ships pre-built.
COPY shared/package.json shared/
COPY api/package.json api/
COPY web/package.json web/
RUN npm ci --omit=dev --workspace @quiz/shared --workspace @quiz/api --include-workspace-root
COPY --from=build /app/shared/dist shared/dist
COPY --from=build /app/api/dist api/dist
# The SPA ships as static files; app.ts picks them up from web/dist at boot.
COPY --from=build /app/web/dist web/dist
COPY data data
EXPOSE 3000
CMD ["node", "api/dist/index.js"]
