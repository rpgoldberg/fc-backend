import { createServer, Server as HttpServer } from 'http';
import express from 'express';
import jwt from 'jsonwebtoken';
import { Server as SocketServer } from 'socket.io';
import { io as ioc, Socket as ClientSocket } from 'socket.io-client';
import {
  initializeWebSocket,
  getIO,
  resetIO,
  emitToUser,
  emitSyncEvent,
  emitPriceAlert,
  emitCollectionUpdate,
} from '../../src/services/websocketService';

// Use a consistent secret for all tests
const JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long';

function generateToken(userId: string): string {
  return jwt.sign({ id: userId }, JWT_SECRET, { expiresIn: '1h' });
}

describe('WebSocket Service', () => {
  let httpServer: HttpServer;
  let ioServer: SocketServer;
  let port: number;

  beforeAll((done) => {
    process.env.JWT_SECRET = JWT_SECRET;
    const app = express();
    httpServer = createServer(app);
    ioServer = initializeWebSocket(httpServer);
    httpServer.listen(0, () => {
      const addr = httpServer.address();
      port = typeof addr === 'object' && addr !== null ? addr.port : 0;
      done();
    });
  });

  afterAll((done) => {
    ioServer.close();
    httpServer.close(() => {
      resetIO();
      done();
    });
  });

  function connectClient(token: string): ClientSocket {
    return ioc(`http://localhost:${port}`, {
      path: '/ws',
      auth: { token },
      transports: ['websocket'],
      forceNew: true,
    });
  }

  describe('initializeWebSocket', () => {
    it('should return a SocketServer instance', () => {
      expect(ioServer).toBeInstanceOf(SocketServer);
    });

    it('should make getIO() return the server instance', () => {
      expect(getIO()).toBe(ioServer);
    });
  });

  describe('authentication', () => {
    it('should accept connection with valid JWT token', (done) => {
      const token = generateToken('user-auth-valid');
      const client = connectClient(token);

      client.on('connect', () => {
        expect(client.connected).toBe(true);
        client.disconnect();
        done();
      });

      client.on('connect_error', (err) => {
        client.disconnect();
        done(new Error(`Should not error: ${err.message}`));
      });
    });

    it('should reject connection without token', (done) => {
      const client = ioc(`http://localhost:${port}`, {
        path: '/ws',
        transports: ['websocket'],
        forceNew: true,
      });

      client.on('connect', () => {
        client.disconnect();
        done(new Error('Should not have connected'));
      });

      client.on('connect_error', (err) => {
        expect(err.message).toContain('Authentication required');
        client.disconnect();
        done();
      });
    });

    it('should reject connection with invalid token', (done) => {
      const client = connectClient('invalid-jwt-token');

      client.on('connect', () => {
        client.disconnect();
        done(new Error('Should not have connected'));
      });

      client.on('connect_error', (err) => {
        expect(err.message).toContain('Invalid token');
        client.disconnect();
        done();
      });
    });

    it('should accept token passed as query parameter', (done) => {
      const userId = 'user-query-token';
      const token = generateToken(userId);

      const client = ioc(`http://localhost:${port}`, {
        path: '/ws',
        query: { token },
        transports: ['websocket'],
        forceNew: true,
      });

      client.on('connect', () => {
        expect(client.connected).toBe(true);
        // Verify user room works with query-param auth
        emitToUser(userId, 'test:query', { ok: true });
      });

      client.on('test:query', (data) => {
        expect(data).toEqual({ ok: true });
        client.disconnect();
        done();
      });

      client.on('connect_error', (err) => {
        client.disconnect();
        done(new Error(`Should not error: ${err.message}`));
      });
    });
  });

  describe('room management', () => {
    it('should auto-join user personal room on connect', (done) => {
      const userId = 'user-room-autojoin';
      const token = generateToken(userId);
      const client = connectClient(token);

      client.on('connect', () => {
        emitToUser(userId, 'test:ping', { message: 'hello' });
      });

      client.on('test:ping', (data) => {
        expect(data).toEqual({ message: 'hello' });
        client.disconnect();
        done();
      });
    });

    it('should join and leave sync rooms', (done) => {
      const userId = 'user-sync-rooms';
      const token = generateToken(userId);
      const client = connectClient(token);
      const sessionId = 'sync-session-123';

      client.on('connect', () => {
        client.emit('sync:subscribe', sessionId);

        setTimeout(() => {
          emitSyncEvent(sessionId, 'item-update', { mfcId: '100', status: 'completed' });
        }, 50);
      });

      client.on('item-update', (data) => {
        expect(data).toEqual({ mfcId: '100', status: 'completed' });

        // Unsubscribe and verify no more events arrive
        client.emit('sync:unsubscribe', sessionId);

        setTimeout(() => {
          let receivedAfterUnsub = false;
          client.on('item-update-2', () => {
            receivedAfterUnsub = true;
          });

          emitSyncEvent(sessionId, 'item-update-2', { mfcId: '200' });

          setTimeout(() => {
            expect(receivedAfterUnsub).toBe(false);
            client.disconnect();
            done();
          }, 100);
        }, 50);
      });
    });

    it('should join and leave price tracking rooms', (done) => {
      const userId = 'user-price-rooms';
      const token = generateToken(userId);
      const client = connectClient(token);

      client.on('connect', () => {
        client.emit('prices:subscribe');

        setTimeout(() => {
          emitPriceAlert(userId, { figureId: 'fig1', newPrice: 9999 });
        }, 50);
      });

      client.on('price:alert', (data) => {
        expect(data).toEqual({ figureId: 'fig1', newPrice: 9999 });

        // Unsubscribe from prices
        client.emit('prices:unsubscribe');

        setTimeout(() => {
          let receivedAfterUnsub = false;
          const handler = () => { receivedAfterUnsub = true; };
          client.on('price:alert', handler);

          emitPriceAlert(userId, { figureId: 'fig2', newPrice: 5000 });

          setTimeout(() => {
            expect(receivedAfterUnsub).toBe(false);
            client.off('price:alert', handler);
            client.disconnect();
            done();
          }, 100);
        }, 50);
      });
    });

    it('should ignore invalid sessionId in sync:subscribe', (done) => {
      const userId = 'user-invalid-session';
      const token = generateToken(userId);
      const client = connectClient(token);

      client.on('connect', () => {
        // These should not crash the server
        client.emit('sync:subscribe', '');
        client.emit('sync:subscribe', 12345 as any);

        setTimeout(() => {
          expect(client.connected).toBe(true);
          client.disconnect();
          done();
        }, 100);
      });
    });
  });

  describe('user isolation', () => {
    it('should not leak events between users', (done) => {
      const userAId = 'user-isolation-A';
      const userBId = 'user-isolation-B';
      const tokenA = generateToken(userAId);
      const tokenB = generateToken(userBId);

      const clientA = connectClient(tokenA);
      const clientB = connectClient(tokenB);

      let bothConnected = 0;
      let bReceivedAEvent = false;

      const onBothConnected = () => {
        bothConnected++;
        if (bothConnected < 2) return;

        // Emit to user A only
        emitCollectionUpdate(userAId, { action: 'created', figure: { name: 'Test' } });

        // Listen on user B for leaked event
        clientB.on('collection:update', () => {
          bReceivedAEvent = true;
        });

        // Give time to see if B receives anything
        setTimeout(() => {
          expect(bReceivedAEvent).toBe(false);
          clientA.disconnect();
          clientB.disconnect();
          done();
        }, 200);
      };

      clientA.on('connect', onBothConnected);
      clientB.on('connect', onBothConnected);

      clientA.on('collection:update', (data) => {
        expect(data).toEqual({ action: 'created', figure: { name: 'Test' } });
      });
    });
  });

  describe('emit helpers', () => {
    it('emitToUser sends to user personal room', (done) => {
      const userId = 'user-emit-helper';
      const token = generateToken(userId);
      const client = connectClient(token);

      client.on('connect', () => {
        emitToUser(userId, 'custom:event', { key: 'value' });
      });

      client.on('custom:event', (data) => {
        expect(data).toEqual({ key: 'value' });
        client.disconnect();
        done();
      });
    });

    it('emitCollectionUpdate sends collection:update event', (done) => {
      const userId = 'user-collection-emit';
      const token = generateToken(userId);
      const client = connectClient(token);

      client.on('connect', () => {
        emitCollectionUpdate(userId, { action: 'deleted', figureId: 'fig123' });
      });

      client.on('collection:update', (data) => {
        expect(data).toEqual({ action: 'deleted', figureId: 'fig123' });
        client.disconnect();
        done();
      });
    });

    it('emitSyncEvent sends to sync session room', (done) => {
      const userId = 'user-sync-emit';
      const token = generateToken(userId);
      const client = connectClient(token);
      const sessionId = 'sync-emit-session';

      client.on('connect', () => {
        client.emit('sync:subscribe', sessionId);
        setTimeout(() => {
          emitSyncEvent(sessionId, 'sync-complete', { phase: 'completed' });
        }, 50);
      });

      client.on('sync-complete', (data) => {
        expect(data).toEqual({ phase: 'completed' });
        client.disconnect();
        done();
      });
    });

    it('emitPriceAlert sends price:alert to price room', (done) => {
      const userId = 'user-price-emit';
      const token = generateToken(userId);
      const client = connectClient(token);

      client.on('connect', () => {
        client.emit('prices:subscribe');
        setTimeout(() => {
          emitPriceAlert(userId, { figureId: 'fig1', price: 1200 });
        }, 50);
      });

      client.on('price:alert', (data) => {
        expect(data).toEqual({ figureId: 'fig1', price: 1200 });
        client.disconnect();
        done();
      });
    });
  });
});

/**
 * Separate describe block for null-IO tests.
 * Uses its own server lifecycle to avoid interfering with the main tests.
 */
describe('WebSocket Service - null IO safety', () => {
  it('emit helpers do not throw when IO is null', () => {
    // Ensure IO is null by calling resetIO
    resetIO();
    expect(getIO()).toBeNull();

    expect(() => emitToUser('any', 'event', {})).not.toThrow();
    expect(() => emitSyncEvent('session', 'event', {})).not.toThrow();
    expect(() => emitPriceAlert('any', {})).not.toThrow();
    expect(() => emitCollectionUpdate('any', {})).not.toThrow();
  });

  it('getIO returns null before initialization', () => {
    resetIO();
    expect(getIO()).toBeNull();
  });

  it('resetIO is idempotent', () => {
    resetIO();
    resetIO();
    expect(getIO()).toBeNull();
  });
});
