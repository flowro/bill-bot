// Claude Vision OCR for Receipt Processing
// Created for issue #12: Receipt OCR + classification with Claude Vision

const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Receipt processing prompt for Claude Vision
const RECEIPT_PROCESSING_PROMPT = `You are a receipt processing AI for tradespeople. Analyze this receipt photo and extract key information.

Extract these fields and return as valid JSON only (no other text):

{
  "amount": number (total amount in decimal format, e.g. 12.50),
  "vendor": "string (business name/supplier)",
  "date": "YYYY-MM-DD (receipt date, estimate if unclear)",
  "category": "string (one of: materials, fuel, tools, food, labor, vehicle, office, other)",
  "description": "string (brief description of items/services)",
  "confidence": number (0-1, how confident you are in the extraction)
}

Category guidelines:
- materials: lumber, concrete, pipes, electrical components, paint, etc.
- fuel: petrol, diesel, oil
- tools: equipment purchases, tool rental
- food: meals, snacks during work
- labor: subcontractor payments, worker wages  
- vehicle: vehicle repairs, maintenance, parts
- office: admin supplies, software, phone bills
- other: anything that doesn't fit above categories

If you can't read something clearly, make your best estimate and lower the confidence score.
If the image is not a receipt, return null for all fields except confidence (set to 0).

Return ONLY the JSON object, no other text or formatting.`;

// Process receipt image with Claude Vision
async function processReceipt(imagePath) {
  try {
    console.log(`Processing receipt with Claude Vision: ${imagePath}`);
    
    // Read image file and convert to base64
    const imageBuffer = fs.readFileSync(imagePath);
    const base64Image = imageBuffer.toString('base64');
    
    // Call Claude Vision API
    const response = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307', // Using Haiku for cost efficiency
      max_tokens: 1000,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'text',
            text: RECEIPT_PROCESSING_PROMPT
          },
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/jpeg',
              data: base64Image
            }
          }
        ]
      }]
    });
    
    const responseText = response.content[0].text;
    console.log('Claude Vision raw response:', responseText);
    
    // Parse JSON response
    let extractedData;
    try {
      extractedData = JSON.parse(responseText);
    } catch (parseError) {
      console.error('Error parsing Claude response as JSON:', parseError);
      // Try to extract JSON from response if wrapped in other text
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        extractedData = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('Could not parse JSON from Claude response');
      }
    }
    
    // Validate required fields
    if (typeof extractedData !== 'object' || extractedData === null) {
      throw new Error('Invalid response format from Claude');
    }
    
    // Set defaults for missing fields
    const processedData = {
      amount: extractedData.amount || null,
      vendor: extractedData.vendor || 'Unknown',
      date: extractedData.date || new Date().toISOString().split('T')[0],
      category: extractedData.category || 'other',
      description: extractedData.description || 'Receipt processed',
      confidence: extractedData.confidence || 0.5,
      raw_ocr_text: responseText // Store full response for debugging
    };
    
    // Validate category
    const validCategories = ['materials', 'fuel', 'tools', 'food', 'labor', 'vehicle', 'office', 'other'];
    if (!validCategories.includes(processedData.category)) {
      processedData.category = 'other';
    }
    
    console.log('Processed receipt data:', processedData);
    return processedData;
    
  } catch (error) {
    console.error('Error processing receipt with Claude Vision:', error);
    
    // Return fallback data with low confidence
    return {
      amount: null,
      vendor: 'Unknown',
      date: new Date().toISOString().split('T')[0],
      category: 'other',
      description: 'Processing failed - manual review needed',
      confidence: 0,
      raw_ocr_text: `Error: ${error.message}`
    };
  }
}

// Format extracted data for user display
function formatReceiptData(data) {
  const confidencePercent = Math.round(data.confidence * 100);
  const confidenceEmoji = data.confidence > 0.8 ? '✅' : data.confidence > 0.5 ? '⚠️' : '❌';
  
  let message = `🧾 **Receipt Processed** ${confidenceEmoji}\n\n`;
  
  if (data.amount) {
    message += `💰 **Amount:** £${data.amount.toFixed(2)}\n`;
  } else {
    message += `💰 **Amount:** Not detected\n`;
  }
  
  message += `🏪 **Vendor:** ${data.vendor}\n`;
  message += `📅 **Date:** ${data.date}\n`;
  message += `📂 **Category:** ${data.category.charAt(0).toUpperCase() + data.category.slice(1)}\n`;
  message += `📝 **Description:** ${data.description}\n`;
  message += `🎯 **Confidence:** ${confidencePercent}%\n\n`;
  
  if (data.confidence < 0.7) {
    message += `⚠️ **Note:** Low confidence extraction. Please verify the details above are correct.\n\n`;
  }
  
  message += `💡 **Tip:** Reply with corrections like "Amount is £25.50" or "Category is tools"`;
  
  return message;
}

// Calculate processing cost estimate
function estimateProcessingCost(imageSize) {
  // Rough estimate based on Claude Vision pricing
  // Haiku: ~$0.25 per 1M tokens, images count as variable tokens based on size
  const baseCost = 0.002; // Base cost per image
  const sizeFactor = Math.min(imageSize / (1024 * 1024), 5); // Cap at 5MB factor
  return baseCost + (sizeFactor * 0.005);
}

module.exports = {
  processReceipt,
  formatReceiptData,
  estimateProcessingCost
};