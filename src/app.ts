import Fastify from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import fastifyFormbody from '@fastify/formbody';
import { healthRoutes } from './api/health';
import { twilioRoutes } from './api/twilio';
import { callRoutes, leadRoutes } from './api/calls';
import { twilioStreamRoute } from './voice/twilio-stream';
import { env } from './config/env';

export function buildApp() {
  const app = Fastify({
    connectionTimeout: 20000,
    keepAliveTimeout: 30000,
    requestTimeout: 15000,
    // Fastify v5: pass logger config object, not a pino instance
    logger: {
      level: env.NODE_ENV === 'development' ? 'debug' : 'info',
      transport:
        env.NODE_ENV === 'development'
          ? {
              target: 'pino-pretty',
              options: {
                colorize: true,
                translateTime: 'SYS:standard',
                ignore: 'pid,hostname',
              },
            }
          : undefined,
    },
  });

  app.addHook('onRequest', (req, reply, done) => {
    req.log.info({ method: req.method, url: req.url }, 'incoming request');
    done();
  });

  app.addHook('onResponse', (req, reply, done) => {
    req.log.info({ method: req.method, url: req.url, statusCode: reply.statusCode }, 'request completed');
    done();
  });

  // Plugins
  app.register(fastifyFormbody);
  app.register(fastifyWebsocket);

  // Routes
  app.register(healthRoutes);
  app.register(twilioRoutes, { prefix: '/twilio' });
  app.register(callRoutes, { prefix: '/api/calls' });
  app.register(leadRoutes, { prefix: '/api/leads' });
  app.register(twilioStreamRoute);

  return app;
}
