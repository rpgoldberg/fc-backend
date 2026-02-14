# Figure Collector Backend API

Backend API service for the Figure Collector application. Provides endpoints for user authentication, figure management, and acts as the orchestrator for microservices version management. Includes comprehensive test coverage with Jest and Supertest.

## Features

- User authentication (register, login, profile)
- Complete figure management (CRUD operations)
- Search functionality with MongoDB Atlas Search
- Filtering and statistics
- Service version orchestration and aggregation
- Service health monitoring and version reporting
- **Schema v3.0**: Enhanced data models for MFC integration (RoleType, Company, Artist, MFCItem, UserFigure, SearchIndex)

## Technology Stack

- TypeScript
- Node.js/Express
- MongoDB Atlas
- JWT Authentication
- **Testing**: Jest + Supertest + ts-jest

## Version Management Architecture

The backend acts as the central orchestrator for service version reporting:

- **Self-Reporting**: Each service exposes a `/health` endpoint with `{service, version, status}`
- **Version Aggregation**: Backend's `/version` endpoint aggregates health status from all services
- **Unified API**: Single `/version` endpoint provides complete service health and version information
- **Frontend Integration**: Frontend enriches aggregated data with its own version from package.json

## Recent Updates

### Development Server (tsx)
Switched from `ts-node-dev` to `tsx` for faster development server startup:
- **tsx** uses esbuild under the hood for near-instant TypeScript compilation
- Automatic `.env` file loading via `--env-file` flag
- Hot reload with `tsx watch` for seamless development

### SSE Token Support
Auth middleware now supports query parameter tokens for SSE (Server-Sent Events) connections:
- EventSource API cannot set custom headers, requiring token in URL
- Format: `/sync/events/:sessionId?token=<jwt>`
- Falls back to standard `Authorization: Bearer <token>` header when available

## Development

### Environment Setup

**Quick Start:**
```bash
# Auto-generate .env file with secure random secrets
./setup-local-env.sh

# Or manually copy and edit
cp .env.example .env
# Then edit .env and replace placeholder values
```

**Configuration Files:**
- `.env.example` - Template showing required environment variables
- `setup-local-env.sh` - Script to auto-generate .env with random JWT secrets
- `.env` - Your local configuration (gitignored, never commit this!)

See `.env.example` for all configuration options including:
- Local MongoDB (default) vs MongoDB Atlas
- JWT secrets and token expiry settings
- Optional refresh token rotation

### Local Development

```bash
# Install dependencies
npm install

# Set up environment (first time only)
./setup-local-env.sh

# Start MongoDB (if using local MongoDB)
docker run -d -p 27017:27017 --name mongodb mongo:latest

# Start development server (uses tsx for fast startup)
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

### Testing in Development

```bash
# Run tests in watch mode
npm run test:watch

# Test specific functionality
npx jest tests/integration/figures.test.ts --watch

# Check test coverage
npm run test:coverage
```

### Docker

The service uses a multi-stage Dockerfile with the following build targets:

```bash
# Development (with hot reload)
docker build --target development -t backend:dev .
docker run -p 5070:5070 -e PORT=5070 backend:dev

# Test environment
docker build --target test -t backend:test .
docker run backend:test

