import { Server as SocketServer, Socket } from 'socket.io';
import { Server as HttpServer } from 'http';
import jwt from 'jsonwebtoken';
import { createLogger } from '../utils/logger';

const logger = createLogger('WEBSOCKET');

interface JwtPayload {
  id: string;
}

let io: SocketServer | null = null;

/**
 * Initialize Socket.IO WebSocket server on the given HTTP server.
 * Provides real-time event delivery for sync progress, price alerts,
 * and collection changes alongside the existing SSE implementation.
 */
export function initializeWebSocket(httpServer: HttpServer): SocketServer {
  const allowedOrigins = process.env.CORS_ALLOWED_ORIGINS?.split(',') || [
    'http://localhost:5051',
    'http://localhost:5081',
    'https://figurecollecting.com',
  ];

  io = new SocketServer(httpServer, {
    cors: {
      origin: allowedOrigins,
      credentials: true,
    },
    path: '/ws',
    pingInterval: 25000,
    pingTimeout: 20000,
  });

  // JWT authentication middleware
  io.use((socket, next) => {
    const token =
      socket.handshake.auth?.token || (socket.handshake.query?.token as string | undefined);

    if (!token) {
      return next(new Error('Authentication required'));
    }

    try {
      const secret = process.env.JWT_SECRET;
      if (!secret) {
        return next(new Error('Server configuration error'));
      }
      const decoded = jwt.verify(token, secret) as JwtPayload;
      socket.data.userId = decoded.id;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const userId: string = socket.data.userId;

    // Join user's personal room for collection and price events
    socket.join(`user:${userId}`);

    logger.info(`User ${userId} connected (${socket.id})`);

    // Sync room subscription
    socket.on('sync:subscribe', (sessionId: string) => {
      if (typeof sessionId === 'string' && sessionId.length > 0 && sessionId.length <= 128) {
        socket.join(`sync:${sessionId}`);
      }
    });

    socket.on('sync:unsubscribe', (sessionId: string) => {
      if (typeof sessionId === 'string' && sessionId.length > 0) {
        socket.leave(`sync:${sessionId}`);
      }
    });

    // Price tracking room
    socket.on('prices:subscribe', () => {
      socket.join(`prices:${userId}`);
    });

    socket.on('prices:unsubscribe', () => {
      socket.leave(`prices:${userId}`);
    });

    socket.on('disconnect', () => {
      logger.info(`User ${userId} disconnected (${socket.id})`);
    });
  });

  logger.info('WebSocket server initialized');
  return io;
}

/**
 * Returns the Socket.IO server instance, or null if not yet initialized.
 */
export function getIO(): SocketServer | null {
  return io;
}

/**
 * Reset the IO instance (for testing only).
 */
export function resetIO(): void {
  io = null;
}

// ── Emit helpers ─────────────────────────────────────────────────────

/** Emit an event to a specific user's personal room. */
export function emitToUser(userId: string, event: string, data: unknown): void {
  io?.to(`user:${userId}`).emit(event, data);
}

/** Emit a sync-progress event to everyone subscribed to a sync session. */
export function emitSyncEvent(sessionId: string, event: string, data: unknown): void {
  io?.to(`sync:${sessionId}`).emit(event, data);
}

/** Emit a price alert to a specific user's price-tracking room. */
export function emitPriceAlert(userId: string, data: unknown): void {
  io?.to(`prices:${userId}`).emit('price:alert', data);
}

/** Emit a collection change notification to the user's personal room. */
export function emitCollectionUpdate(userId: string, data: unknown): void {
  io?.to(`user:${userId}`).emit('collection:update', data);
}
