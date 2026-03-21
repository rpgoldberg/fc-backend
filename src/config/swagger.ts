import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'FigureCollecting API',
      version: '3.1.3',
      description: 'API for the FigureCollecting platform — collection management, price tracking, sync, and analytics',
      contact: {
        name: 'FigureCollecting',
        url: 'https://figurecollecting.com',
      },
    },
    servers: [
      { url: '/', description: 'Current server' },
      { url: 'http://localhost:5080', description: 'Local development' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
      schemas: {
        Figure: {
          type: 'object',
          properties: {
            _id: { type: 'string' },
            name: { type: 'string' },
            manufacturer: { type: 'string' },
            origin: { type: 'string' },
            category: { type: 'string' },
            scale: { type: 'string' },
            collectionStatus: { type: 'string', enum: ['owned', 'ordered', 'wished'] },
            imageUrl: { type: 'string' },
            mfcId: { type: 'string' },
            releaseDate: { type: 'string', format: 'date' },
            price: { type: 'number' },
            currency: { type: 'string' },
            userId: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        PaginatedFigures: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            figures: { type: 'array', items: { $ref: '#/components/schemas/Figure' } },
            total: { type: 'integer' },
            page: { type: 'integer' },
            totalPages: { type: 'integer' },
          },
        },
        List: {
          type: 'object',
          properties: {
            _id: { type: 'string' },
            name: { type: 'string' },
            description: { type: 'string' },
            userId: { type: 'string' },
            items: { type: 'array', items: { type: 'string' } },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        SyncJob: {
          type: 'object',
          properties: {
            sessionId: { type: 'string' },
            userId: { type: 'string' },
            phase: { type: 'string', enum: ['idle', 'scraping', 'completed', 'failed', 'cancelled'] },
            message: { type: 'string' },
            progress: { type: 'number' },
            totalItems: { type: 'integer' },
            completedItems: { type: 'integer' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        UserProfile: {
          type: 'object',
          properties: {
            _id: { type: 'string' },
            username: { type: 'string' },
            email: { type: 'string', format: 'email' },
            role: { type: 'string', enum: ['user', 'admin'] },
            mfcUsername: { type: 'string' },
            emailVerified: { type: 'boolean' },
            twoFactorEnabled: { type: 'boolean' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        Error: {
          type: 'object',
          properties: {
            success: { type: 'boolean', default: false },
            message: { type: 'string' },
          },
        },
      },
    },
    security: [{ bearerAuth: [] }],
  },
  apis: ['./src/routes/*.ts', './src/routes/*.js'],
};

export const swaggerSpec = swaggerJsdoc(options);
