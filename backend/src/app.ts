import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import swaggerUi from 'swagger-ui-express';
import { appConfig } from './config/app.config';
import { errorHandler } from './shared/middleware/errorHandler';
import { requestIdMiddleware } from './core/utils/requestId';
import { globalLimiter } from './shared/middleware/rateLimiter';
import { requestLogger } from './shared/middleware/requestLogger';
import apiV1Routes from './api/v1';
import { swaggerSpec } from './api/swagger';

const app = express();

/**
 * Whose `X-Forwarded-For` we believe.
 *
 * `trust proxy: 1` means "take the last hop as trusted, whoever it is" — it
 * pins the COUNT of proxies, not their identity. Everything that reads
 * `req.ip` inherits that: the per-IP rate limiters, and — the one that
 * matters — `internal-sso.routes.ts`'s source-address allowlist, which guards
 * an endpoint that mints a full GMS session for an arbitrary email address.
 * If the backend's raw port is ever reachable by anything other than the one
 * Apache hop (a misconfigured firewall rule, a container port publish, a
 * developer tunnel), a client can simply send `X-Forwarded-For: 127.0.0.1`,
 * satisfy the allowlist, and leave the shared secret as the only remaining
 * control.
 *
 * Naming the proxy instead makes a forged header from anywhere else fall back
 * to the socket address, which will not be on the allowlist. `TRUST_PROXY`
 * takes anything Express accepts — a single address, a comma-separated list,
 * or CIDR notation ('127.0.0.1', 'loopback', '10.0.0.0/8'). Defaults to
 * loopback, which is correct for this platform's actual topology: Apache and
 * every Node process run on the same internal server.
 */
app.set('trust proxy', process.env.TRUST_PROXY ?? 'loopback');

const isLoopbackHostname = (hostname: string) => hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';

const buildAllowedOrigins = () => {
  const baseOrigins = [appConfig.clientOrigin, ...appConfig.corsAllowedOrigins];
  const devOrigins = [
    'http://localhost:7201',
    'https://localhost:7201',
    'https://127.0.0.1:7201',
  ];

  const origins = new Set<string>(
    [...baseOrigins, ...(appConfig.isProduction ? [] : devOrigins)].filter(Boolean)
  );

  if (!appConfig.isProduction) {
    for (const origin of Array.from(origins)) {
      try {
        const parsed = new URL(origin);
        if (parsed.hostname === 'localhost') {
          origins.add(`${parsed.protocol}//127.0.0.1${parsed.port ? `:${parsed.port}` : ''}`);
        }
        if (parsed.hostname === '127.0.0.1') {
          origins.add(`${parsed.protocol}//localhost${parsed.port ? `:${parsed.port}` : ''}`);
        }
      } catch {
        continue;
      }
    }
  }

  return origins;
};

const allowedOrigins = buildAllowedOrigins();

const isAllowedOrigin = (origin: string | undefined) => {
  if (!origin) {
    return true;
  }

  return allowedOrigins.has(origin);
};

/**
 * 1. Security & Constraints Layer
 */
app.use(helmet({
  hsts: appConfig.isProduction ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  referrerPolicy: { policy: 'no-referrer' },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      /**
       * P2-8: `'unsafe-inline'` removed from the GLOBAL script-src.
       *
       * It was applied to every route in the system, with the comment "Required
       * for Swagger UI" — true of Swagger UI and of nothing else. GMS's frontend
       * keeps its access token in localStorage (state/auth.store.ts), so one
       * reflected XSS anywhere under this policy was one token exfiltration, and
       * the API-docs page was the entire reason the door was open.
       *
       * Swagger UI keeps its relaxed policy, scoped to `/api-docs`, registered
       * AFTER this one — see the note at that mount for why the order matters.
       */
      scriptSrc: ["'self'"],
      // styleSrc keeps 'unsafe-inline': the SPA and Swagger UI both set style
      // attributes, and style-src is not what gates script execution.
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
      connectSrc: [
        "'self'",
        ...(appConfig.isProduction
          ? []
          : ["http://localhost:*", "http://127.0.0.1:*", "ws://localhost:*", "ws://127.0.0.1:*"]),
      ],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
}));

