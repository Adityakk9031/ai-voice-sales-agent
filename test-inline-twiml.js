const twilio = require('twilio');
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

// The WSS URL will be our tunnel - we'll update this dynamically
const WSS_URL = process.env.PUBLIC_WSS_URL || 'wss://your-tunnel.ngrok-free.dev';

const twimlContent = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Connecting you to Priya at Singh Agency.</Say>
  <Connect>
    <Stream url="${WSS_URL}/media-stream">
      <Parameter name="leadId" value="{{leadId}}"/>
    </Stream>
  </Connect>
</Response>`;

console.log('Creating TwiML Bin with content:');
console.log(twimlContent);

// Try creating via Twilio REST API
const fetch = require('node-fetch');
const auth = Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64');

fetch('https://handler.twilio.com/twiml/EH', {
  method: 'POST',
  headers: {
    'Authorization': 'Basic ' + auth,
    'Content-Type': 'application/x-www-form-urlencoded'
  },
  body: new URLSearchParams({
    FriendlyName: 'Singh Agency Voice Stream',
    Body: twimlContent
  }).toString()
}).then(r => r.json()).then(data => {
  console.log('Result:', JSON.stringify(data, null, 2));
}).catch(e => console.log('Error:', e.message));
