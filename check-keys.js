const dotenv = require('dotenv');
dotenv.config();

async function run() {
  const report = {};

  // 1. Prisma DB
  console.log('1. Testing Database (Prisma/PostgreSQL)...');
  try {
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    const t0 = Date.now();
    await prisma.$connect();
    const leads = await prisma.lead.count();
    const calls = await prisma.call.count();
    report.database = {
      status: 'OK',
      latencyMs: Date.now() - t0,
      leadCount: leads,
      callCount: calls,
      host: (process.env.DATABASE_URL.split('@')[1] || '').split('/')[0] || 'hidden'
    };
    await prisma.$disconnect();
  } catch (e) {
    report.database = { status: 'FAILED', error: e.message };
  }

  // 2. Redis / Upstash
  console.log('2. Testing Redis (ioredis)...');
  try {
    const Redis = require('ioredis');
    const redis = new Redis(process.env.REDIS_URL, { connectTimeout: 5000, maxRetriesPerRequest: 1 });
    const t0 = Date.now();
    const ping = await redis.ping();
    report.redis = {
      status: 'OK',
      latencyMs: Date.now() - t0,
      ping,
      host: (process.env.REDIS_URL.split('@')[1] || '').split(':')[0] || 'hidden'
    };
    await redis.quit();
  } catch (e) {
    report.redis = { status: 'FAILED', error: e.message };
  }

  // Upstash REST if configured
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    console.log('2b. Testing Upstash REST API...');
    try {
      const res = await fetch(process.env.UPSTASH_REDIS_REST_URL + '/ping', {
        headers: { Authorization: 'Bearer ' + process.env.UPSTASH_REDIS_REST_TOKEN }
      });
      const d = await res.json();
      report.upstashRest = { status: 'OK', response: d };
    } catch (e) {
      report.upstashRest = { status: 'FAILED', error: e.message };
    }
  }

  // 3. Twilio
  console.log('3. Testing Twilio API...');
  try {
    const twilio = require('twilio');
    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    const t0 = Date.now();
    const acc = await client.api.v2010.accounts(process.env.TWILIO_ACCOUNT_SID).fetch();
    const numbers = await client.incomingPhoneNumbers.list({ limit: 5 });
    report.twilio = {
      status: 'OK',
      latencyMs: Date.now() - t0,
      friendlyName: acc.friendlyName,
      accountStatus: acc.status,
      type: acc.type,
      configuredNumber: process.env.TWILIO_PHONE_NUMBER,
      activeNumbersOnAccount: numbers.map(n => n.phoneNumber)
    };
  } catch (e) {
    report.twilio = { status: 'FAILED', error: e.message, code: e.code, httpStatus: e.status };
  }

  // 4. Gemini API Key
  console.log('4. Testing Google Gemini API Key...');
  try {
    const t0 = Date.now();
    const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models?key=' + process.env.GEMINI_API_KEY);
    const d = await res.json();
    if (d.models) {
      report.gemini = {
        status: 'OK',
        latencyMs: Date.now() - t0,
        availableModelsCount: d.models.length,
        modelsSample: d.models.map(m => m.name.replace('models/', '')).slice(0, 10)
      };
    } else {
      report.gemini = { status: 'FAILED', error: d.error };
    }
  } catch (e) {
    report.gemini = { status: 'FAILED', error: e.message };
  }

  // 5. Ngrok SDK
  console.log('5. Testing Ngrok SDK...');
  try {
    const ngrok = require('@ngrok/ngrok');
    report.ngrok = { status: 'OK (SDK Ready)' };
  } catch (e) {
    report.ngrok = { status: 'FAILED', error: e.message };
  }

  console.log('\n================ CREDENTIALS CHECK REPORT ================');
  console.log(JSON.stringify(report, null, 2));
}

run().catch(console.error);
