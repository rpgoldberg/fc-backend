#!/bin/bash
# E2E Test Runner - Spins up all services and runs cross-service tests
# Usage: ./run-e2e-tests.sh [--no-build] [--keep-running]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

NO_BUILD=false
KEEP_RUNNING=false

# Parse arguments
for arg in "$@"; do
  case $arg in
    --no-build)
      NO_BUILD=true
      shift
      ;;
    --keep-running)
      KEEP_RUNNING=true
      shift
      ;;
    --help)
      echo "E2E Test Runner"
      echo ""
      echo "Usage: ./run-e2e-tests.sh [options]"
      echo ""
      echo "Options:"
      echo "  --no-build      Skip rebuilding images (faster if no code changes)"
      echo "  --keep-running  Keep services running after tests (for debugging)"
      echo "  --help          Show this help message"
      exit 0
      ;;
  esac
done

echo "🚀 Starting E2E Test Environment..."
echo ""

# Clean up any existing containers
echo "🧹 Cleaning up existing containers..."
docker-compose -f docker-compose.e2e.yml down -v 2>/dev/null || true

# Build and start
if [ "$NO_BUILD" = true ]; then
  echo "📦 Starting services (no rebuild)..."
  docker-compose -f docker-compose.e2e.yml up -d mongodb backend scraper frontend
else
  echo "🔨 Building and starting services..."
  docker-compose -f docker-compose.e2e.yml up -d --build mongodb backend scraper frontend
fi

# Wait for services to be healthy
echo ""
echo "⏳ Waiting for services to be healthy..."
echo ""

MAX_WAIT=120
WAITED=0

while [ $WAITED -lt $MAX_WAIT ]; do
  BACKEND_HEALTHY=$(docker inspect --format='{{.State.Health.Status}}' e2e-backend 2>/dev/null || echo "not_found")
  SCRAPER_HEALTHY=$(docker inspect --format='{{.State.Health.Status}}' e2e-scraper 2>/dev/null || echo "not_found")

  if [ "$BACKEND_HEALTHY" = "healthy" ] && [ "$SCRAPER_HEALTHY" = "healthy" ]; then
    echo "✅ All services healthy!"
    break
  fi

  echo "   Backend: $BACKEND_HEALTHY | Scraper: $SCRAPER_HEALTHY (waited ${WAITED}s)"
  sleep 5
  WAITED=$((WAITED + 5))
done

if [ $WAITED -ge $MAX_WAIT ]; then
  echo "❌ Services failed to become healthy within ${MAX_WAIT}s"
  echo ""
  echo "📋 Service logs:"
  docker-compose -f docker-compose.e2e.yml logs --tail=50
  docker-compose -f docker-compose.e2e.yml down -v
  exit 1
fi

echo ""
echo "🧪 Running E2E tests..."
echo ""

# Run tests
TEST_EXIT_CODE=0
docker-compose -f docker-compose.e2e.yml run --rm e2e-tests || TEST_EXIT_CODE=$?

echo ""

# Cleanup or keep running
if [ "$KEEP_RUNNING" = true ]; then
  echo "🔧 Services kept running for debugging."
  echo ""
  echo "   Backend:  http://localhost:5055"
  echo "   Frontend: http://localhost:5056"
  echo "   Scraper:  http://localhost:3005"
  echo "   MongoDB:  localhost:27018"
  echo ""
  echo "   To stop: docker-compose -f docker-compose.e2e.yml down -v"
else
  echo "🧹 Cleaning up..."
  docker-compose -f docker-compose.e2e.yml down -v
fi

if [ $TEST_EXIT_CODE -eq 0 ]; then
  echo ""
  echo "✅ E2E tests passed!"
else
  echo ""
  echo "❌ E2E tests failed with exit code $TEST_EXIT_CODE"
fi

exit $TEST_EXIT_CODE
