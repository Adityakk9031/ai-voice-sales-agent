import { WebSocket } from 'ws';
import { logger } from '../utils/logger';
import { AudioTranscoder } from './audio-transcoder';
import { GeminiLiveClient } from '../integrations/gemini/live-client';
import { ToolHandler } from '../agent/tool-handler';
import { prisma } from '../db/client';

export class ConversationManager {
  private ws: WebSocket;
  private streamSid: string;
  private callSid: string;
  private leadId: string | null;
  private transcoder: AudioTranscoder;
  private geminiClient: GeminiLiveClient;
  private toolHandler: ToolHandler;
  private markQueue: string[] = [];

  constructor(ws: WebSocket, streamSid: string, callSid: string, leadId: string | null) {
    this.ws = ws;
    this.streamSid = streamSid;
    this.callSid = callSid;
    this.leadId = leadId;
    
    this.transcoder = new AudioTranscoder(16000);
    this.geminiClient = new GeminiLiveClient(16000, this.leadId, this.callSid);
    this.toolHandler = new ToolHandler(this.leadId, this.callSid);

    this.geminiClient.on('audio', (pcmData: Buffer) => {
      this.sendAudioToTwilio(pcmData);
    });

    this.geminiClient.on('interrupted', () => {
      this.handleInterruption();
    });

    this.geminiClient.on('text', async (text: string) => {
      try {
        if (!this.callSid) return;
        const callDb = await prisma.call.findUnique({ where: { twilioCallSid: this.callSid } });
        if (callDb) {
          await prisma.conversationMessage.create({
            data: { callId: callDb.id, role: 'ai', text: text }
          });
        }
      } catch (err) {
        logger.error({ err }, 'Failed to save transcript');
      }
    });

    this.geminiClient.on('toolCall', async (toolCallData) => {
      if (toolCallData.functionCalls) {
        const responses = await this.toolHandler.handleToolCall(toolCallData.functionCalls);
        this.geminiClient.sendToolResponse(responses);
      }
    });
  }

  /**
   * Pre-connect to Gemini BEFORE the Twilio 'start' event arrives.
   * This eliminates the startup delay that caused Twilio to time out.
   */
  public async preConnect(): Promise<void> {
    logger.info('Pre-connecting to Gemini Live API...');
    await this.geminiClient.connect();
    logger.info('Gemini pre-connect complete - waiting for call start event');
  }

  /**
   * Called once we receive the Twilio 'start' event with real IDs.
   * Updates the manager with the real streamSid, callSid, leadId.
   */
  public finalize(streamSid: string, callSid: string, leadId: string | null) {
    this.streamSid = streamSid;
    this.callSid = callSid;
    this.leadId = leadId;
    // Update tool handler with real IDs
    this.toolHandler = new ToolHandler(this.leadId, this.callSid);
    logger.info({ streamSid, callSid, leadId }, 'ConversationManager finalized with real call IDs');
  }

  /**
   * Trigger the AI greeting. Call after finalize().
   */
  public triggerGreeting() {
    this.geminiClient.triggerGreeting();
  }

  // Legacy initialize - kept for compatibility
  public async initialize() {
    try {
      await this.geminiClient.connect();
      logger.info({ callSid: this.callSid }, 'Gemini connected, triggering greeting in 600ms');
      setTimeout(() => {
        this.geminiClient.triggerGreeting();
      }, 600);
      logger.info({ callSid: this.callSid }, 'Conversation manager initialized');
    } catch (err) {
      logger.error({ err, callSid: this.callSid }, 'Failed to initialize Gemini - call will have no AI');
    }
  }

  public handleTwilioAudio(base64Payload: string) {
    const mulawBuffer = Buffer.from(base64Payload, 'base64');
    const pcmBuffer = this.transcoder.mulawToPcm(mulawBuffer);
    this.geminiClient.sendAudio(pcmBuffer);
  }

  public handleTwilioMark(markName: string) {
    this.markQueue = this.markQueue.filter(m => m !== markName);
  }

  private sendAudioToTwilio(pcmData: Buffer) {
    if (!this.streamSid) {
      logger.warn('sendAudioToTwilio called before streamSid set - dropping audio');
      return;
    }
    const mulawBuffer = this.transcoder.pcmToMulaw(pcmData, 16000);
    const payload = mulawBuffer.toString('base64');
    
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        event: 'media',
        streamSid: this.streamSid,
        media: { payload }
      }));
    }
  }

  private handleInterruption() {
    if (!this.streamSid) return;
    logger.info({ callSid: this.callSid }, 'Handling interruption, clearing Twilio buffer');
    this.ws.send(JSON.stringify({
      event: 'clear',
      streamSid: this.streamSid
    }));
  }

  public async close() {
    await this.geminiClient.disconnect();
  }
}
