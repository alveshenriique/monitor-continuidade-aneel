FROM node:24-alpine AS build
WORKDIR /app/api
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npm run build

FROM node:24-alpine
WORKDIR /app/api
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/api/dist ./dist
EXPOSE 3000
CMD ["node", "dist/main.js"]
