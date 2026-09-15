export const GEMINI_TOOLS = [
  {
    functionDeclarations: [
      {
        name: "update_lead",
        description: "Updates the known information about the lead based on the conversation.",
        parameters: {
          type: "OBJECT",
          properties: {
            productType: { type: "STRING", description: "What the customer sells" },
            productCount: { type: "INTEGER", description: "Approximate number of products" },
            budget: { type: "STRING", description: "The stated budget (e.g. '2 lakh')" },
            timeline: { type: "STRING", description: "Desired launch timeline (e.g. 'before Diwali')" },
            features: { type: "STRING", description: "Required website features" },
            decisionMaker: { type: "STRING", description: "Decision maker status or situation" },
            blockers: { type: "STRING", description: "Any blockers preventing the sale" },
          }
        }
      },
      {
        name: "classify_lead",
        description: "Runs the qualification engine to classify if the lead is HOT, WARM, or COLD based on current context.",
        parameters: {
          type: "OBJECT",
          properties: {}
        }
      },
      {
        name: "send_whatsapp",
        description: "Sends a mid-call WhatsApp message to the customer if they are highly interested (HOT lead).",
        parameters: {
          type: "OBJECT",
          properties: {
            reason: { type: "STRING", description: "Why we are sending the WhatsApp now" },
            summary: { type: "STRING", description: "A brief summary of what was discussed so far" }
          },
          required: ["reason", "summary"]
        }
      },
      {
        name: "send_email",
        description: "Sends an email confirmation / quotation to the customer's email.",
        parameters: {
          type: "OBJECT",
          properties: {
            email: { type: "STRING", description: "Customer's email address (defaults to registered email)" },
            summary: { type: "STRING", description: "Summary of quote or discussion" }
          }
        }
      },
      {
        name: "schedule_callback",
        description: "Schedules a follow-up call when requested by the customer.",
        parameters: {
          type: "OBJECT",
          properties: {
            requestedTime: { type: "STRING", description: "The natural language time requested by the customer, e.g. 'tomorrow morning', 'Saturday at 3'" }
          },
          required: ["requestedTime"]
        }
      },
      {
        name: "end_call",
        description: "Gracefully terminates the active call.",
        parameters: {
          type: "OBJECT",
          properties: {
            reason: { type: "STRING" }
          }
        }
      }
    ]
  }
];
