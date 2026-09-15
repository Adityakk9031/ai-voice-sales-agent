import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import twilio from 'twilio';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { prisma } from '../db/client';
import { sendPostCallWhatsapp } from '../integrations/twilio/whatsapp';
import fs from 'fs';
import path from 'path';

// Reads the current tunnel URL dynamically from tunnel-url.json
// Falls back to env var if file doesn't exist
function getCurrentTunnelUrls(): { httpUrl: string; wssUrl: string } {
  try {
    const tunnelFile = path.join(process.cwd(), 'tunnel-url.json');
    if (fs.existsSync(tunnelFile)) {
      const data = JSON.parse(fs.readFileSync(tunnelFile, 'utf8'));
      if (data.url && data.url.startsWith('https://')) {
        return { httpUrl: data.url, wssUrl: data.wss || data.url.replace('https://', 'wss://') };
      }
    }
  } catch (e) {
    // fall through to env
  }
  return { httpUrl: env.PUBLIC_BASE_URL, wssUrl: env.PUBLIC_WSS_URL };
}

// In-memory call conversation buffer for sub-second telephony response time (<800ms)
interface ConversationTurn {
  role: 'user' | 'ai';
  text: string;
  timestamp: number;
}

interface ActiveCallData {
  leadId: string;
  turns: ConversationTurn[];
  lastActive: number;
}

const activeCallBuffers = new Map<string, ActiveCallData>();

// Purge stale memory buffers older than 30 minutes
setInterval(() => {
  const now = Date.now();
  for (const [callSid, data] of activeCallBuffers.entries()) {
    if (now - data.lastActive > 30 * 60 * 1000) {
      activeCallBuffers.delete(callSid);
    }
  }
}, 5 * 60 * 1000);

