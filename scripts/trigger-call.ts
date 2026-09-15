import dotenv from 'dotenv';
dotenv.config();

async function trigger() {
  const phone = process.argv[2] || process.env.TARGET_PHONE_NUMBER || '+918809522106';
  console.log(`Initiating outbound call to ${phone}...`);

  try {
    const res = await fetch('http://localhost:3000/api/calls/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone }),
    });

    const data = await res.json();
    if (res.ok) {
      console.log('✅ Call initiated successfully!');
      console.log('Call SID:', data.twilioCallSid);
      console.log('Database Call ID:', data.callId);
      console.log('Phone will ring shortly with Priya from Singh Agency.');
    } else {
      console.error('❌ Failed to trigger call:', data);
    }
  } catch (err: any) {
    console.error('❌ Error connecting to server:', err.message);
  }
}

trigger().then(() => process.exit(0));
