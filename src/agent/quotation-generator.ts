import { env } from '../config/env';
import { logger } from '../utils/logger';

export interface GeneratedQuotation {
  businessType: string;
  packagePrice: string;
  features: string[];
  timeline: string;
  summaryText: string;
  whatsappMessage: string;
  emailHtml: string;
}

export async function generateCallQuotation(
  conversationTranscript: string,
  leadData: any = {}
): Promise<GeneratedQuotation> {
  const prompt = `You are a professional sales quotation generator for Singh Agency, a premier e-commerce website development agency in India.
Analyze this sales call conversation between Priya (Sales Executive at Singh Agency) and the customer:
=== CONVERSATION START ===
${conversationTranscript}
=== CONVERSATION END ===

Existing known lead info:
- Business/Product: ${leadData?.productType || 'E-Commerce Store'}
- Budget discussed: ${leadData?.budget || '₹35,000'}
- Products count: ${leadData?.productCount || '50+ products'}
- Timeline: ${leadData?.timeline || '7-10 business days'}
- Features: ${leadData?.requestedFeatures || 'Online store, payment gateway, admin panel, WhatsApp ordering'}

Generate a JSON object with:
1. "businessType": string (the type of store, e.g. "Designer Clothing Boutique", "Footwear Store", or "Online Retail Store")
2. "packagePrice": string (e.g. "₹35,000 - ₹40,000")
3. "features": array of 4-5 key features (e.g. ["Custom Mobile-First Website Design", "Instant Payment Gateway (UPI, Cards, NetBanking)", "Automated WhatsApp Order Notifications", "Easy Admin Inventory & Order Dashboard", "Fast Cloud Hosting & Free Domain Setup"])
4. "timeline": string (e.g. "7 to 10 working days")
5. "summaryText": 2-3 sentences confirming the order and summarizing what will be built.
`;

  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${env.GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 600 }
      })
    });

    const data: any = await res.json();
    if (data.candidates && data.candidates[0]?.content?.parts[0]?.text) {
      const parsed = JSON.parse(data.candidates[0].content.parts[0].text);
      
      const businessType = parsed.businessType || leadData?.productType || 'Custom E-Commerce Store';
      const packagePrice = parsed.packagePrice || leadData?.budget || '₹35,000';
      const features: string[] = Array.isArray(parsed.features) && parsed.features.length > 0
        ? parsed.features
        : ["Custom Mobile-First Website Design", "Instant Payment Gateway (UPI & Cards)", "WhatsApp Order Notifications", "Admin Dashboard"];
      const timeline = parsed.timeline || leadData?.timeline || '7-10 business days';
      const summaryText = parsed.summaryText || `Quotation and order confirmation for your ${businessType}.`;

      const whatsappMessage = `*Singh Agency — Quotation & Order Confirmation* 🚀
----------------------------------------
*Client Requirement:* ${businessType}
*Investment Quote:* ${packagePrice}
*Delivery Timeline:* ${timeline}

*Included Scope & Deliverables:*
${features.map((f: string) => `✅ ${f}`).join('\n')}

*Order Status:* Confirmed & In Onboarding
📞 *Contact Priya (Singh Agency):* ${env.MY_MOBILE_NUMBER}
Looking forward to launching your online store! ✨`;

      const emailHtml = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/></head>
<body style="font-family: Arial, sans-serif; background-color: #f4f6f8; margin: 0; padding: 20px;">
  <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 10px rgba(0,0,0,0.05);">
    <div style="background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%); color: #ffffff; padding: 30px 25px; text-align: center;">
      <h1 style="margin: 0; font-size: 26px; letter-spacing: 0.5px;">Singh Agency</h1>
      <p style="margin: 8px 0 0 0; font-size: 15px; opacity: 0.9;">Order Confirmation & Custom Quotation</p>
    </div>
    
    <div style="padding: 25px 30px;">
      <p style="font-size: 16px; color: #333333; line-height: 1.5;">
        Dear Client,<br/><br/>
        Thank you for speaking with <b>Priya</b> at <b>Singh Agency</b>! We have logged your project requirements and are delighted to share your tailored quotation and order confirmation below:
      </p>

      <div style="background: #f8fafc; border-left: 4px solid #2a5298; padding: 15px 20px; margin: 20px 0; border-radius: 4px;">
        <h3 style="margin-top: 0; color: #1e3c72;">Project Details</h3>
        <p style="margin: 5px 0; color: #475569;"><b>Store Type:</b> ${businessType}</p>
        <p style="margin: 5px 0; color: #475569;"><b>Package Investment:</b> <span style="color: #16a34a; font-weight: bold; font-size: 17px;">${packagePrice}</span></p>
        <p style="margin: 5px 0; color: #475569;"><b>Estimated Delivery:</b> ${timeline}</p>
        <p style="margin: 5px 0; color: #475569;"><b>Order Status:</b> <span style="background: #dcfce7; color: #15803d; padding: 3px 8px; border-radius: 4px; font-weight: 600;">CONFIRMED</span></p>
      </div>

      <h3 style="color: #1e3c72; margin-top: 25px;">Scope & Deliverables</h3>
      <ul style="color: #475569; line-height: 1.8; padding-left: 20px;">
        ${features.map((f: string) => `<li><b>${f}</b></li>`).join('')}
      </ul>

      <p style="font-size: 14px; color: #64748b; line-height: 1.5; margin-top: 25px;">
        Our engineering team will prepare your store layout and contact you for catalog and logo assets. If you have any questions, feel free to reply directly or call Priya at <b>${env.MY_MOBILE_NUMBER}</b>.
      </p>
    </div>

    <div style="background: #f1f5f9; padding: 15px 20px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0;">
      © ${new Date().getFullYear()} Singh Agency. All rights reserved.<br/>
      Hyderabad, India | Contact: ${env.MY_MOBILE_NUMBER}
    </div>
  </div>
</body>
</html>
`;

      return {
        businessType,
        packagePrice,
        features,
        timeline,
        summaryText,
        whatsappMessage,
        emailHtml
      };
    }
  } catch (err: any) {
    logger.warn({ err: err.message }, 'Failed to generate AI quotation - using robust fallback');
  }

  // Fallback quotation
  const businessType = leadData?.productType || 'Custom E-Commerce Store';
  const packagePrice = leadData?.budget || '₹35,000';
  const features = ["Custom Mobile-Responsive Store", "UPI & Card Payment Gateway Integration", "WhatsApp Order Notifications", "Easy Admin Inventory Panel", "Cloud Hosting Setup"];
  const timeline = '7 to 10 business days';
  const whatsappMessage = `*Singh Agency — Quotation & Order Confirmation* 🚀\nStore: ${businessType}\nPackage: ${packagePrice}\nTimeline: ${timeline}\nFeatures: ${features.join(', ')}\nContact: ${env.MY_MOBILE_NUMBER}`;
  const emailHtml = `<p>Thank you for choosing Singh Agency. Your order for a ${businessType} (${packagePrice}) is confirmed!</p>`;

  return {
    businessType,
    packagePrice,
    features,
    timeline,
    summaryText: `Quotation for ${businessType}`,
    whatsappMessage,
    emailHtml
  };
}
