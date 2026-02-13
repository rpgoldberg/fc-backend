/**
 * React dev server proxy configuration
 *
 * IMPORTANT: This application REQUIRES a proxy to function correctly.
 * The frontend always makes API requests to relative paths (e.g., /api/version),
 * which must be proxied to the backend service to avoid CORS issues.
 *
 * - Development: This file configures the React dev server proxy
 * - Production: Nginx (or similar) must proxy /api/* to the backend
 */

const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
  // Proxy all /api/* requests to the backend
  app.use(
    '/api',
    createProxyMiddleware({
      target: process.env.REACT_APP_BACKEND_URL || 'http://localhost:5080',
      changeOrigin: true,
      pathRewrite: {
        '^/api': '', // Remove /api prefix when forwarding to backend
      },
      onProxyReq: (proxyReq, req, res) => {
        // Log proxy requests in development
        console.log(`[Proxy] ${req.method} ${req.path} -> ${proxyReq.path}`);
      },
      onError: (err, req, res) => {
        console.error('[Proxy Error]', err.message);
        res.status(500).json({
          error: 'Proxy error',
          message: 'Failed to connect to backend service',
        });
      },
    })
  );
};
