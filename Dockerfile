FROM node:22-alpine AS builder

WORKDIR /app

# Copia manifestos de dependência do api-gateway
COPY services/api-gateway/package*.json ./
RUN npm ci --no-audit --no-fund

# Copia código-fonte e compila TypeScript
COPY services/api-gateway/tsconfig.json ./
COPY services/api-gateway/src ./src
RUN npm run build

FROM node:22-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY services/api-gateway/package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund

COPY --from=builder /app/dist ./dist

EXPOSE 3000

CMD ["node", "dist/server.js"]
