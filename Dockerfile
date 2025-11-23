# Multi-stage Dockerfile for Figure Collector Backend
# Supports base, development, test, builder, and production stages

# ============================================================================
# Base Stage - Common foundation for all stages
# ============================================================================
FROM node:25-alpine AS base

WORKDIR /app

# Update repositories and upgrade OpenSSL for latest security patches (fixes CVE-2025-9230)
# Upgrade npm to latest version to fix cross-spawn 7.0.3 vulnerability (GHSA-3xgq-45jj-v275)
RUN apk update && \
    apk upgrade --no-cache libssl3 libcrypto3 && \
    apk add --no-cache dumb-init && \
    npm install -g npm@latest

# Copy package files
COPY package*.json ./

# ============================================================================
# Development Stage - For local development with hot reload
# ============================================================================
FROM base AS development

# Install all dependencies (including dev dependencies)
RUN npm ci

# Copy source code
COPY . .

# Expose port
EXPOSE 5000

# Use dumb-init and nodemon for development
ENTRYPOINT ["dumb-init", "--"]
CMD ["npm", "run", "dev"]

# ============================================================================
# Test Stage - For running tests
# ============================================================================
FROM base AS test

# Install all dependencies (including dev dependencies for testing)
RUN npm ci

# Copy source code
COPY . .

# Run tests
CMD ["npm", "test"]

# ============================================================================
# Builder Stage - Compiles TypeScript to JavaScript
# ============================================================================
FROM base AS builder

# Install all dependencies (including dev for building)
# Using --ignore-scripts for security to prevent execution of npm scripts
RUN npm ci --ignore-scripts

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# ============================================================================
# Production Stage - Optimized runtime image
# ============================================================================
FROM node:25-alpine AS production

# Build arguments for customization
ARG GITHUB_ORG=rpgoldberg
ARG GITHUB_REPO=fc-backend

# Add labels for better tracking
LABEL org.opencontainers.image.title="Figure Collector Backend"
LABEL org.opencontainers.image.description="Backend API service for Figure Collector"
LABEL org.opencontainers.image.vendor="Figure Collector Services"
LABEL org.opencontainers.image.source="https://github.com/${GITHUB_ORG}/${GITHUB_REPO}"

# Update repositories and upgrade OpenSSL for latest security patches (fixes CVE-2025-9230)
# Upgrade npm to latest version to fix cross-spawn 7.0.3 vulnerability (GHSA-3xgq-45jj-v275)
RUN apk update && \
    apk upgrade --no-cache libssl3 libcrypto3 && \
    npm install -g npm@latest

# Install dumb-init and create non-root user in a single layer
RUN apk add --no-cache dumb-init && \
    addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
# Using --ignore-scripts for security to prevent execution of npm scripts
RUN npm ci --omit=dev --ignore-scripts && \
    npm cache clean --force

# Copy built application from builder
# Files are owned by root:root (read-only for non-root)
COPY --from=builder --chown=root:root /app/dist ./dist

# Create a writable directory for runtime data if needed
RUN mkdir -p /app/data /app/logs && \
    chown nodejs:nodejs /app/data /app/logs && \
    chmod 755 /app/data /app/logs

# Switch to non-root user (nodejs:1001)
USER nodejs

# Expose port
EXPOSE 5000

# Health check using Node.js (not curl)
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "const req = require('http').get('http://localhost:5000/health', { timeout: 5000 }, (res) => { process.exit(res.statusCode === 200 ? 0 : 1); }); req.on('timeout', () => { req.destroy(); process.exit(1); }); req.on('error', () => process.exit(1));"

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start application
CMD ["node", "dist/index.js"]
