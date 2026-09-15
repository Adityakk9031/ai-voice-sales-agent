import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { initiateOutboundCall } from '../integrations/twilio/voice';
import { prisma } from '../db/client';
import { logger } from '../utils/logger';

const startCallSchema = z.object({
  phone: z.string().min(1),
});

export async function callRoutes(fastify: FastifyInstance) {
  const handleStartCall = async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = (request.body as any) || {};
      const query = (request.query as any) || {};
      const phone = body.phone || query.phone || process.env.TARGET_PHONE_NUMBER || '+918809522106';
      
      // Upsert lead
      const lead = await prisma.lead.upsert({
        where: { phone },
        update: {},
        create: { phone },
      });

      // Start Twilio Call
      const twilioCall = await initiateOutboundCall(phone, lead.id);
      
      // Store in DB
      const dbCall = await prisma.call.create({
        data: {
          leadId: lead.id,
          twilioCallSid: twilioCall.sid,
        }
      });

      logger.info({ callSid: twilioCall.sid, leadId: lead.id, phone }, 'Outbound call initiated');

      return reply.send({
        status: 'ok',
        message: `Calling ${phone}...`,
        callId: dbCall.id,
        twilioCallSid: twilioCall.sid
      });
    } catch (err: any) {
      logger.error({ err: err.message }, 'Error starting call');
      return reply.status(500).send({ error: 'Failed to initiate call', message: err.message });
    }
  };

  fastify.post('/start', handleStartCall);
  fastify.get('/start', handleStartCall);

  // List recent calls
  fastify.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const calls = await prisma.call.findMany({
      orderBy: { startedAt: 'desc' },
      take: 20,
      include: {
        lead: true,
        messages: { orderBy: { timestamp: 'asc' } },
        actions: true,
      }
    });
    return reply.send(calls);
  });

  fastify.get('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const call = await prisma.call.findUnique({
      where: { id: request.params.id },
      include: { messages: true, actions: true, lead: true }
    });
    if (!call) return reply.status(404).send({ error: 'Not found' });
    return reply.send(call);
  });
}

export async function leadRoutes(fastify: FastifyInstance) {
  // List all leads
  fastify.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const leads = await prisma.lead.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { calls: true, callbacks: true }
    });
    return reply.send(leads);
  });

  fastify.get('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const lead = await prisma.lead.findUnique({
      where: { id: request.params.id },
      include: { calls: true, callbacks: true }
    });
    if (!lead) return reply.status(404).send({ error: 'Not found' });
    return reply.send(lead);
  });
}
