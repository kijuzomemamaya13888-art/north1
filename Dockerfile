# Build stage
FROM node:20-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Runtime stage
FROM node:20-slim
ENV NODE_ENV=production
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY --from=builder /app/dist ./dist
ENV PORT=3000
ENV DB_FILE=/data/app.sqlite
EXPOSE 3000
CMD ["node", "dist/server.js"]