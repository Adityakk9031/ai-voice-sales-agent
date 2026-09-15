import pino from 'pino';
import { env } from '../config/env';

import fs from 'fs';

export const logger = pino(
  {
    level: env.NODE_ENV === 'development' ? 'debug' : 'info',
  },
  pino.multistream([
    {
      stream: fs.createWriteStream('server.log', { flags: 'a' }),
    },
    {
      stream: process.stdout,
    }
  ])
);
