import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  TWILIO_ACCOUNT_SID: z.string().min(1, "TWILIO_ACCOUNT_SID is required"),
  TWILIO_AUTH_TOKEN: z.string().min(1, "TWILIO_AUTH_TOKEN is required"),
  TWILIO_PHONE_NUMBER: z.string().min(1, "TWILIO_PHONE_NUMBER is required"),
  TARGET_PHONE_NUMBER: z.string().min(1, "TARGET_PHONE_NUMBER is required"),
  TWILIO_WHATSAPP_FROM: z.string().min(1, "TWILIO_WHATSAPP_FROM is required"),
  TWILIO_WHATSAPP_TO: z.string().min(1, "TWILIO_WHATSAPP_TO is required"),
  TWILIO_WHATSAPP_CONTENT_SID: z.string().optional(),
  GEMINI_API_KEY: z.string().min(1, "GEMINI_API_KEY is required"),
  GEMINI_LIVE_MODEL: z.string().default('gemini-3.1-flash-live-preview'),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  UPSTASH_REDIS_REST_URL: z.string().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
  REDIS_URL: z.string().min(1, "REDIS_URL is required (for BullMQ)"),
  PUBLIC_BASE_URL: z.string().url("PUBLIC_BASE_URL must be a valid URL"),
  PUBLIC_WSS_URL: z.string().url("PUBLIC_WSS_URL must be a valid URL"),
  RESUME_URL: z.string().url("RESUME_URL must be a valid URL"),
  ARCHITECTURE_IMAGE_URL: z.string().url("ARCHITECTURE_IMAGE_URL must be a valid URL"),
  MY_MOBILE_NUMBER: z.string().min(1, "MY_MOBILE_NUMBER is required"),
  TIMEZONE: z.string().default('Asia/Kolkata'),
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development')
});

const _env = envSchema.safeParse(process.env);

if (!_env.success) {
  console.error("❌ Invalid environment variables:");
  console.error(_env.error.format());
  process.exit(1);
}

export const env = _env.data;
