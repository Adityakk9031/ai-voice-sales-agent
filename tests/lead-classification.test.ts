import { describe, it, expect, vi } from 'vitest';
import { ToolHandler } from '../src/agent/tool-handler';

// Mock prisma client
vi.mock('../src/db/client', () => ({
  prisma: {
    lead: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    call: {
      findUnique: vi.fn(),
    },
    action: {
      create: vi.fn(),
    }
  }
}));

import { prisma } from '../src/db/client';

describe('Lead Classification', () => {
  it('classifies lead as HOT with score >= 4', async () => {
    vi.mocked(prisma.lead.findUnique).mockResolvedValue({
      id: '123',
      budget: '2 lakh',
      timeline: 'before diwali',
      productType: 'electronics',
      requestedFeatures: 'payments',
    } as any);

    const handler = new ToolHandler('123', 'call-sid');
    const response = await handler.handleToolCall([{ id: 't1', name: 'classify_lead', args: {} }]);
    
    expect(response[0].response.classification).toBe('HOT');
    expect(response[0].response.score).toBeGreaterThanOrEqual(4);
  });

  it('classifies lead as COLD with score < 2', async () => {
    vi.mocked(prisma.lead.findUnique).mockResolvedValue({
      id: '123',
      productType: 'shoes',
    } as any);

    const handler = new ToolHandler('123', 'call-sid');
    const response = await handler.handleToolCall([{ id: 't1', name: 'classify_lead', args: {} }]);
    
    expect(response[0].response.classification).toBe('COLD');
    expect(response[0].response.score).toBeLessThan(2);
  });
});
