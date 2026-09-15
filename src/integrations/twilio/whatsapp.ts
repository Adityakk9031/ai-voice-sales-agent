import twilio from 'twilio';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';
import { prisma } from '../../db/client';

const client = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);

function getWhatsAppSender(): string {
  if (env.TWILIO_WHATSAPP_FROM) {
    return env.TWILIO_WHATSAPP_FROM.startsWith('whatsapp:')
      ? env.TWILIO_WHATSAPP_FROM
      : `whatsapp:${env.TWILIO_WHATSAPP_FROM}`;
  }
  return 'whatsapp:+17372212163';
}

/**
 * Sends WhatsApp follow-up. Falls back to SMS if WhatsApp fails (trial limitation).
 */
export async function sendWhatsappFollowup(toPhone: string, summary: string) {
  const from = getWhatsAppSender();
  const cleanPhone = toPhone.replace('whatsapp:', '');
  const to = `whatsapp:${cleanPhone}`;
  const body = buildMessageBody(summary);
  logger.info({ to, from }, 'Sending WhatsApp followup');

  // Attempt 1: WhatsApp free-form body
  try {
    const result = await client.messages.create({ from, to, body });
    logger.info({ sid: result.sid, to }, 'WhatsApp sent successfully');
    await recordWhatsappAction(cleanPhone, summary, { sid: result.sid, method: 'whatsapp' });
    return { success: true, sid: result.sid };
  } catch (waErr: any) {
    logger.warn({ err: waErr.message, code: waErr.code }, 'WhatsApp failed, falling back to SMS');
  }

  // Attempt 2: ContentSid template (if configured)
  if (env.TWILIO_WHATSAPP_CONTENT_SID) {
    try {
      const result = await client.messages.create({
        from, to,
        contentSid: env.TWILIO_WHATSAPP_CONTENT_SID,
        contentVariables: JSON.stringify({ "1": "Singh Agency Quotation", "2": summary.substring(0, 100) }),
      });
      logger.info({ sid: result.sid }, 'WhatsApp sent via ContentSid');
      await recordWhatsappAction(cleanPhone, summary, { sid: result.sid, method: 'contentSid' });
      return { success: true, sid: result.sid };
    } catch (csErr: any) {
      logger.warn({ err: csErr.message }, 'ContentSid also failed, trying SMS');
    }
  }

  // Attempt 3: Plain SMS fallback (always works on trial for verified numbers)
  try {
    const smsBody = buildSmsBody(summary);
    const result = await client.messages.create({
      from: env.TWILIO_PHONE_NUMBER || '+17372212163',
      to: cleanPhone,
      body: smsBody,
    });
    logger.info({ sid: result.sid, to: cleanPhone }, 'Quotation sent via SMS fallback');
    await recordWhatsappAction(cleanPhone, summary, { sid: result.sid, method: 'sms_fallback' });
    return { success: true, sid: result.sid, channel: 'sms' };
  } catch (smsErr: any) {
    logger.error({ err: smsErr.message }, 'SMS fallback also failed');
    await recordWhatsappAction(cleanPhone, summary, { error: smsErr.message }, 'failed');
    return { success: false, error: smsErr.message };
  }
}

async function recordWhatsappAction(toPhone: string, summary: string, resultData: any, status: string = 'completed') {
  try {
    const cleanPhone = toPhone.replace('whatsapp:', '');
    const lead = await prisma.lead.findFirst({ where: { phone: cleanPhone } });
    if (lead) {
      const activeCall = await prisma.call.findFirst({ where: { leadId: lead.id }, orderBy: { startedAt: 'desc' } });
      if (activeCall) {
        await prisma.action.create({
          data: {
            callId: activeCall.id,
            type: 'send_whatsapp',
            status,
            payload: { summary, to: cleanPhone },
            result: resultData,
          }
        });
      }
    }
  } catch (dbErr) {
    logger.error({ dbErr }, 'Failed to record WhatsApp action in DB');
  }
}