app.use(cors({
  origin(origin, callback) {
    if (!origin) {
      callback(null, true);
      return;
    }

    callback(null, isAllowedOrigin(origin) ? origin : false);
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  credentials: true,
}));

app.use(compression());

// Normalize Content-Type charset to lowercase (fixes body-parser rejecting
// charsets like "UTF-8" in some clients). This runs before any body parsers.
app.use((req: express.Request, _res: express.Response, next: express.NextFunction) => {
  const ct = req.headers['content-type'];
  if (ct && typeof ct === 'string') {
    // replace charset=... with lowercase value
    const updated = ct.replace(/charset\s*=\s*"?([^;"']+)"?/i, (_m, p1) => `charset=${p1.toLowerCase()}`);
    req.headers['content-type'] = updated;
  }
  next();
});

/**
 * P2-9 item 12: the raw-body capture is scoped to the webhook mount now.
 *
 * It used to run on EVERY request, at a 10 MB limit, retaining the whole Buffer
 * on the request object alongside the already-parsed body — so every large JSON
 * upload was held in memory twice for the life of the request, on every route,
 * to serve exactly one consumer: HMAC signature verification in
 * modules/unifi-webhooks (the only reader of `req.rawBody` in the codebase).
 *
 * The narrow parser is registered on the webhook path FIRST. Express uses the
 * first body parser that runs and populates `req.body`, so a request to
 * `/api/v1/integrations/unifi/*` is parsed here (with the buffer kept) and the
 * general parser below sees a body already parsed and does nothing; every other
 * path skips this one entirely and pays nothing.
 */
const UNIFI_WEBHOOK_PATH = `${appConfig.api.basePath}/integrations/unifi`;

app.use(
  UNIFI_WEBHOOK_PATH,
  express.json({
    limit: '1mb', // a webhook payload is small; 10mb was inherited, not needed
    verify: (req: any, _res, buf: Buffer) => {
      req.rawBody = buf;
    },
  })
);

app.use(
  UNIFI_WEBHOOK_PATH,
  express.urlencoded({
    extended: true,
    limit: '1mb',
    verify: (req: any, _res, buf: Buffer) => {
      // urlencoded webhook variants, if any
      req.rawBody = buf;
    },
  })
);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

/**
 * 2. Observability — stamp every request with a trace ID
 */
app.use(requestIdMiddleware);
app.use(requestLogger);

/**
 * 3. Global rate limiter (per-route limiters applied directly on routes)
 */
app.use(globalLimiter);

/**
 * 4. Swagger UI — enabled by default outside production.
 *    In production, it must be explicitly enabled.
 */
if (appConfig.docs.enabled) {
  /**
   * P2-8: Swagger UI's inline scripts, scoped to this mount only.
   *
   * Registered AFTER the global helmet above, deliberately. Both write
   * Content-Security-Policy with res.setHeader, so the LAST one to run wins —
   * registering this first would have it silently overwritten by the strict
   * global policy and the docs page would break with no clue why. Verified as
   * ordering, not assumed.
   *
   * This mount is already gated: ENABLE_API_DOCS must be true, and it defaults to
   * false in production.
   */
  app.use('/api-docs', helmet.contentSecurityPolicy({
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
    },
  }));

  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customSiteTitle: 'GMS Enterprise API Docs',
    swaggerOptions: { persistAuthorization: true },
  }));

  // Raw OpenAPI JSON for Postman / programmatic use
  app.get('/api-docs.json', (_req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
  });
}

/**
 * 5. Versioned API Routes
 */
app.use(appConfig.api.basePath, apiV1Routes);

/**
 * 6. Unmatched routes -> JSON 404
 *
 * Without this, an unmatched path fell through to errorHandler with no error
 * and Express served its default HTML 404 page -- the one response on the whole
 * API that broke the { success, error: { code, message } } envelope every
 * client parses. Must sit after the routes and before the error handler.
 */
app.use((req: express.Request, res: express.Response) => {
  res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: `Cannot ${req.method} ${req.originalUrl}` },
  });
});

/**
 * 7. Global Error Handler — must be last
 */
app.use(errorHandler);

export default app;
