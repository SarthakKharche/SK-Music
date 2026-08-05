FROM node:18-alpine

# Install Python3 and ffmpeg (required for yt-dlp)
RUN apk add --no-cache python3 ffmpeg

WORKDIR /app

# Copy root & server package definitions for monorepo resolution
COPY package*.json ./
COPY server/package*.json ./server/

# Install backend dependencies
RUN npm install --workspace=server --omit=dev

# Copy server code
COPY server/ ./server/

# Build TypeScript to JavaScript
WORKDIR /app/server
RUN npm run build

# Cloud Run injects the PORT environment variable dynamically (defaults to 8080)
ENV PORT=8080
EXPOSE 8080

CMD ["node", "dist/index.js"]
