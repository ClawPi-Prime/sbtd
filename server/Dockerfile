# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

COPY server/package.json ./
RUN npm install

COPY server/src/ ./src/
COPY server/tsconfig.json ./

RUN npm run build

# Stage 2: Run
FROM node:20-alpine

WORKDIR /app

COPY --from=builder /app/package.json ./
COPY --from=builder /app/dist/ ./dist/

RUN npm install --production

EXPOSE 2567

ENV NODE_ENV=production
ENV PORT=2567

CMD ["node", "dist/index.js"]
