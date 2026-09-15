import { Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { prisma } from '../db/client';
import { initiateOutboundCall } from '../integrations/twilio/voice';

const connection = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null
});

logger.info('Starting callback worker...');

const worker = new Worker('callbackQueue', async (job: Job) => {
  const { leadId } = job.data;
  logger.info({ leadId, jobId: job.id }, 'Processing callback job');

  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead || !lead.phone) {
    logger.error('Lead not found or missing phone');
    return;
  }

  try {
    const twilioCall = await initiateOutboundCall(lead.phone, lead.id);
    await prisma.call.create({
      data: {
        leadId: lead.id,
        twilioCallSid: twilioCall.sid,
      }
    });
    
    // Mark callbacks as processed
    await prisma.callback.updateMany({
      where: { leadId: lead.id, status: 'pending' },
      data: { status: 'completed', twilioCallSid: twilioCall.sid }
    });

    logger.info('Callback outbound call initiated successfully');
  } catch (err) {
    logger.error({ err }, 'Error during callback execution');
    throw err;
  }
}, { connection });

worker.on('failed', (job, err) => {
  logger.error({ err, jobId: job?.id }, 'Job failed');
});
