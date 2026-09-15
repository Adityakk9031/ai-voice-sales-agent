import { logger } from '../utils/logger';
import { prisma } from '../db/client';
import { sendWhatsappFollowup } from '../integrations/twilio/whatsapp';
import { scheduleCallbackJob } from '../scheduler/queue';
import { parseCallbackTime } from '../scheduler/time-parser';

export class ToolHandler {
  private leadId: string | null;
  private callSid: string;

  constructor(leadId: string | null, callSid: string) {
    this.leadId = leadId;
    this.callSid = callSid;
  }

  public async handleToolCall(functionCalls: any[]): Promise<any[]> {
    const responses = [];

    for (const call of functionCalls) {
      const name = call.name;
      const args = call.args || {};
      logger.info({ name, args, callSid: this.callSid }, 'Tool call received');

      let result: any = {};
      
      try {
        if (name === 'update_lead' && this.leadId) {
          result = await this.handleUpdateLead(args);
        } else if (name === 'classify_lead' && this.leadId) {
          result = await this.handleClassifyLead();
        } else if (name === 'send_whatsapp' && this.leadId) {
          result = await this.handleSendWhatsapp(args);
        } else if (name === 'send_email') {
          const { sendEmailFollowup } = await import('../integrations/twilio/email');
          result = await sendEmailFollowup(args.email, args.summary);
        } else if (name === 'schedule_callback' && this.leadId) {
          result = await this.handleScheduleCallback(args);
        } else if (name === 'end_call') {
          result = { status: 'call ending' };
          // Actually hang up the Twilio call
          try {
            const client = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
            await client.calls(this.callSid).update({ status: 'completed' });
          } catch (e) {
            logger.error({ err: e }, 'Failed to hang up Twilio call');
          }
        } else {
          result = { error: 'Unknown tool or lead ID missing' };
        }

        // Store action
        if (this.leadId) {
          const callDb = await prisma.call.findUnique({ where: { twilioCallSid: this.callSid } });
          if (callDb) {
            await prisma.action.create({
              data: {
                callId: callDb.id,
                type: name,
                status: 'completed',
                payload: args,
                result: result,
              }
            });
          }
        }
      } catch (err: any) {
        logger.error({ err, name }, 'Error executing tool');
        result = { error: err.message };
      }

      responses.push({
        id: call.id,
        name: name,
        response: result
      });
    }

    return responses;
  }

  public async handleUpdateLead(args: any) {
    try {
      if (!this.leadId) return { success: false, reason: 'No leadId' };
      const dataToUpdate: any = {};
      if (args.productType) {
        dataToUpdate.productType = Array.isArray(args.productType) 
          ? args.productType.join(', ') 
          : String(args.productType);
      }
      if (args.productCount !== undefined && args.productCount !== null) {
        const parsedCount = parseInt(String(args.productCount).replace(/\D/g, ''), 10);
        if (!isNaN(parsedCount)) {
          dataToUpdate.productCount = parsedCount;
        }
      }
      if (args.budget) dataToUpdate.budget = args.budget;
      if (args.timeline) dataToUpdate.timeline = args.timeline;
      if (args.features) dataToUpdate.requestedFeatures = args.features;
      if (args.decisionMaker) dataToUpdate.decisionMaker = args.decisionMaker;
      if (args.blockers) dataToUpdate.blockers = args.blockers;

      if (Object.keys(dataToUpdate).length > 0) {
        await prisma.lead.updateMany({
          where: { id: this.leadId },
          data: dataToUpdate
        });
      }
      return { success: true };
    } catch (err: any) {
      logger.warn({ err }, 'Safe ignore lead update error');
      return { success: false, error: err.message };
    }
  }

  public async handleClassifyLead() {
    try {
      if (!this.leadId) return { error: 'Lead not found' };
      const lead = await prisma.lead.findFirst({ where: { id: this.leadId } });
      if (!lead) return { error: 'Lead not found' };

      let score = 0;
      const signals = [];
      const blockers = [];

      if (lead.budget) { score += 2; signals.push('Has budget'); }
      if (lead.timeline) { score += 2; signals.push('Has timeline'); }
      if (lead.productType) { score += 1; signals.push('Knows product'); }
      if (lead.requestedFeatures) { score += 2; signals.push('Detailed features'); }
      
      if (lead.blockers) { score -= 2; blockers.push('Has blockers'); }

      let classification = 'COLD';
      if (score >= 4) classification = 'HOT';
      else if (score >= 2) classification = 'WARM';

      await prisma.lead.updateMany({
        where: { id: this.leadId },
        data: {
          intent: classification,
          intentScore: score,
          intentReason: signals.join(', '),
        }
      });

      return { intent: classification, score };
    } catch (err: any) {
      logger.warn({ err }, 'Safe ignore classify lead error');
      return { intent: 'WARM', score: 2 };
    }
  }

  private async handleSendWhatsapp(args: any) {
    const lead = await prisma.lead.findUnique({ where: { id: this.leadId! } });
    if (!lead || !lead.phone) return { error: 'Lead/phone not found' };

    // Idempotency check: don't send mid-call whatsapp twice for the same call
    const callDb = await prisma.call.findUnique({ where: { twilioCallSid: this.callSid }, include: { actions: true } });
    if (callDb && callDb.actions.some((a: any) => a.type === 'send_whatsapp' && a.status === 'completed')) {
      return { success: true, note: 'Already sent during this call' };
    }

    await sendWhatsappFollowup(lead.phone, args.summary);
    return { success: true };
  }

  private async handleScheduleCallback(args: any) {
    if (!args.requestedTime) return { error: 'Missing requestedTime' };
    
    // Use LLM-powered natural language time parser
    const scheduledAt = await parseCallbackTime(args.requestedTime);

    const callDb = await prisma.call.findUnique({ where: { twilioCallSid: this.callSid } });
    
    await prisma.callback.create({
      data: {
        leadId: this.leadId!,
        callId: callDb!.id,
        requestedPhrase: args.requestedTime,
        scheduledAt,
        timezone: 'Asia/Kolkata',
        status: 'pending'
      }
    });

    await scheduleCallbackJob(this.leadId!, scheduledAt);
    
    return { success: true, scheduledAt: scheduledAt.toISOString() };
  }
}