// Sanitizes text for Amazon Polly and TwiML XML (replaces ₹ with rupees, & with and, removes markup)
function sanitizeForSpeech(text: string): string {
  if (!text) return '';
  return text
    .replace(/₹\s*(\d+[\d,]*)/g, '$1 rupees')
    .replace(/₹/g, ' rupees ')
    .replace(/&/g, ' and ')
    .replace(/[*#_~`]/g, '')
    .replace(/[<>]/g, '')
    .trim();
}

export async function twilioRoutes(fastify: FastifyInstance) {
  
  fastify.post('/voice', async (request: FastifyRequest<{ Querystring: { leadId?: string } }>, reply: FastifyReply) => {
    const { httpUrl } = getCurrentTunnelUrls();
    const body = request.body as any;
    const query = request.query as any;
    const leadId = query.leadId || '';
    const callSid = body.CallSid || '';
    logger.info({ body, query, callSid }, 'TWILIO VOICE WEBHOOK HIT');

    const twiml = new twilio.twiml.VoiceResponse();
    const greeting = "Hello! This is Priya from Singh Agency. How are you doing today?";

    // Initialize in-memory conversation buffer immediately (0ms)
    if (callSid) {
      activeCallBuffers.set(callSid, {
        leadId,
        turns: [{ role: 'ai', text: greeting, timestamp: Date.now() }],
        lastActive: Date.now(),
      });

      setImmediate(async () => {
        try {
          const c = await prisma.call.findFirst({ where: { twilioCallSid: callSid } });
          if (c) {
            await prisma.conversationMessage.create({
              data: { callId: c.id, role: 'ai', text: greeting }
            });
          }
        } catch (err) {
          logger.warn({ err }, 'Async greeting DB save error (non-fatal)');
        }
      });
    }

    // bargeIn: true — so if customer speaks while Priya is greeting, it gets captured
    const introGather = twiml.gather({
      input: ['speech'],
      action: `${httpUrl}/twilio/respond?leadId=${encodeURIComponent(leadId)}`,
      method: 'POST',
      speechTimeout: 'auto',
      timeout: 10,
      language: 'en-IN',
      hints: 'fine, good, hello, yes, clothes, shoes, products, business, sell, website',
      bargeIn: true,
    });
    introGather.say({ voice: 'Polly.Aditi' }, greeting);

    // Only fires if truly no speech detected at all
    twiml.redirect({ method: 'POST' }, `${httpUrl}/twilio/respond?leadId=${encodeURIComponent(leadId)}`);

    reply.type('text/xml').send(twiml.toString());
  });


  fastify.post('/respond', async (request: FastifyRequest<{ Querystring: { leadId?: string } }>, reply: FastifyReply) => {
    const { httpUrl } = getCurrentTunnelUrls();
    const body = request.body as any;
    const query = request.query as any;
    const speechResult = body.SpeechResult || '';
    const callSid = body.CallSid || '';
    const leadId = query.leadId || '';
    logger.info({ speechResult, callSid, leadId }, 'Twilio Speech Result received');

    const twiml = new twilio.twiml.VoiceResponse();

    if (!speechResult) {
      const emptyGather = twiml.gather({
        input: ['speech'],
        action: `${httpUrl}/twilio/respond?leadId=${encodeURIComponent(leadId)}`,
        method: 'POST',
        speechTimeout: 'auto',
        timeout: 8,
        language: 'en-IN',
        hints: 'website, ecommerce, online store, shopify, products, payment gateway, budget, lakh, quotation, whatsapp, email',
        bargeIn: true,
      });
      emptyGather.say({ voice: 'Polly.Aditi' }, "I'm still here! Could you tell me what kind of products you sell?");
      twiml.redirect({ method: 'POST' }, `${httpUrl}/twilio/respond?leadId=${encodeURIComponent(leadId)}`);
      return reply.type('text/xml').send(twiml.toString());
    }

    // 1. Pull conversation history from in-memory buffer (0ms vs 1800ms DB query)
    let callBuffer = activeCallBuffers.get(callSid);
    if (!callBuffer) {
      callBuffer = {
        leadId,
        turns: [{ role: 'ai', text: "Hi there! This is Priya from Singh Agency.", timestamp: Date.now() }],
        lastActive: Date.now(),
      };
      activeCallBuffers.set(callSid, callBuffer);
    }
    callBuffer.lastActive = Date.now();
    callBuffer.turns.push({ role: 'user', text: speechResult, timestamp: Date.now() });

    // 2. Persist user speech to database asynchronously (non-blocking)
    setImmediate(async () => {
      try {
        const c = await prisma.call.findFirst({ where: { twilioCallSid: callSid } });
        if (c) {
          await prisma.conversationMessage.create({
            data: { callId: c.id, role: 'user', text: speechResult }
          });
        }
      } catch (err) {
        logger.warn({ err }, 'Async user turn DB save error (non-fatal)');
      }
    });

    // 3. Build lean contents for Gemini from recent turns (last 6 for context)
    const recentTurns = callBuffer.turns.slice(-6);
    const contents = recentTurns.map(t => ({
      role: t.role === 'ai' ? 'model' : 'user',
      parts: [{ text: t.text }]
    }));

    const lowerSpeech = speechResult.toLowerCase();
    const userTurns = callBuffer.turns.filter(t => t.role === 'user');
    const userTurnCount = userTurns.length;
    const isRecordingNotice = lowerSpeech.includes('recorded') || lowerSpeech.includes('recording');

    // Skip carrier recording announcements
    if (isRecordingNotice) {
      const askGather = twiml.gather({
        input: ['speech'],
        action: `${httpUrl}/twilio/respond?leadId=${encodeURIComponent(leadId)}`,
        method: 'POST',
        speechTimeout: 'auto',
        timeout: 8,
        language: 'en-IN',
        bargeIn: true,
      });
      askGather.say({ voice: 'Polly.Aditi' }, "Hi! How are you doing today?");
      twiml.redirect({ method: 'POST' }, `${httpUrl}/twilio/respond?leadId=${encodeURIComponent(leadId)}`);
      return reply.type('text/xml').send(twiml.toString());
    }

    // ── CONTENT-AWARE STAGE DETECTION ─────────────────────────────────────
    // Scan ALL user turns to detect what info has been shared — not just turn count
    const allUserText = userTurns.map(t => t.text.toLowerCase()).join(' ');
    const allAiText = callBuffer.turns.filter(t => t.role === 'ai').map(t => t.text.toLowerCase()).join(' ');

    // Has the customer mentioned what they sell?
    const hasSharedProduct = /\b(cloth|shoe|innerwear|saree|shirt|pant|kurta|food|restaurant|jewel|electronic|mobile|phone|furniture|toy|book|sport|cosmeti|beauty|grocery|medicine|hardware|bag|watch|optical|pharma|agri|fashion|apparel|wear|garment|sell|selling|business|product|shop|store|brand|manufactur)\b/.test(allUserText);

    // Has budget been discussed (AI asked about budget OR customer mentioned money)?
    const aiAskedBudget = allAiText.includes('budget') || allAiText.includes('35,000') || allAiText.includes('rupees');
    const customerMentionedBudget = /\b(\d[\d,]+|lakh|thousand|hazar|budget|price|cost|afford|money|invest|rupee|spend)\b/.test(allUserText);
    const hasBudgetStage = aiAskedBudget;

    // Has features been discussed (AI asked about features/products count)?
    const aiAskedFeatures = allAiText.includes('how many product') || allAiText.includes('features') || allAiText.includes('cod') || allAiText.includes('inventory');
    const hasFeaturesStage = aiAskedFeatures;

    // Did the customer explicitly request to send quotation?
    const isQuoteOrSend = hasSharedProduct && (
      lowerSpeech.includes('quote') || lowerSpeech.includes('quotation') ||
      lowerSpeech.includes('send') || lowerSpeech.includes('share') ||
      lowerSpeech.includes('bhej') || lowerSpeech.includes('email') ||
      lowerSpeech.includes('mail') || lowerSpeech.includes('whatsapp') ||
      lowerSpeech.includes('ha') || lowerSpeech === 'yes' || lowerSpeech === 'haan'
    ) && hasFeaturesStage; // Only when features stage already happened

    // ── DETERMINE WHAT PRIYA SHOULD DO NOW ────────────────────────────────
    let currentStageInstruction: string;
    let aiReplyText: string;

    if (isQuoteOrSend) {
      // Customer agreed to receive quotation after full discovery
      currentStageInstruction = `The customer wants the quotation. Say: "Perfect! I am sending the complete quotation with all project details to your WhatsApp and Email right now. Please check your messages shortly!"`;
      aiReplyText = "Perfect! I am sending the complete quotation to your WhatsApp and Email right now. Please check your messages!";
    } else if (hasFeaturesStage && hasSharedProduct && hasBudgetStage) {
      // All info gathered — offer quotation
      currentStageInstruction = `You have all details needed. Ask if they want the quotation: "Wonderful! I have noted everything down. Shall I send you the complete project quotation on WhatsApp or Email right now?"`;
      aiReplyText = "Wonderful! I have all the details. Shall I send the complete quotation to your WhatsApp or Email?";
    } else if (hasBudgetStage && hasSharedProduct) {
      // Services + pricing done — ask about features and product count
      currentStageInstruction = `Budget was just discussed. Now ask: "Perfect! And roughly how many products do you plan to list on the store? Do you need features like COD, inventory tracking, or WhatsApp ordering?"`;
      aiReplyText = "Perfect! Roughly how many products do you want to list? Any specific features like COD, inventory tracking, or WhatsApp ordering?";
    } else if (hasSharedProduct) {
      // Customer told us what they sell — pitch services + discuss budget
      currentStageInstruction = `The customer told you what they sell (look in history). Acknowledge it warmly, mention Singh Agency builds exactly that kind of store with payment gateway, WhatsApp ordering, admin panel. Then say: "Our packages start from just 35,000 rupees. What kind of budget are you thinking for this?" Do NOT ask what they sell again.`;
      aiReplyText = "That is amazing! We build exactly this kind of store with payment gateway, WhatsApp ordering, and admin panel. Our packages start from just 35,000 rupees — what budget are you thinking?";
    } else if (userTurnCount >= 1) {
      // Customer answered greeting but hasn't told us their product yet
      currentStageInstruction = `The customer just answered your greeting. Ask them warmly about their business: "That is great! So tell me — what kind of products or business do you have?"`;
      aiReplyText = "That is great! So tell me — what kind of products or business do you run?";
    } else {
      currentStageInstruction = `Ask the customer what kind of business or products they have.`;
      aiReplyText = "So tell me, what kind of products or business do you run?";
    }

    logger.info({ userTurnCount, hasSharedProduct, hasBudgetStage, hasFeaturesStage, isQuoteOrSend, stage: currentStageInstruction.substring(0, 60) }, 'Stage detected');

    // ── GEMINI CALL with 3.5s timeout ─────────────────────────────────────
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);

    try {
      const voiceSystemPrompt = `You are Priya, a warm friendly sales executive at Singh Agency India selling custom e-commerce websites.
Respond in 1-2 short natural spoken sentences (max 25 words). Sound human, warm, conversational — not robotic or scripted.
Never use markdown, symbols, or bullet points. Always say rupees as a word, never use rupee symbol.

YOUR EXACT TASK RIGHT NOW:
${currentStageInstruction}

Read the conversation history carefully. Execute your task naturally based on what the customer actually said.`;

      const geminiReqBody = {
        system_instruction: { parts: [{ text: voiceSystemPrompt }] },
        contents,
        generationConfig: { maxOutputTokens: 80, temperature: 0.8 }
      };

      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${env.GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(geminiReqBody),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const data = await res.json();
      if (data.candidates && data.candidates[0]?.content?.parts[0]?.text) {
        aiReplyText = data.candidates[0].content.parts[0].text;
      }
    } catch (err: any) {
      clearTimeout(timeoutId);
      logger.warn({ err: err.message }, 'Gemini timed out — using deterministic stage fallback');
      // aiReplyText already set above from the stage detection — use it as fallback
    }

    // Clean up and sanitize for Amazon Polly and TwiML XML
    aiReplyText = sanitizeForSpeech(aiReplyText);

    // Store AI reply in memory buffer
    callBuffer.turns.push({ role: 'ai', text: aiReplyText, timestamp: Date.now() });

    // 5. Save AI reply to DB & run lead extraction asynchronously in background
    setImmediate(async () => {
      try {
        const c = await prisma.call.findFirst({ where: { twilioCallSid: callSid } });
        if (c) {
          await prisma.conversationMessage.create({
            data: { callId: c.id, role: 'ai', text: aiReplyText }
          });
        }

        // Background structured extraction & lead qualification
        const extractPrompt = `Extract any mentioned lead details from this statement: "${speechResult}". Return JSON with keys: productType, productCount, budget, timeline, features, decisionMaker, isHotLead (boolean). If not mentioned, omit the key.`;
        const extRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${env.GEMINI_API_KEY}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: extractPrompt }] }],
            generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 100 }
          })
        });
        const extData = await extRes.json();
        if (extData.candidates && extData.candidates[0]?.content?.parts[0]?.text) {
          const parsedData = JSON.parse(extData.candidates[0].content.parts[0].text);
          const { ToolHandler } = await import('../agent/tool-handler');
          const toolHandler = new ToolHandler(leadId || c?.leadId || null, callSid);
          await toolHandler.handleUpdateLead(parsedData);
          await toolHandler.handleClassifyLead();

          if (userTurnCount >= 5 && (parsedData.isHotLead || isQuoteOrSend || lowerSpeech.includes('bhej'))) {
            const leadRecord = await prisma.lead.findFirst({ where: { id: leadId || c?.leadId || undefined } });
            if (leadRecord?.phone) {
              const { generateCallQuotation } = await import('../agent/quotation-generator');
              const transcript = callBuffer.turns.map(t => `${t.role === 'ai' ? 'Priya' : 'Customer'}: ${t.text}`).join('\n');
              const quotation = await generateCallQuotation(transcript, { ...leadRecord, ...parsedData });

              const { sendWhatsappFollowup } = await import('../integrations/twilio/whatsapp');
              sendWhatsappFollowup(leadRecord.phone, quotation.whatsappMessage).catch(() => {});

              const { sendEmailFollowup } = await import('../integrations/twilio/email');
              sendEmailFollowup(process.env.TARGET_EMAIL || 'adityakumarsingh9031@gmail.com', quotation.summaryText, {
                subject: `Singh Agency: Order Confirmation & Quotation (${quotation.businessType})`,
                html: quotation.emailHtml,
                summary: quotation.summaryText,
              }).catch(() => {});
            }
          }
        }
      } catch (e) {
        logger.warn({ e }, 'Background lead extraction error (non-fatal)');
      }
    });

    // 6. Deliver audio reply and gather next turn immediately with barge-in
    const gather = twiml.gather({
      input: ['speech'],
      action: `${httpUrl}/twilio/respond?leadId=${encodeURIComponent(leadId)}`,
      method: 'POST',
      speechTimeout: 'auto',
      timeout: 8,
      language: 'en-IN',
      hints: 'website, ecommerce, online store, shopify, products, payment gateway, budget, lakh, quotation, quote, whatsapp, email, mail, send, share, yes, no',
      bargeIn: true,
    });
    gather.say({ voice: 'Polly.Aditi' }, aiReplyText);

    // Fallback if no speech detected (never drop the call abruptly)
    twiml.say({ voice: 'Polly.Aditi' }, "Are you still there?");
    twiml.redirect({ method: 'POST' }, `${httpUrl}/twilio/respond?leadId=${encodeURIComponent(leadId)}`);

    reply.type('text/xml').send(twiml.toString());
  });

  fastify.post('/stream-status', async (request: FastifyRequest, reply: FastifyReply) => {
    logger.info({ body: request.body, query: request.query }, 'TWILIO STREAM STATUS CALLBACK RECEIVED');
    reply.send('OK');
  });

  fastify.post('/status', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as any;
    logger.info({ status: body.CallStatus, callSid: body.CallSid }, 'Twilio call status update');

    try {
      const callStatus = body.CallStatus; // 'completed', 'in-progress', etc
      const callSid = body.CallSid;

      if (callStatus === 'completed' || callStatus === 'failed' || callStatus === 'no-answer') {
        const updatedCall = await prisma.call.findFirst({
          where: { twilioCallSid: callSid },
          include: { lead: true },
        });

        await prisma.call.updateMany({
          where: { twilioCallSid: callSid },
          data: {
            endedAt: new Date(),
            duration: body.CallDuration ? parseInt(body.CallDuration, 10) : undefined,
          }
        });

        // Clean up in-memory call buffer
        if (callSid) {
          activeCallBuffers.delete(callSid);
        }

        // Fire post-call followups (WhatsApp + Email) with full context (async, non-blocking)
        if (callStatus === 'completed' && updatedCall && updatedCall.lead) {
          setImmediate(async () => {
            try {
              const messages = await prisma.conversationMessage.findMany({
                where: { callId: updatedCall.id },
                orderBy: { timestamp: 'asc' },
              });
              const transcript = messages.map(m => `${m.role === 'ai' ? 'Priya' : 'Customer'}: ${m.text}`).join('\n');
              const { generateCallQuotation } = await import('../agent/quotation-generator');
              const quotation = await generateCallQuotation(transcript, updatedCall.lead);

              await prisma.call.update({
                where: { id: updatedCall.id },
                data: { finalSummary: quotation.whatsappMessage }
              });

              await sendPostCallWhatsapp(updatedCall.id, updatedCall.lead.phone);

              const { sendEmailFollowup } = await import('../integrations/twilio/email');
              await sendEmailFollowup(
                process.env.TARGET_EMAIL || 'adityakumarsingh9031@gmail.com',
                quotation.summaryText,
                {
                  subject: `Singh Agency: Order Confirmation & Quotation (${quotation.businessType})`,
                  html: quotation.emailHtml,
                  summary: quotation.summaryText,
                }
              );
            } catch (err) {
              logger.warn({ err }, 'Post-call followup error (non-fatal)');
            }
          });
        }
      }
    } catch (err) {
      logger.error({ err }, 'Error updating call status');
    }

    reply.send('OK');
  });

  fastify.post('/whatsapp/status', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as any;
    logger.info({ status: body.MessageStatus, sid: body.MessageSid }, 'WhatsApp status update');
    reply.send('OK');
  });
}
