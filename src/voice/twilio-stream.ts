import { FastifyInstance, FastifyRequest } from 'fastify';
import { logger } from '../utils/logger';
import { ConversationManager } from './conversation-manager';
import { prisma } from '../db/client';

export async function twilioStreamRoute(fastify: FastifyInstance) {
  const handler = (connection: any, req: FastifyRequest) => {
    logger.info({ url: req.url }, 'Twilio media stream WebSocket incoming connection');
    const ws = connection.socket || connection;
    let streamSid: string | null = null;
    let callSid: string | null = null;
    let leadId: string | null = null;

    let conversationManager: ConversationManager | null = null;
    // Pre-connect to Gemini immediately on WS open (before the 'start' event)
    // so Gemini is ready when we need to send audio, avoiding timing out Twilio
    let geminiPreconnectPromise: Promise<void> | null = null;

    // Start Gemini pre-connection as soon as WS connects
    // We create a temporary manager without streamSid/callSid first
    const preConnectManager = new ConversationManager(ws, '', '', null);
    geminiPreconnectPromise = preConnectManager.preConnect()
      .then(() => {
        logger.info('Gemini pre-connected and ready before start event');
        conversationManager = preConnectManager;
      })
      .catch((err) => {
        logger.error({ err }, 'Gemini pre-connect failed');
      });

    ws.on('message', async (message: string) => {
      try {
        const data = JSON.parse(message);

        switch (data.event) {
          case 'connected':
            logger.info('Twilio media stream connected event received');
            break;

          case 'start':
            streamSid = data.start.streamSid;
            callSid = data.start.callSid;
            leadId = data.start.customParameters?.leadId || null;

            // If leadId is not in stream parameters, fetch it from DB via callSid
            if (!leadId && callSid) {
              try {
                const callRecord = await prisma.call.findUnique({ where: { twilioCallSid: callSid } });
                leadId = callRecord?.leadId || null;
              } catch (e) {
                logger.warn({ e, callSid }, 'Could not resolve leadId from DB');
              }
            }

            logger.info({ streamSid, callSid, leadId }, 'Twilio media stream started');

            // Persist streamSid into the Call record (non-blocking)
            if (callSid) {
              prisma.call.updateMany({
                where: { twilioCallSid: callSid },
                data: { streamSid: streamSid ?? undefined }
              }).catch(err => logger.error({ err }, 'Failed to store streamSid'));
            }

            // Wait for Gemini pre-connect to finish, then finalize with real IDs
            await geminiPreconnectPromise;
            if (conversationManager) {
              conversationManager.finalize(streamSid as string, callSid as string, leadId);
              // Trigger greeting now that we have real call context
              conversationManager.triggerGreeting();
              logger.info({ streamSid, callSid }, 'Conversation manager finalized and greeting triggered');
            }
            break;

          case 'media':
            if (conversationManager) {
              const payload = data.media.payload; // base64 mulaw
              conversationManager.handleTwilioAudio(payload);
            }
            break;

          case 'stop':
            logger.info({ streamSid, callSid }, 'Twilio media stream stopped');
            if (conversationManager) {
              await conversationManager.close();
            }
            break;
            
          case 'mark':
            if (conversationManager) {
              conversationManager.handleTwilioMark(data.mark.name);
            }
            break;
        }
      } catch (err) {
        logger.error({ err }, 'Error processing Twilio stream message');
      }
    });

    ws.on('close', () => {
      logger.info({ streamSid, callSid }, 'Twilio media stream closed');
      if (conversationManager) {
        conversationManager.close();
      }
    });
    
    ws.on('error', (err: any) => {
      logger.error({ err, streamSid, callSid }, 'Twilio media stream error');
    });
  };

  fastify.get('/media-stream', { websocket: true }, handler);
  fastify.get('/twilio/media-stream', { websocket: true }, handler);
}
