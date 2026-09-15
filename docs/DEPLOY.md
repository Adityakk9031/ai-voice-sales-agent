# AI Voice Sales Agent — Deployment Guide

## Deploy to Render (Free, Permanent URL — Recommended)

### Step 1: Push code to GitHub
1. Go to [github.com](https://github.com) → New repository → name it `ai-voice-sales-agent`
2. Open PowerShell in the project folder and run:
```powershell
cd "D:\call agent\ai-voice-sales-agent"
git init
git add .
git commit -m "AI Voice Sales Agent - Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/ai-voice-sales-agent.git
git push -u origin main
```

### Step 2: Deploy on Render
1. Go to [render.com](https://render.com) → Sign up free → New → Blueprint
2. Connect your GitHub account and select the `ai-voice-sales-agent` repo
3. Render will auto-detect the `render.yaml` file and create both services
4. For each service, add these environment variables in the Render dashboard:

```env
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_PHONE_NUMBER=+1XXXXXXXXXX
TARGET_PHONE_NUMBER=+91XXXXXXXXXX
TWILIO_WHATSAPP_FROM=whatsapp:+1XXXXXXXXXX
GEMINI_API_KEY=your_gemini_api_key
DATABASE_URL=postgresql://user:password@host:5432/dbname
REDIS_URL=rediss://default:password@host:6379
RESEND_API_KEY=re_your_resend_api_key
TARGET_EMAIL=your_email@domain.com
MY_MOBILE_NUMBER=+91XXXXXXXXXX
```

### Step 3: Get your permanent URL
After deploy, Render gives you a URL like:
```
https://ai-voice-sales-agent.onrender.com
```

### Step 4: Set the PUBLIC URLs (after you know the Render URL)
In Render dashboard → Environment → add:
```
PUBLIC_BASE_URL=https://ai-voice-sales-agent.onrender.com
PUBLIC_WSS_URL=wss://ai-voice-sales-agent.onrender.com
```

### Step 5: Trigger the call (from anywhere!)
```
POST https://ai-voice-sales-agent.onrender.com/api/calls/start
{"phone": "+918809522106"}
```

## Local Testing (temporary, tunnel required)
See README.md for localtunnel-based local testing instructions.
