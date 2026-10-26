import express, { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { getEnv } from './config/env.js';
import { nosqlSanitizer } from './middleware/nosqlSanitizer.js';
import authRoutes from './routes/authRoutes.js';
import auditRoutes from './routes/auditRoutes.js';
import fdrRoutes from './routes/fdrRoutes.js';
import releaseRoutes from './routes/releaseRoutes.js';
import copilotRoutes from './routes/copilotRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';

export function createApp(): express.Application {
  const app = express();
  const env = getEnv();

  // 1. Trust proxy for Render reverse proxy (ensures secure cookies & correct client IPs)
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  // 2. Security Headers via Helmet (configured for cross-origin API usage)
  app.use(
    helmet({
      contentSecurityPolicy: false, // API server does not serve HTML pages directly
      crossOriginResourcePolicy: { policy: 'cross-origin' }, // Allows Vercel frontend to stream docs & downloads
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
      },
      noSniff: true,
      frameguard: { action: 'deny' },
      referrerPolicy: { policy: 'no-referrer' }
    })
  );

  // 3. Dynamic CORS allowlist supporting Vercel deployments, custom domains & local dev
  const configuredOrigins = env.CLIENT_URL.split(',').map(u => u.trim().replace(/\/+$/, ''));
  const isAllowedOrigin = (origin: string | undefined): boolean => {
    if (!origin) return true; // Server-to-server, health checks, curl
    const cleanOrigin = origin.replace(/\/+$/, '');
    if (configuredOrigins.includes(cleanOrigin)) return true;
    if (cleanOrigin.endsWith('.vercel.app')) return true; // Any Vercel preview or production deploy
    if (cleanOrigin.startsWith('http://localhost:') || cleanOrigin.startsWith('http://127.0.0.1:')) return true;
    return false;
  };

  app.use(
    cors({
      origin: (origin, callback) => {
        if (isAllowedOrigin(origin)) {
          callback(null, true);
        } else {
          callback(new Error(`CORS blocked for origin: ${origin}`));
        }
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-CSRF-Token']
    })
  );

  // 4. Strict body limit (100kb max)
  app.use(express.json({ limit: '100kb' }));
  app.use(express.urlencoded({ extended: false, limit: '100kb' }));
  app.use(cookieParser());

  // 5. NoSQL sanitization middleware to block operator injection
  app.use(nosqlSanitizer);

  // 6. Health check & Brand verification endpoint
  app.get('/api/health', (req: Request, res: Response) => {
    res.status(200).json({
      brand: 'Nidhi Suraksha',
      tagline: 'Verify. Track. Release.',
      status: 'UP',
      timestamp: new Date().toISOString()
    });
  });

  // 7. Route Mounting
  app.use('/auth', authRoutes);
  app.use('/audit', auditRoutes);
  app.use('/fdrs', fdrRoutes);
  app.use('/release-requests', releaseRoutes);
  app.use('/copilot', copilotRoutes);
  app.use('/dashboard', dashboardRoutes);
  app.use('/reports', dashboardRoutes);
  app.use('/admin', dashboardRoutes);

  // 8. 404 handler for unknown routes
  app.use((req: Request, res: Response) => {
    res.status(404).json({
      error: 'Not Found',
      message: 'The requested resource does not exist.'
    });
  });

  // 9. Centralized Error Handler (no stack traces in production)
  app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
    const isProd = env.NODE_ENV === 'production';
    res.status(500).json({
      error: 'Internal Server Error',
      message: isProd ? 'An unexpected error occurred.' : err.message
    });
  });

  return app;
}
