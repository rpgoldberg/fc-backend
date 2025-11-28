# Debug Logging Guide

## Overview
All Figure Collector services include production-safe debug logging that can be enabled via environment variables without code changes or rebuilds.

## Environment Variables

### Basic Debug Control
- `DEBUG=*` - Enable all debug logs
- `DEBUG=backend:*` - All backend debug logs
- `DEBUG=frontend:*` - All frontend debug logs
- `DEBUG=scraper:*` - All scraper debug logs
- `DEBUG=version:*` - All version-manager debug logs

### Service-Specific Namespaces

#### Backend
- `DEBUG=backend:auth` - Authentication and JWT operations
- `DEBUG=backend:registration` - Service registration with Version-Manager
- `DEBUG=backend:api` - API request/response logging
- `DEBUG=backend:db` - Database operations

#### Frontend
- `DEBUG=frontend:auth` - Authentication flow
- `DEBUG=frontend:registration` - Frontend registration
- `DEBUG=frontend:api` - API calls to backend

#### Page-Scraper
- `DEBUG=scraper:mfc` - MFC scraping operations
- `DEBUG=scraper:browser` - Puppeteer browser operations
- `DEBUG=scraper:registration` - Service registration
- `DEBUG=scraper:pool` - Browser pool management

#### Version-Manager
- `DEBUG=version:registry` - Service registry operations
- `DEBUG=version:compatibility` - Compatibility checking
- `DEBUG=version:auth` - Authentication validation

### Security Options
- `SERVICE_AUTH_TOKEN_DEBUG=true` - Show partial tokens (first 8 and last 4 chars) instead of [REDACTED]

## Enabling in Different Environments

### Local Development
```bash
# Single service
DEBUG=backend:* npm start

# Multiple namespaces
DEBUG=backend:auth,backend:api npm start

# All services
DEBUG=* npm start
```

### Docker Compose
Update your `docker-compose.yml`:

```yaml
services:
  backend:
    image: fc-backend:latest
    environment:
      - DEBUG=backend:*
      - SERVICE_AUTH_TOKEN_DEBUG=true
      # ... other env vars

  frontend:
    image: fc-frontend:latest
    environment:
      - DEBUG=frontend:auth,frontend:api
      # ... other env vars
```

### Docker Run
```bash
docker run -e DEBUG=backend:* -e SERVICE_AUTH_TOKEN_DEBUG=true fc-backend
```

### Kubernetes/Helm
In your `values.yaml` or deployment manifest:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: backend
spec:
  template:
    spec:
      containers:
      - name: backend
        env:
        - name: DEBUG
          value: "backend:auth,backend:api"
        - name: SERVICE_AUTH_TOKEN_DEBUG
          value: "true"
```

### Coolify Configuration

In Coolify, you can enable debug logging through the environment variables section:

1. **Via Coolify UI**:
   - Navigate to your application
   - Go to "Environment Variables" tab
   - Add the following variables:
     ```
     DEBUG=backend:*
     SERVICE_AUTH_TOKEN_DEBUG=true
     ```

2. **Via Docker Compose in Coolify**:
   If using Docker Compose deployment in Coolify, update your compose file:
   ```yaml
   services:
     backend:
       environment:
         DEBUG: ${DEBUG:-}
         SERVICE_AUTH_TOKEN_DEBUG: ${SERVICE_AUTH_TOKEN_DEBUG:-false}
   ```

3. **Via Dockerfile (Build Args)**:
   ```dockerfile
   ARG DEBUG
   ENV DEBUG=${DEBUG:-}
   ARG SERVICE_AUTH_TOKEN_DEBUG
   ENV SERVICE_AUTH_TOKEN_DEBUG=${SERVICE_AUTH_TOKEN_DEBUG:-false}
   ```

4. **Dynamic Toggle without Rebuild**:
   Since these are environment variables, you can change them in Coolify and restart the container without rebuilding:
   - Update environment variable in Coolify UI
   - Click "Redeploy" (uses existing image)
   - Debug logs will be enabled immediately

### Production Debugging

For production debugging, enable specific namespaces only:

```yaml
# Enable only auth debugging in production
DEBUG=backend:auth,frontend:auth

# Enable registration debugging across services
DEBUG=backend:registration,scraper:registration,version:registry

# Debug service communication issues
DEBUG=backend:api,version:compatibility
```

## Security Considerations

1. **Never log full tokens**: Even with `SERVICE_AUTH_TOKEN_DEBUG=true`, only partial tokens are shown
2. **Sensitive data is sanitized**: Fields like `password`, `secret`, `token`, `key` are automatically redacted
3. **Production use**: Use specific namespaces rather than `DEBUG=*` in production
4. **Log rotation**: Ensure your logging infrastructure handles increased log volume

## Common Debugging Scenarios

### Authentication Issues
```bash
DEBUG=backend:auth,frontend:auth SERVICE_AUTH_TOKEN_DEBUG=true
```

### Service Registration Problems
```bash
DEBUG=backend:registration,scraper:registration,version:registry SERVICE_AUTH_TOKEN_DEBUG=true
```

### API Communication Errors
```bash
DEBUG=backend:api,frontend:api
```

### Database Issues
```bash
DEBUG=backend:db
```

### Browser/Scraping Problems
```bash
DEBUG=scraper:browser,scraper:mfc
```

### Full Debug (Development Only)
```bash
DEBUG=* SERVICE_AUTH_TOKEN_DEBUG=true
```

## Log Output Format

Debug logs follow this format:
```
[2025-09-16T10:30:00.000Z] [DEBUG] [namespace] Message {
  "data": "structured data if provided"
}
```

Example:
```
[2025-09-16T10:30:00.000Z] [DEBUG] [backend:auth] JWT token validated {
  "userId": "123",
  "token": "eyJhbGci...last4",
  "expiresIn": 900
}
```

## Disabling Debug Logs

To disable debug logging:
1. Remove the `DEBUG` environment variable
2. Or set `DEBUG=` (empty string)
3. Restart the container/service

## Performance Impact

Debug logging has minimal performance impact:
- Namespace checking is done once at startup
- Disabled namespaces have near-zero overhead
- Enabled logs add ~1-2ms per log statement
- Recommended to use specific namespaces in production rather than wildcards