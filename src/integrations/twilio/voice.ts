import twilio from 'twilio';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';
import fs from 'fs';
import path from 'path';

function getTunnelBaseUrl(): string {
  try {
    const tunnelFile = path.join(process.cwd(), 'tunnel-url.json');
    if (fs.existsSync(tunnelFile)) {
      const data = JSON.parse(fs.readFileSync(tunnelFile, 'utf8'));
      if (data.url && data.url.startsWith('https://')) return data.url;
    }
  } catch {}
  return env.PUBLIC_BASE_URL;
}

export async function initiateOutboundCall(targetPhone: string, leadId: string) {
  const client = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
  
  const baseUrl = getTunnelBaseUrl();
  const url = `${baseUrl}/twilio/voice?leadId=${encodeURIComponent(leadId)}`;
  logger.info({ url }, 'Creating outbound call with URL');

  const call = await client.calls.create({
    to: targetPhone,
    from: env.TWILIO_PHONE_NUMBER,
    url: url,
  });

  logger.info({ callSid: call.sid, to: targetPhone, leadId, url }, 'Outbound call initiated');
  return call;
}
