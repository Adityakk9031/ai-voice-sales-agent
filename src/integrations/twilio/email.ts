import { env } from '../../config/env';
import { logger } from '../../utils/logger';
import { prisma } from '../../db/client';
import nodemailer from 'nodemailer';

export interface EmailSendResult {
  success: boolean;
  operationId?: string;
  error?: string;
  provider?: string;
}

export interface EmailOptions {
  subject?: string;
  html?: string;
  summary?: string;
}

/**
 * Sends a confirmation / quotation email.
 * If SMTP (e.g. Gmail) or Resend is configured in .env, sends rich custom HTML quotation.
 * Otherwise, falls back to Twilio's approved trial email template to guarantee delivery.
 */
export async function sendEmailFollowup(
  toEmail: string = process.env.TARGET_EMAIL || 'adityakumarsingh9031@gmail.com',
  summary: string = '',
  options?: EmailOptions
): Promise<EmailSendResult> {
  const subject = options?.subject || 'Singh Agency: Order Confirmation & E-Commerce Quotation';
  const customHtml = options?.html;

  // 1. Try SMTP (Gmail or custom SMTP) if configured
  if (process.env.SMTP_USER && process.env.SMTP_PASS) {
    try {
      logger.info({ to: toEmail }, 'Sending email via SMTP (Nodemailer)');
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.SMTP_PORT || '465', 10),
        secure: (process.env.SMTP_SECURE || 'true') === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });

      const info = await transporter.sendMail({
        from: `"Singh Agency" <${process.env.SMTP_USER}>`,
        to: toEmail,
        subject,
        html: customHtml || `<p>${summary || 'Your quotation and order confirmation from Singh Agency.'}</p>`,
      });

      logger.info({ messageId: info.messageId, to: toEmail }, 'Email sent successfully via SMTP');
      await recordEmailAction(toEmail, summary, { messageId: info.messageId, provider: 'smtp' });
      return { success: true, operationId: info.messageId, provider: 'smtp' };
    } catch (smtpErr: any) {
      logger.warn({ smtpErr: smtpErr.message }, 'SMTP send failed, attempting fallback');
    }
  }

  // 2. Try Resend API if configured
  if (process.env.RESEND_API_KEY) {
    try {
      logger.info({ to: toEmail }, 'Sending email via Resend API');
      const resendRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: process.env.RESEND_FROM || 'Singh Agency <onboarding@resend.dev>',
          to: [toEmail],
          subject,
          html: customHtml || `<p>${summary || 'Your quotation and order confirmation from Singh Agency.'}</p>`,
        }),
      });

      const resendData: any = await resendRes.json();
      if (resendRes.ok) {
        logger.info({ id: resendData.id, to: toEmail }, 'Email sent successfully via Resend');
        await recordEmailAction(toEmail, summary, { id: resendData.id, provider: 'resend' });
        return { success: true, operationId: resendData.id, provider: 'resend' };
      }
      logger.warn({ resendData }, 'Resend API send failed, falling back to Twilio');
    } catch (resendErr: any) {
      logger.warn({ resendErr: resendErr.message }, 'Resend failed, falling back to Twilio');
    }
  }

  // 3. Fallback: Twilio Trial Email (Guaranteed trial-approved template)
  const accountSid = env.TWILIO_ACCOUNT_SID;
  const authToken = env.TWILIO_AUTH_TOKEN;
  const credentials = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
  const fromAddress = `${accountSid}@twilio.email`;

  const twilioApprovedHtml =
    `<p><b>This is a test email from Twilio.</b></p>` +
    `<h2>Thank you for your order!</h2>` +
    `<p>We are excited to let you know that your order has been confirmed and is being processed.</p>` +
    `<p>You will receive a shipping confirmation email once your items are on their way.</p>` +
    `<p>Order Number: #12345</p>` +
    `<p>Thank you for shopping with us!</p>` +
    `<p>Best regards,<br/>The Team</p>`;

  const payload = {
    from: {
      address: fromAddress,
      name: 'Singh Agency via Twilio',
    },
    to: [{ address: toEmail }],
    content: {
      subject: 'Your Order Has Been Confirmed!',
      html: twilioApprovedHtml,
    },
  };

  logger.info({ to: toEmail, from: fromAddress }, 'Dispatching Twilio approved email confirmation');

  try {
    const res = await fetch('https://comms.twilio.com/v1/Emails', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data: any = await res.json();

    if (!res.ok) {
      logger.warn({ status: res.status, data }, 'Twilio email send failed');
      return { success: false, error: data?.message || 'Email send failed' };
    }

    logger.info({ operationId: data.operationId, to: toEmail }, 'Twilio email sent successfully');
    await recordEmailAction(toEmail, summary, data);

    return { success: true, operationId: data.operationId, provider: 'twilio' };
  } catch (err: any) {
    logger.error({ err: err.message }, 'Error sending Twilio email');
    return { success: false, error: err.message };
  }
}

async function recordEmailAction(toEmail: string, summary: string, resultData: any) {
  try {
    const activeCall = await prisma.call.findFirst({
      orderBy: { startedAt: 'desc' },
    });
    if (activeCall) {
      await prisma.action.create({
        data: {
          callId: activeCall.id,
          type: 'send_email',
          status: 'completed',
          payload: { to: toEmail, summary },
          result: resultData,
        },
      });
    }
  } catch (dbErr: any) {
    logger.warn({ dbErr: dbErr.message }, 'Non-fatal: Failed to save email action to DB');
  }
}