/**
/**
 * Sends post-call follow-up. WhatsApp first, falls back to SMS if WhatsApp fails.
 */
export async function sendPostCallWhatsapp(callId: string, toPhone: string) {
  const from = getWhatsAppSender();
  const cleanPhone = toPhone.replace('whatsapp:', '');
  const to = `whatsapp:${cleanPhone}`;

  try {
    const call = await prisma.call.findUnique({
      where: { id: callId },
      include: { messages: { orderBy: { timestamp: 'asc' } }, lead: true },
    });
    if (!call) return;

    const lead = call.lead;
    const contextLines: string[] = [];
    if (lead.productType) contextLines.push(`• Business: ${lead.productType}`);
    if (lead.productCount) contextLines.push(`• Products: ~${lead.productCount}`);
    if (lead.budget) contextLines.push(`• Budget: ${lead.budget}`);
    if (lead.timeline) contextLines.push(`• Timeline: ${lead.timeline}`);
    if (lead.requestedFeatures) contextLines.push(`• Features: ${lead.requestedFeatures}`);

    const summary = contextLines.join('\n');
    const waBody = buildMessageBody(summary, call.finalSummary ?? undefined);

    // Attempt 1: WhatsApp
    try {
      const result = await client.messages.create({ from, to, body: waBody });
      logger.info({ sid: result.sid, to }, 'Post-call WhatsApp sent');
      return;
    } catch (waErr: any) {
      logger.warn({ err: waErr.message }, 'Post-call WhatsApp failed, trying SMS...');
    }

    // Attempt 2: ContentSid template
    if (env.TWILIO_WHATSAPP_CONTENT_SID) {
      try {
        const result = await client.messages.create({
          from, to,
          contentSid: env.TWILIO_WHATSAPP_CONTENT_SID,
          contentVariables: JSON.stringify({
            "1": `Singh Agency - ${lead.productType || 'Website'}`,
            "2": `${lead.budget || '35,000 rupees'} package`
          }),
        });
        logger.info({ sid: result.sid }, 'Post-call sent via ContentSid');
        return;
      } catch (csErr: any) {
        logger.warn({ err: csErr.message }, 'ContentSid failed, trying SMS');
      }
    }

    // Attempt 3: SMS fallback
    const smsBody = buildSmsBody(summary, call.finalSummary ?? undefined);
    const result = await client.messages.create({
      from: env.TWILIO_PHONE_NUMBER || '+17372212163',
      to: cleanPhone,
      body: smsBody,
    });
    logger.info({ sid: result.sid, to: cleanPhone }, 'Post-call quotation sent via SMS');
  } catch (err: any) {
    logger.warn({ err: err.message, code: err.code }, 'Post-call followup failed (non-fatal)');
  }
}

function buildMessageBody(summary: string, extraContext?: string): string {
  const lines = [
    `*Singh Agency — Quotation & Order Confirmation* 🚀`,
    ``,
    `Hi! Great speaking with you. Here are the details from our call:`,
    ``,
    summary || '(Project details being prepared)',
    ``,
  ];
  if (extraContext) { lines.push(extraContext); lines.push(''); }
  lines.push(`📞 Contact Priya: ${env.MY_MOBILE_NUMBER}`);
  lines.push(`Singh Agency — Premium E-Commerce Websites`);
  lines.push(`Looking forward to building your online store! 🚀`);
  return lines.join('\n');
}

function buildSmsBody(summary: string, extraContext?: string): string {
  // SMS: keep under 160 chars per segment, no special markdown
  const lines = [
    `Singh Agency Quotation`,
    summary || 'Custom E-Commerce Store Package',
  ];
  if (extraContext) lines.push(extraContext.substring(0, 200));
  lines.push(`Contact Priya: ${env.MY_MOBILE_NUMBER}`);
  return lines.join('\n').substring(0, 1500);
}