# Production (default)
docker build -t backend:prod .
docker run -p 5050:5050 -e PORT=5050 backend:prod
```

**Available stages:**
- `base`: Node.js with Alpine Linux and dumb-init
- `development`: Includes devDependencies and nodemon for hot reload
- `test`: Test environment with Jest
- `builder`: Compiles TypeScript to JavaScript
- `production`: Optimized image with only production dependencies (default)

## API Endpoints

**Infrastructure Endpoints** (accessed directly via nginx proxy)
- `GET /version` - Aggregated service health and version information
- `GET /health` - Service health check with version info

**Business Logic APIs** (accessed via `/api` prefix through nginx)
- `/figures` - Figure management endpoints (with `page` and `limit` query parameters only)
- `/auth/*` - Authentication and session management endpoints
- `/figures/scrape-mfc` - MFC scraping proxy endpoint

### Authentication Endpoints

Authentication is managed through dedicated `/auth` endpoints:
- `POST /auth/register` - Register a new user
- `POST /auth/login` - Login and receive access/refresh tokens
- `POST /auth/refresh` - Obtain a new access token using a refresh token
- `POST /auth/logout` - Logout current session
- `POST /auth/logout-all` - Logout from all active sessions
- `GET /auth/sessions` - Retrieve all active sessions for the user

**Note**: All authentication endpoints now return responses in the `data.data` structure

### Admin Endpoints

Admin functionality for system configuration and bootstrap:

- `POST /admin/bootstrap` - Grant admin privileges using bootstrap token
  - Body: `{ email: string, token: string }`
  - Requires: `ADMIN_BOOTSTRAP_TOKEN` environment variable
- `GET /admin/config` - List all system configs (admin only)
- `GET /admin/config/:key` - Get specific config by key (admin only)
- `PUT /admin/config/:key` - Create or update a config (admin only)
  - Body: `{ value: string, type?: 'script'|'markdown'|'json'|'text', description?: string, isPublic?: boolean }`
- `DELETE /admin/config/:key` - Delete a config (admin only)
- `GET /config/:key` - Get a public config (no auth required)

**Config Key Format**: Must be lowercase, start with a letter, and contain only alphanumeric characters and underscores (e.g., `mfc_cookie_script`).

Note: The nginx frontend proxy strips `/api` prefix, so backend endpoints don't include `/api` in their paths.

### Environment Variables

See `.env.example` for complete configuration template. Run `./setup-local-env.sh` to auto-generate.

**Required:**
- `MONGODB_URI`: MongoDB connection string (local: `mongodb://localhost:27017/figure-collector-dev` or Atlas)
- `JWT_SECRET`: Secret for JWT token signing (⚠️ **MUST be at least 32 characters in production**)
- `JWT_REFRESH_SECRET`: Secret for refresh token signing (⚠️ **MUST be at least 32 characters in production**)
- `SCRAPER_SERVICE_URL`: URL to scraper service
  - Local dev: `http://localhost:3080`
  - Docker prod: `http://scraper:3050`
  - Docker Coolify dev: `http://scraper-dev:3090`
  - (Must match service/network name for container DNS resolution)
- `BACKEND_URL`: Public URL of this backend service (used in webhook URLs sent to scraper)
  - Local dev: `http://localhost:5080`
  - Docker prod: `http://backend:5050`
  - Docker Coolify dev: `http://backend:5090`
  - (Must be reachable from the scraper container for sync webhook callbacks)
- `PORT`: Port for backend service (prod: 5050, local dev: 5080)
- `NODE_ENV`: Environment (development/production)

**Optional:**
- `ACCESS_TOKEN_EXPIRY`: Access token expiration time (default: 15m)
- `ROTATE_REFRESH_TOKENS`: Enable refresh token rotation for enhanced security (default: false)
- `ADMIN_BOOTSTRAP_TOKEN`: Secret token for granting admin privileges via `POST /admin/bootstrap`
  - Generate a secure token: `openssl rand -base64 32`
  - After granting admin to your user, the token can be changed or removed
- `ENABLE_ATLAS_SEARCH`: Set to `true` on environments with Atlas Search indexes configured
  - Enables Atlas Search `$search` operator for advanced search features
  - Falls back to regex search when not set or when `TEST_MODE=memory`

**Debug Logging:**
- `DEBUG`: Set to `true` to enable all application loggers (AUTH, SYNC, MAIN, DATABASE, etc.)
- `DEBUG_LEVEL`: Log level threshold — `verbose`, `info`, `warn`, or `error` (default: `info` in development, `error` in production)
- `DEBUG_MODULES`: Comma-separated list of modules to enable (e.g., `AUTH,SYNC`), or `*` for all. Only needed if `DEBUG` is not `true`
- `SERVICE_AUTH_TOKEN_DEBUG`: Show partial tokens in logs for debugging (default: false)

**Security Note:**
- Generate secure secrets using: `openssl rand -base64 32`
- Or run `./setup-local-env.sh` to auto-generate random secrets
- Never commit `.env` files (already in .gitignore)

### Token Management

The authentication system uses a two-token strategy with enhanced security:
- **Access Token**: Short-lived JWT for API access (15 minutes expiry by default)
- **Refresh Token**: Long-lived cryptographically secure token (7 days expiry) stored as HMAC-SHA256 hash in MongoDB

Security Features:
- **Zero Trust Validation**: Every protected request validates user exists in the current database (prevents cross-environment token reuse)
- **Hashed Storage**: Refresh tokens are hashed using HMAC-SHA256 before database storage
- **Secure Generation**: Refresh tokens use cryptographically secure random generation
- **Token Rotation**: Optional refresh token rotation on each use (configurable)
- **Session Tracking**: Device and IP address tracking for all active sessions
- **Revocation**: Individual or bulk session revocation capabilities
- **Error Sanitization**: Production environment returns generic error messages to prevent information leakage

Token Response Structure:
```json
{
  "data": {
    "accessToken": "...",
    "refreshToken": "..."
  }
}
```

## Schema v3.0 Data Models

Schema v3.0 introduces enhanced data models for MFC (MyFigureCollection) integration:

| Model | Purpose | Key Features |
|-------|---------|--------------|
| **RoleType** | Dynamic role registry | Company/Artist/Relation kinds, system seeding |
| **Company** | Manufacturers, distributors | Role-based categorization, MFC ID linking |
| **Artist** | Sculptors, illustrators | Role-based categorization, portfolio linking |
| **MFCItem** | Shared catalog data | Releases, dimensions, community stats |
| **UserFigure** | User-specific data | Collection status, purchase info, ratings |
| **SearchIndex** | Unified search | Cross-entity search, Atlas 3-index limit workaround |

**Automatic Seeding**: System role types (Manufacturer, Sculptor, etc.) are seeded automatically on app startup. This is idempotent and safe to run on every deployment.

**Atlas Search**: See `docs/SCHEMA_V3_INDEX_GUIDE.md` for index configuration and deployment procedures.

## 🧪 Testing

The backend includes extensive test infrastructure with enhanced Docker testing, comprehensive test suites, and robust automation scripts. We now have **597+ tests passing**, covering multiple dimensions of application functionality across multiple test configurations. The enhanced MongoDB Memory Server provides robust, isolated testing capabilities. All tests now pass without any skipped tests, focusing on essential database connection and API functionality.

### Test Coverage

- **Unit Tests**: Models, controllers, middleware, utilities
- **Integration Tests**: API endpoints with database operations
- **Performance Tests**: Database queries and API response times
- **Authentication Tests**: JWT handling, user registration/login
- **Service Health Tests**: Version reporting and health checks
- **Error Handling Tests**: Various failure scenarios

### Test Structure

```
tests/
├── models/               # Schema v3.0 model tests (TDD)
│   ├── RoleType.test.ts  # Role registry with system seeding
│   ├── Company.test.ts   # Company model with role refs
│   ├── Artist.test.ts    # Artist model
│   ├── MFCItem.test.ts   # MFC catalog data
│   ├── UserFigure.test.ts # User collection data
│   └── SearchIndex.test.ts # Unified search index
├── unit/
│   ├── models/           # User, Figure, and RefreshToken model tests
│   ├── controllers/      # Authentication and business logic tests
│   ├── middleware/       # Auth and validation middleware
│   └── utils/           # Utility function tests
├── integration/
│   ├── auth/             # Comprehensive authentication test suite
│   │   ├── login.test.ts           # Login flow tests
│   │   ├── registration.test.ts    # User registration tests
│   │   ├── token-refresh.test.ts   # Token refresh tests
│   │   ├── logout.test.ts          # Logout and session management tests
│   │   └── sessions.test.ts        # Session tracking tests
│   ├── figures.test.ts  # Figure CRUD operations
│   ├── users.test.ts    # User profile management tests
│   └── version.test.ts  # Version management tests
└── performance/
    ├── database.test.ts # Database performance tests
    ├── auth-performance.test.ts # Authentication performance tests
    └── api.test.ts     # API response time tests
```

### Authentication Test Coverage

Enhanced authentication test suite now covers:
- Multiple login scenarios (successful, failed)
- Token generation and validation
- Refresh token lifecycle
- Session management
- Logout mechanisms (single session and all sessions)
- Device and location tracking
- Token revocation and security edge cases

### Running Tests

**WSL Setup Required**: Install Node.js via NVM (see [WSL_TEST_FIX_SOLUTION.md](../WSL_TEST_FIX_SOLUTION.md))

```bash
# Install dependencies
npm install

# Run all tests (memory mode)
npm run test:memory

# Run with coverage report
npm run test:coverage

# Run in watch mode (development)
npm run test:watch

# Run Docker-based test suite
npm run test:docker

# Run specific test suite
npx jest tests/integration/auth.test.ts

# Run performance stress tests
npx jest tests/performance/stress.test.ts

# Run tests matching pattern
npx jest --testNamePattern="user authentication"
```

### Docker Testing Infrastructure

- Comprehensive Docker test containers for isolated testing
- Automated test scripts for containerized environment
- Supports both CI/CD and local development testing modes
- Performance and stress testing via dedicated Docker configurations
- Cross-platform compatibility with WSL and native Linux environments

**Toggleable Test Container (`Dockerfile.test`):**
```bash
# Build test image
docker build -f Dockerfile.test -t backend:test .

# Mode 1: Run tests (default)
docker run backend:test

# Mode 2: Run as service (for integration testing)
docker run -e RUN_SERVER=1 -p 3015:3015 backend:test
```

The test container can switch between running tests or starting the service based on the `RUN_SERVER` environment variable, making it flexible for different testing scenarios.

### Test Configuration

**TypeScript Test Configuration (`tsconfig.test.json`):**
```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "strict": false,           // Relaxed type checking for tests
    "noImplicitAny": false,    // Allow implicit 'any' types
    "strictNullChecks": false, // More flexible null handling
    "skipLibCheck": true,      // Skip type checking of declaration files
    "types": ["jest", "node"]  // Include Jest and Node types
  },
  "include": [
    "src/**/__tests__/**/*",   // Include all test files
    "src/**/__mocks__/**/*"    // Include mock implementations
  ]
}
```

The backend uses Jest with TypeScript support:

- **Framework**: Jest 29.7.0
- **TypeScript**: ts-jest for TypeScript compilation
- **HTTP Testing**: Supertest for API endpoint testing
- **Database**: In-memory MongoDB for isolated testing
- **Coverage**: Configured for >90% code coverage

**Key Testing Improvements:**
- Introduced `tsconfig.test.json` for more flexible test compilation
- Relaxed TypeScript strict mode for easier test writing
- Added comprehensive type configuration for Jest and Node.js
- Improved mock type handling to reduce compilation friction
- Enhanced test file discovery and coverage reporting
- Implemented Docker-based testing infrastructure
- Added comprehensive middleware and configuration tests
- Enhanced controller validation and error handling test coverage
- Introduced performance and stress testing modules
- Improved API route validation testing
- Added database connection and isolation testing
- Implemented enhanced MongoDB Memory Server for robust testing
- Completed SHALLTEAR PROTOCOL: Comprehensive test validation across all scenarios

### Mocking Strategy

- **External Services**: Page Scraper and Version Service APIs mocked
- **Database**: Uses in-memory MongoDB instance
- **JWT**: Mocked JWT tokens for authentication tests
- **Environment**: Test-specific environment variables
- **Validation**: Mocked input validation middleware with test scenarios for edge cases

### Security Enhancements

Implemented comprehensive security improvements:
- **JWT Configuration Validation**: Fails fast if JWT secrets aren't properly configured
- **Minimum Secret Length**: Enforces 32+ character secrets in production environments
- **Refresh Token Hashing**: HMAC-SHA256 hashing for all stored refresh tokens
- **Error Message Sanitization**: Generic error messages in production to prevent information disclosure
- **Enhanced Joi-based validation middleware**: Input validation and sanitization
- **Input sanitization**: Protection against nested object attacks
- **Proper HTTP status codes**: Consistent error handling across all endpoints
- **Session Management**: Comprehensive session tracking and revocation

### Test Data

Tests use consistent fixtures:

```javascript
// Example test user
const testUser = {
  email: 'test@example.com',
  password: 'testpassword123',
  username: 'testuser'
};

// Example test figure
const testFigure = {
  name: 'Test Figure',
  manufacturer: 'Test Company',
  series: 'Test Series',
  scale: '1/8',
  price: 15000
};
```

### CI/CD Integration

```bash
# CI test command (no watch mode)
NODE_ENV=test npm test -- --watchAll=false

# Coverage for CI reporting
NODE_ENV=test npm test -- --coverage --watchAll=false
```
