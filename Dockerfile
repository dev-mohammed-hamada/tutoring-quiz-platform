# The web workspace joins this build in Task 14; until then the image serves the API only.
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY shared/package.json shared/
COPY api/package.json api/
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
COPY shared/package.json shared/
COPY api/package.json api/
RUN npm ci --omit=dev
COPY --from=build /app/shared/dist shared/dist
COPY --from=build /app/api/dist api/dist
EXPOSE 3000
CMD ["node", "api/dist/index.js"]
