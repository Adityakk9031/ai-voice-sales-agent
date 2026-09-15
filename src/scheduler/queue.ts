import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { env } from '../config/env';

const connection = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null
});

export const callbackQueue = new Queue('callbackQueue', { connection });

export async function scheduleCallbackJob(leadId: string, scheduledAt: Date) {
  const delay = scheduledAt.getTime() - Date.now();
  await callbackQueue.add('initiate-callback', { leadId }, { delay });
}
