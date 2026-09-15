import Redis from 'ioredis';

import dotenv from 'dotenv';
dotenv.config();

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

redis.set('test', 'success')
  .then(() => redis.get('test'))
  .then(val => {
    console.log('Connected! Value:', val);
    process.exit(0);
  })
  .catch(err => {
    console.error('Failed on 6379:', err.message);
    process.exit(1);
  });
