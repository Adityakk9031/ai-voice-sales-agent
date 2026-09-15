import { EventEmitter } from 'events';
import { WebSocket } from 'ws';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';
import { GoogleGenAI } from '@google/genai';
import { SYSTEM_PROMPT } from '../../agent/system-prompt';
import { GEMINI_TOOLS } from '../../agent/tools';

export class GeminiLiveClient extends EventEmitter {
  private sampleRate: number;
  private leadId: string | null;
  private callSid: string;
  private ws: WebSocket | null = null;
  private isConnected = false;
  private setupComplete = false;
  
  constructor(sampleRate: number, leadId: string | null, callSid: string) {
    super();
    this.sampleRate = sampleRate;
    this.leadId = leadId;
    this.callSid = callSid;
  }

  public async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      logger.info({ callSid: this.callSid }, 'Connecting to Gemini Live API');
      
      const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${env.GEMINI_API_KEY}`;
      
      this.ws = new WebSocket(url);
      
      const connectTimeout = setTimeout(() => {
        logger.error({ callSid: this.callSid }, 'Gemini WS connect timeout after 15s');
        reject(new Error('Gemini WS connect timeout after 15s'));
      }, 15000);

      this.ws.on('open', () => {
        logger.info({ callSid: this.callSid }, 'Gemini Live WS connected, sending setup');
        this.sendSetupMessage();
      });

      this.ws.on('message', (data: Buffer) => {
        const wasSetup = this.setupComplete;
        this.handleMessage(data);
        if (!wasSetup && this.setupComplete) {
          clearTimeout(connectTimeout);
          resolve();
        }
      });

      this.ws.on('close', (code, reason) => {
        this.isConnected = false;
        logger.warn({ callSid: this.callSid, code, reason: reason?.toString() }, 'Gemini Live WS closed');
        if (!this.setupComplete) {
          clearTimeout(connectTimeout);
          reject(new Error(`Gemini WS closed before setup: code=${code}`));
        }
        this.emit('closed');
      });

      this.ws.on('error', (err) => {
        logger.error({ err, callSid: this.callSid }, 'Gemini Live WS error');
        if (!this.setupComplete) {
          clearTimeout(connectTimeout);
          reject(err);
        }
        this.emit('error', err);
      });
    });
  }

  public triggerGreeting() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      logger.info({ callSid: this.callSid }, 'Triggering AI greeting');
      const msg = {
        clientContent: {
          turns: [
            {
              role: 'user',
              parts: [{ text: 'The outbound call has connected and the client answered. Introduce yourself immediately as Priya from Singh Agency and deliver your opening pitch.' }]
            }
          ],
          turnComplete: true
        }
      };
      this.ws.send(JSON.stringify(msg));
    }
  }

  private sendSetupMessage() {
    const setupMsg = {
      setup: {
        model: `models/${env.GEMINI_LIVE_MODEL}`,
        systemInstruction: {
          parts: [{ text: SYSTEM_PROMPT }]
        },
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: "Aoede",
              }
            }
          }
        },
        tools: GEMINI_TOOLS
      }
    };
    this.ws?.send(JSON.stringify(setupMsg));
  }

  public sendAudio(pcmBuffer: Buffer) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const msg = {
        realtimeInput: {
          mediaChunks: [{
            mimeType: `audio/pcm;rate=${this.sampleRate}`,
            data: pcmBuffer.toString('base64')
          }]
        }
      };
      this.ws.send(JSON.stringify(msg));
    }
  }

  private handleMessage(data: Buffer) {
    try {
      const msg = JSON.parse(data.toString('utf-8'));
      
      // Setup complete acknowledgement from Gemini
      if (msg.setupComplete) {
        this.setupComplete = true;
        this.isConnected = true;
        logger.info({ callSid: this.callSid }, 'Gemini setup complete - ready for audio');
        return;
      }

      if (msg.serverContent?.interrupted) {
        this.emit('interrupted');
        return;
      }

      if (msg.serverContent?.modelTurn) {
        const parts = msg.serverContent.modelTurn.parts;
        for (const part of parts) {
          if (part.inlineData && part.inlineData.data) {
            const pcmBuffer = Buffer.from(part.inlineData.data, 'base64');
            this.emit('audio', pcmBuffer);
          }
          if (part.text) {
            this.emit('text', part.text);
          }
          if (part.functionCall) {
            this.emit('functionCall', part.functionCall);
          }
        }
      }
      
      if (msg.toolCall) {
         this.emit('toolCall', msg.toolCall);
      }
    } catch (err) {
      logger.error({ err, callSid: this.callSid }, 'Error parsing Gemini message');
    }
  }

  public sendToolResponse(responses: any[]) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const msg = {
        toolResponse: {
          functionResponses: responses.map(r => ({
            id: r.id,
            name: r.name,
            response: r.response
          }))
        }
      };
      this.ws.send(JSON.stringify(msg));
    }
  }

  public async disconnect() {
    this.isConnected = false;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.close(1000, 'Call ended');
    }
  }
}
