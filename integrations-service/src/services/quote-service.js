const { OpenAI } = require('openai');

// Uses Groq (free) by default — just needs GROQ_API_KEY in .env.
// To switch to paid OpenAI, set USE_OPENAI=true and OPENAI_API_KEY=sk-...
const provider = process.env.USE_OPENAI === 'true' ? 'openai' : 'groq'
const apiKey = provider === 'groq'
  ? process.env.GROQ_API_KEY
  : process.env.OPENAI_API_KEY

const openai = new OpenAI({
  apiKey: apiKey,
  baseURL: provider === 'groq' ? 'https://api.groq.com/openai/v1' : undefined
})

/**
 * Generates a conversational quote based on job details and pricing rules.
 * @param {Object} jobDetails - Information about the job (service, size, urgency, etc.)
 * @param {Object} pricingRules - The trader's pricing rules and service menu.
 * @returns {Promise<string>} - The conversational quote.
 */
async function generateQuote(jobDetails, pricingRules) {
  const prompt = `
    You are an AI estimator for a tradesperson business.
    Based on the following pricing rules and job details, generate a friendly, conversational quote.
    
    Pricing Rules:
    ${JSON.stringify(pricingRules, null, 2)}
    
    Job Details:
    ${JSON.stringify(jobDetails, null, 2)}
    
    Instructions:
    - Be professional and transparent.
    - Mention that this is an estimate and may change upon physical inspection.
    - If the details are insufficient for a precise quote, provide a range.
    - End with a call to action to book the job or a site visit.
    - Keep it under 150 words.
  `;

  try {
    const response = await openai.chat.completions.create({
      model: provider === 'groq' ? 'llama-3.3-70b-versatile' : 'gpt-4o',
      messages: [{ role: 'system', content: prompt }],
      temperature: 0.7,
    });

    return response.choices[0].message.content;
  } catch (error) {
    console.error('Error generating quote:', error);
    return "I'm sorry, I'm having trouble generating a quote right now. However, I've captured your details and [Trader Name] will get back to you with a price shortly!";
  }
}

module.exports = { generateQuote };
