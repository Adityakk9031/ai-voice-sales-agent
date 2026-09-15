# 🎙️ Singh Agency — Autonomous AI Voice Sales Agent Prototype

[![Node.js](https://img.shields.io/badge/Node.js-20+-68a063?style=for-the-badge&logo=node.js)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178c6?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org)
[![Fastify](https://img.shields.io/badge/Fastify-5.x-000000?style=for-the-badge&logo=fastify)](https://fastify.dev)
[![Google Gemini](https://img.shields.io/badge/Google%20Gemini-Flash%20Lite%20%2F%20Live-4285f4?style=for-the-badge&logo=google)](https://deepmind.google/technologies/gemini/)
[![Twilio](https://img.shields.io/badge/Twilio-Voice%20%26%20WhatsApp-f22f46?style=for-the-badge&logo=twilio)](https://www.twilio.com)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Supabase-336791?style=for-the-badge&logo=postgresql)](https://postgresql.org)
[![Redis](https://img.shields.io/badge/Redis-Upstash-dc382d?style=for-the-badge&logo=redis)](https://redis.io)

An autonomous, multi-channel AI Voice Sales Agent prototype built for **Singh Agency**. The agent operates as **Priya**, an executive sales representative who conducts outbound discovery calls with prospective e-commerce clients, qualifies their requirements in real-time, generates dynamic personalized project quotations, and delivers instant confirmations across Email and WhatsApp.

---

## 🌟 Key Features

### 1. Conversational Voice Engine
- **Indian English & Hinglish Speech Optimization**: Uses Twilio Voice paired with Amazon Polly's Polly.Aditi voice synthesizer for natural Indian accent cadence.
- **Sub-Second Latency Guard**: 3.5-second timeout wrapper with dynamic deterministic fallbacks ensures Priya never stutters or drops calls even during upstream LLM latency spikes.
- **Speech Sanitization**: Automatic real-time phonetic normalizer converts currency notations (e.g., ₹35,000 → 35,000 rupees) to prevent XML parser crashes in TwiML speech engines.

### 2. Context-Aware Multi-Stage Discovery
Rather than rigid turn counters, the agent evaluates holistic conversation context across all dialogue turns:
1. **Greeting & Introduction**: Warm check-in and pitch setup.
2. **Product Discovery**: Listens to the customer's catalog type (apparel, footwear, electronics, food, etc.).
3. **Value Proposition Pitch**: Highlights Singh Agency's mobile-first stores, payment gateways, and WhatsApp ordering integrations.
4. **Budget Consultation**: Introduces entry packages starting at ₹35,000 and probes customer budget boundaries.
5. **Specification Gathering**: Captures product SKU volume, COD necessity, and custom requirements.
6. **Closing & Quotation Confirmation**: Secures client consent to dispatch formal quotation documents.

### 3. AI Dynamic Quotation Generator
- Leverages Google Gemini to synthesize unstructured telephone transcripts into tailored commercial proposals.
- Generates structured JSON containing business categorization, investment tiers, deliverable bullet points, estimated turn-around time, and customer-facing executive summaries.

### 4. Resilient Multi-Channel Dispatch Engine
- **Email Follow-up**: Cascading delivery system:
  1. Primary: SMTP / Custom Mailer
  2. Secondary: **Resend API** for HTML email quotations
  3. Tertiary: Twilio Trial Email template fallback
- **WhatsApp Follow-up**: Mid-call and post-call notifications delivering clean markdown breakdowns directly to the client's mobile chat.
- **SMS Failover**: Graceful failover to Twilio SMS when WhatsApp sandbox opt-in limits are encountered.

### 5. Automated Scheduling & Lead Intelligence
- **BullMQ + Redis Task Queue**: Handles scheduled follow-ups and deferred callback reminders.
- **Intent Classification**: Classifies leads into **HOT**, **WARM**, or **COLD** categories stored in PostgreSQL with full call recordings and message histories.

---

## 🏗️ System Architecture

```mermaid
flowchart TD
    Customer([👤 Customer Phone])
    Twilio[📞 Twilio Voice / Media Stream]
    Server[⚡ Fastify TypeScript Server]
    Gemini[🧠 Google Gemini AI]
    DB[(🗄️ PostgreSQL - Supabase)]
    Redis[(⚡ Redis - Upstash)]
    Worker[⏰ BullMQ Callback Worker]
    Resend[✉️ Resend / SMTP Email]
    WhatsApp[💬 Twilio WhatsApp / SMS]

    Customer <-->|Bidirectional Voice| Twilio
    Twilio <-->|TwiML Webhooks & Streams| Server
    Server <-->|Prompt & Speech Context| Gemini
    Server -->|Persist Calls, Messages, Leads| DB
    Server -->|Queue Callbacks| Redis
    Redis --> Worker
    Worker -->|Execute Follow-up Calls| Twilio
    Server -->|HTML Quotation| Resend
    Server -->|Quotation & Order Alerts| WhatsApp
    Resend -->|Delivery| Customer
    WhatsApp -->|Delivery| Customer
```

---

## 📂 Project Structure

```text
ai-voice-sales-agent/
├── src/
│   ├── agent/
│   │   ├── quotation-generator.ts   # AI quotation synthesis from call transcript
│   │   ├── system-prompt.ts         # Persona, pricing guidelines & Singh Agency pitch
│   │   └── tool-handler.ts          # Structured lead scoring & action execution
│   ├── api/
│   │   ├── calls.ts                 # REST endpoints to initiate & inspect calls
│   │   ├── twilio.ts                # Twilio voice webhooks, speech gather, stage logic
│   │   └── webhooks.ts              # Status callbacks & inbound hooks
│   ├── config/
│   │   └── env.ts                   # Strongly-typed Zod environment validation
│   ├── db/
│   │   └── client.ts                # Prisma ORM PostgreSQL client
│   ├── integrations/
│   │   ├── gemini/
│   │   │   └── live-client.ts       # Gemini Live bidirectional WebSocket integration
│   │   └── twilio/
│   │       ├── email.ts             # Multi-provider email cascade (Resend / SMTP / Twilio)
│   │       ├── twilio-client.ts     # Twilio REST client wrapper
│   │       └── whatsapp.ts          # WhatsApp dispatcher with SMS fallback
│   ├── scheduler/
│   │   ├── callback-queue.ts        # BullMQ queue producer
│   │   └── callback-worker.ts       # BullMQ queue worker process
│   └── server.ts                    # Fastify HTTP + WebSocket application bootstrap
├── scripts/
│   └── trigger-call.ts              # One-command CLI caller for testing and demos
├── prisma/
│   └── schema.prisma                # Leads, Calls, Messages, Actions database schema
├── public/
│   └── architecture.html            # Visual interactive architecture diagram
├── tests/                           # Vitest test suite
├── .env.example                     # Sanitized environment template
└── package.json
```

---

## 🚀 Getting Started

### 1. Prerequisites
- **Node.js**: v20.x or higher
- **PostgreSQL**: Local instance or cloud database (e.g. Supabase, Neon)
- **Redis**: Local instance or cloud Redis (e.g. Upstash)
- **Twilio Account**: Phone number with Voice & WhatsApp capabilities
- **Google Gemini API Key**: From Google AI Studio
- **Resend API Key**: (Optional but recommended) For custom HTML quotation delivery

### 2. Installation
```bash
git clone https://github.com/Adityakk9031/ai-voice-sales-agent.git
cd ai-voice-sales-agent
npm install
```

### 3. Environment Setup
Copy the example environment file and fill in your keys:
```bash
cp .env.example .env
```

Key environment configurations:
```env
# Twilio
TWILIO_ACCOUNT_SID=ACXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_PHONE_NUMBER=+1XXXXXXXXXX
TARGET_PHONE_NUMBER=+91XXXXXXXXXX
TWILIO_WHATSAPP_FROM=whatsapp:+1XXXXXXXXXX

# Google Gemini
GEMINI_API_KEY=AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX

# Database & Cache
DATABASE_URL=postgresql://user:password@host:5432/dbname
REDIS_URL=rediss://default:password@host:6379

# Quotation Email (Resend)
RESEND_API_KEY=re_XXXXXXXXXXXXXXXXXXXXXXXXXXXX
TARGET_EMAIL=adityakumarsingh9031@gmail.com

# Agency Branding
MY_MOBILE_NUMBER=+918809522106
TIMEZONE=Asia/Kolkata
```

### 4. Database Setup
```bash
npm run db:generate
npm run db:migrate
```

### 5. Start the Server & Worker
Open a terminal and start the server:
```bash
npm run dev
```

In a second terminal, start the background BullMQ worker:
```bash
npm run worker
```

### 6. Public Tunnel (for Twilio Webhooks)
Expose port 3000 to the web using ngrok:
```bash
ngrok http 3000
```
Update your Twilio Voice Webhook URL in your Twilio Console or via `.env`:
https://<your-ngrok-subdomain>.ngrok-free.dev/twilio/voice

---

## 📱 Triggering a Call

Trigger an outbound demonstration call using the automated script:
```bash
npm run trigger
```

Alternatively, trigger via REST API:
```bash
curl -X POST http://localhost:3000/api/calls/start \
  -H "Content-Type: application/json" \
  -d '{"phone": "+918809522106"}'
```

---

## 🧪 Testing

Run the automated test suite:
```bash
npm test
```

---

## 📄 License & Attribution

Prototype developed for **Singh Agency** sales automation. Built with Node.js, Fastify, Google Gemini, and Twilio.
