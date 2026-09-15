import { GoogleGenAI } from '@google/genai';
import { env } from '../config/env';
import { logger } from '../utils/logger';

/**
 * Parses natural-language time phrases like "tomorrow morning",
 * "call me at 6 tomorrow", "Saturday at 3", "next Monday evening"
 * into a concrete Date object in Asia/Kolkata timezone.
 */
export async function parseCallbackTime(phrase: string): Promise<Date> {
  const now = new Date();
  const nowIST = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));

  const prompt = `
You are a time parser. The current date and time in Asia/Kolkata timezone is:
${nowIST.toISOString().replace('T', ' ').slice(0, 19)} IST

The user said: "${phrase}"

Convert this to an exact date and time in Asia/Kolkata timezone.
Rules:
- "morning" = 09:00
- "afternoon" = 14:00
- "evening" = 18:00
- "night" = 20:00
- If no time given, use 10:00 AM
- "tomorrow" = next calendar day from the current date above
- "next Monday/Tuesday/etc" = next occurrence of that weekday

Respond with ONLY a JSON object like this, no explanation:
{"year": 2026, "month": 8, "day": 26, "hour": 9, "minute": 0}
`;

  try {
    const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: [{ role: 'user', parts: [{ text: prompt }] }]
    });

    const text = response.text?.trim() ?? '';
    const json = JSON.parse(text.replace(/```json|```/g, '').trim());
    const { year, month, day, hour, minute } = json;

    // Construct date in IST
    const istString = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}T${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}:00+05:30`;
    const parsed = new Date(istString);

    if (isNaN(parsed.getTime())) throw new Error('Invalid date parsed');
    logger.info({ phrase, parsed: parsed.toISOString() }, 'Callback time parsed');
    return parsed;
  } catch (err: any) {
    logger.error({ err, phrase }, 'Failed to parse callback time, defaulting to +24h');
    // Safe fallback: schedule for next day 10 AM IST
    const fallback = new Date(nowIST);
    fallback.setDate(fallback.getDate() + 1);
    fallback.setHours(10, 0, 0, 0);
    return fallback;
  }
}
