// Natural Language Query Processing for Bill Bot
// Implements issue #14: MVP1 Natural language queries about spending

const Anthropic = require('@anthropic-ai/sdk');

// Initialize Claude client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Query classification and SQL generation
async function parseNaturalLanguageQuery(userQuery, userId) {
  try {
    const prompt = `You are a SQL query generator for a receipt tracking app. 

The database has these tables:
- users (id, telegram_id, display_name, currency, trade)
- receipts (id, user_id, job_id, amount, vendor, receipt_date, category, description, created_at)
- jobs (id, user_id, name, client, status)

Categories: materials, fuel, tools, food, labor, vehicle, office, other

Parse this natural language query and return a JSON response with:
{
  "intent": "spending_summary|job_summary|vendor_search|date_range|category_breakdown|recent_receipts",
  "parameters": {
    "date_range": "this_month|this_week|last_month|last_week|today|YYYY-MM-DD",
    "job_name": "string if mentioned",
    "vendor": "string if mentioned", 
    "category": "materials|fuel|tools|food|labor|vehicle|office|other",
    "amount_range": {"min": number, "max": number}
  },
  "sql_query": "SELECT query with placeholders for user_id",
  "display_format": "summary|list|total"
}

User query: "${userQuery}"

Examples:
- "How much did I spend this month?" -> intent: spending_summary, date_range: this_month
- "Show receipts for Johnson job" -> intent: job_summary, job_name: "Johnson" 
- "What did I spend on materials this week?" -> intent: category_breakdown, category: materials, date_range: this_week
- "Total expenses for Home Depot" -> intent: vendor_search, vendor: "Home Depot"

Return only valid JSON.`;

    const message = await anthropic.messages.create({
      model: "claude-3-haiku-20240307",
      max_tokens: 1000,
      messages: [{
        role: "user",
        content: prompt
      }]
    });

    const response = message.content[0].text;
    console.log('Claude NLP response:', response);
    
    try {
      const parsed = JSON.parse(response);
      return parsed;
    } catch (parseError) {
      console.error('Failed to parse Claude response as JSON:', parseError);
      return {
        intent: "unknown",
        parameters: {},
        sql_query: null,
        display_format: "summary"
      };
    }

  } catch (error) {
    console.error('Error in parseNaturalLanguageQuery:', error);
    return {
      intent: "error",
      parameters: {},
      sql_query: null,
      display_format: "summary"
    };
  }
}

// Execute query and format response  
async function processNaturalLanguageQuery(userQuery, userId, supabase) {
  try {
    // Parse the query
    const queryData = await parseNaturalLanguageQuery(userQuery, userId);
    
    if (queryData.intent === "error" || queryData.intent === "unknown") {
      return {
        success: false,
        message: "I couldn't understand that query. Try asking about:\n" +
                "• 'How much did I spend this month?'\n" +
                "• 'Show me receipts for the Johnson job'\n" +
                "• 'What did I spend on materials this week?'\n" +
                "• 'Total from Home Depot this month'"
      };
    }

    // Build date filter
    let startDate = null;
    let endDate = null;
    let periodName = "all time";

    if (queryData.parameters.date_range) {
      const dateRange = queryData.parameters.date_range;
      const now = new Date();
      
      switch (dateRange) {
        case "today":
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          endDate = new Date(startDate);
          endDate.setDate(startDate.getDate() + 1);
          periodName = "today";
          break;
          
        case "this_week":
          const monday = new Date(now.setDate(now.getDate() - now.getDay() + 1));
          startDate = monday;
          endDate = new Date();
          periodName = "this week";
          break;
          
        case "last_week":
          const lastMonday = new Date(now.setDate(now.getDate() - now.getDay() + 1 - 7));
          const lastSunday = new Date(lastMonday);
          lastSunday.setDate(lastMonday.getDate() + 6);
          startDate = lastMonday;
          endDate = lastSunday;
          periodName = "last week";
          break;
          
        case "this_month":
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          endDate = new Date();
          periodName = "this month";
          break;
          
        case "last_month":
          const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
          const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
          startDate = lastMonth;
          endDate = lastMonthEnd;
          periodName = "last month";
          break;
          
        default:
          // Try to parse as YYYY-MM-DD
          if (dateRange.match(/^\d{4}-\d{2}-\d{2}$/)) {
            startDate = new Date(dateRange);
            endDate = new Date(startDate);
            endDate.setDate(startDate.getDate() + 1);
            periodName = dateRange;
          }
          break;
      }
    }

    // Execute based on intent
    let result;
    
    switch (queryData.intent) {
      case "spending_summary":
        result = await getSpendingSummary(userId, startDate, endDate, periodName, supabase);
        break;
        
      case "job_summary":
        result = await getJobSummary(userId, queryData.parameters.job_name, startDate, endDate, supabase);
        break;
        
      case "vendor_search":
        result = await getVendorSummary(userId, queryData.parameters.vendor, startDate, endDate, periodName, supabase);
        break;
        
      case "category_breakdown":
        result = await getCategoryBreakdown(userId, queryData.parameters.category, startDate, endDate, periodName, supabase);
        break;
        
      case "recent_receipts":
        result = await getRecentReceipts(userId, queryData.parameters, supabase);
        break;
        
      default:
        result = {
          success: false,
          message: "I understand your question but can't process that type of query yet. Try asking about spending totals, jobs, or categories."
        };
        break;
    }

    return result;

  } catch (error) {
    console.error('Error in processNaturalLanguageQuery:', error);
    return {
      success: false,
      message: "Sorry, there was an error processing your query. Please try again or use /help for available commands."
    };
  }
}

// Individual query handlers

async function getSpendingSummary(userId, startDate, endDate, periodName, supabase) {
  try {
    let query = supabase
      .from('receipts')
      .select('amount, category, vendor, receipt_date')
      .eq('user_id', userId);
      
    if (startDate && endDate) {
      const startStr = startDate.toISOString().split('T')[0];
      const endStr = endDate.toISOString().split('T')[0];
      query = query.gte('receipt_date', startStr).lte('receipt_date', endStr);
    }
    
    const { data: receipts, error } = await query;
    
    if (error) {
      console.error('Error in getSpendingSummary:', error);
      throw error;
    }
    
    if (!receipts || receipts.length === 0) {
      return {
        success: true,
        message: `💰 **Spending Summary - ${periodName}**\n\nNo receipts found for this period.\n\n💡 Send me a photo of a receipt to get started!`
      };
    }
    
    const total = receipts.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);
    const count = receipts.length;
    
    // Category breakdown
    const categoryTotals = {};
    receipts.forEach(r => {
      const category = r.category || 'other';
      categoryTotals[category] = (categoryTotals[category] || 0) + (parseFloat(r.amount) || 0);
    });
    
    let message = `💰 **Spending Summary - ${periodName}**\n\n`;
    message += `💸 **Total:** £${total.toFixed(2)}\n`;
    message += `📄 **Receipts:** ${count}\n\n`;
    
    if (Object.keys(categoryTotals).length > 0) {
      message += `📂 **By Category:**\n`;
      const sortedCategories = Object.entries(categoryTotals)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 5);
        
      for (const [category, amount] of sortedCategories) {
        const categoryEmoji = {
          materials: '🔧',
          fuel: '⛽',
          tools: '🔨', 
          food: '🍔',
          labor: '👷',
          vehicle: '🚗',
          office: '📋',
          other: '📦'
        }[category] || '📦';
        
        const percentage = total > 0 ? ((amount / total) * 100).toFixed(0) : 0;
        message += `  ${categoryEmoji} ${category}: £${amount.toFixed(2)} (${percentage}%)\n`;
      }
    }
    
    message += `\n💡 Use /summary for more detailed breakdown`;
    
    return {
      success: true,
      message: message
    };
    
  } catch (error) {
    console.error('Error in getSpendingSummary:', error);
    return {
      success: false,
      message: "Error retrieving spending summary. Please try again."
    };
  }
}

async function getJobSummary(userId, jobName, startDate, endDate, supabase) {
  try {
    if (!jobName) {
      return {
        success: false,
        message: "Please specify which job you'd like to see. Example: 'Show me receipts for the Johnson job'"
      };
    }
    
    // Find job (case-insensitive)
    const { data: jobs, error: jobError } = await supabase
      .from('jobs')
      .select('id, name')
      .eq('user_id', userId)
      .ilike('name', `%${jobName}%`)
      .limit(5);
      
    if (jobError) {
      console.error('Error finding jobs:', jobError);
      throw jobError;
    }
    
    if (!jobs || jobs.length === 0) {
      return {
        success: true,
        message: `💼 No jobs found matching "${jobName}".\n\n💡 Use /jobs to see all your jobs or /newjob to create one.`
      };
    }
    
    // If multiple matches, show options
    if (jobs.length > 1) {
      let message = `💼 Multiple jobs found for "${jobName}":\n\n`;
      jobs.forEach((job, index) => {
        message += `${index + 1}. ${job.name}\n`;
      });
      message += `\n💡 Be more specific, like "Johnson bathroom" instead of just "Johnson"`;
      
      return {
        success: true,
        message: message
      };
    }
    
    const job = jobs[0];
    
    // Get receipts for this job
    let receiptQuery = supabase
      .from('receipts')
      .select('amount, vendor, receipt_date, category, description')
      .eq('user_id', userId)
      .eq('job_id', job.id);
      
    if (startDate && endDate) {
      const startStr = startDate.toISOString().split('T')[0];
      const endStr = endDate.toISOString().split('T')[0];
      receiptQuery = receiptQuery.gte('receipt_date', startStr).lte('receipt_date', endStr);
    }
    
    receiptQuery = receiptQuery.order('receipt_date', { ascending: false });
    
    const { data: receipts, error: receiptError } = await receiptQuery;
    
    if (receiptError) {
      console.error('Error getting job receipts:', receiptError);
      throw receiptError;
    }
    
    if (!receipts || receipts.length === 0) {
      return {
        success: true,
        message: `💼 **${job.name}**\n\nNo receipts found for this job.\n\n💡 Tag receipts to jobs by adding captions when you send photos.`
      };
    }
    
    const total = receipts.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);
    
    let message = `💼 **${job.name}**\n\n`;
    message += `💰 **Total Spent:** £${total.toFixed(2)}\n`;
    message += `📄 **Receipts:** ${receipts.length}\n\n`;
    
    message += `📋 **Recent Receipts:**\n`;
    receipts.slice(0, 10).forEach(r => {
      const amount = parseFloat(r.amount) || 0;
      const date = r.receipt_date ? new Date(r.receipt_date).toLocaleDateString() : 'Unknown date';
      const vendor = r.vendor || 'Unknown vendor';
      message += `• £${amount.toFixed(2)} - ${vendor} (${date})\n`;
    });
    
    if (receipts.length > 10) {
      message += `... and ${receipts.length - 10} more receipts\n`;
    }
    
    return {
      success: true,
      message: message
    };
    
  } catch (error) {
    console.error('Error in getJobSummary:', error);
    return {
      success: false,
      message: "Error retrieving job information. Please try again."
    };
  }
}

async function getVendorSummary(userId, vendorName, startDate, endDate, periodName, supabase) {
  try {
    if (!vendorName) {
      return {
        success: false,
        message: "Please specify which vendor. Example: 'How much did I spend at Home Depot?'"
      };
    }
    
    let query = supabase
      .from('receipts')
      .select('amount, vendor, receipt_date, category, description')
      .eq('user_id', userId)
      .ilike('vendor', `%${vendorName}%`);
      
    if (startDate && endDate) {
      const startStr = startDate.toISOString().split('T')[0];
      const endStr = endDate.toISOString().split('T')[0];
      query = query.gte('receipt_date', startStr).lte('receipt_date', endStr);
    }
    
    query = query.order('receipt_date', { ascending: false });
    
    const { data: receipts, error } = await query;
    
    if (error) {
      console.error('Error in getVendorSummary:', error);
      throw error;
    }
    
    if (!receipts || receipts.length === 0) {
      return {
        success: true,
        message: `🏪 No receipts found for "${vendorName}" ${periodName !== 'all time' ? `in ${periodName}` : ''}.\n\n💡 Make sure the vendor name matches what's on your receipts.`
      };
    }
    
    const total = receipts.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);
    
    let message = `🏪 **${vendorName} - ${periodName}**\n\n`;
    message += `💰 **Total Spent:** £${total.toFixed(2)}\n`;
    message += `📄 **Receipts:** ${receipts.length}\n\n`;
    
    message += `📋 **Recent Purchases:**\n`;
    receipts.slice(0, 8).forEach(r => {
      const amount = parseFloat(r.amount) || 0;
      const date = r.receipt_date ? new Date(r.receipt_date).toLocaleDateString() : 'Unknown date';
      const category = r.category || 'other';
      message += `• £${amount.toFixed(2)} - ${category} (${date})\n`;
    });
    
    if (receipts.length > 8) {
      message += `... and ${receipts.length - 8} more receipts\n`;
    }
    
    return {
      success: true,
      message: message
    };
    
  } catch (error) {
    console.error('Error in getVendorSummary:', error);
    return {
      success: false,
      message: "Error retrieving vendor information. Please try again."
    };
  }
}

async function getCategoryBreakdown(userId, category, startDate, endDate, periodName, supabase) {
  try {
    let query = supabase
      .from('receipts')
      .select('amount, vendor, receipt_date, description, category')
      .eq('user_id', userId);
      
    if (category) {
      query = query.eq('category', category);
    }
      
    if (startDate && endDate) {
      const startStr = startDate.toISOString().split('T')[0];
      const endStr = endDate.toISOString().split('T')[0];
      query = query.gte('receipt_date', startStr).lte('receipt_date', endStr);
    }
    
    query = query.order('receipt_date', { ascending: false });
    
    const { data: receipts, error } = await query;
    
    if (error) {
      console.error('Error in getCategoryBreakdown:', error);
      throw error;
    }
    
    if (!receipts || receipts.length === 0) {
      const categoryText = category ? `for ${category}` : '';
      return {
        success: true,
        message: `📂 No receipts found ${categoryText} ${periodName !== 'all time' ? `in ${periodName}` : ''}.\n\n💡 Categories include: materials, fuel, tools, food, labor, vehicle, office, other`
      };
    }
    
    const total = receipts.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);
    
    const categoryEmoji = {
      materials: '🔧',
      fuel: '⛽',
      tools: '🔨',
      food: '🍔',
      labor: '👷',
      vehicle: '🚗',
      office: '📋',
      other: '📦'
    }[category] || '📂';
    
    let message = `${categoryEmoji} **${category ? category.charAt(0).toUpperCase() + category.slice(1) : 'All Categories'} - ${periodName}**\n\n`;
    message += `💰 **Total:** £${total.toFixed(2)}\n`;
    message += `📄 **Receipts:** ${receipts.length}\n\n`;
    
    message += `📋 **Recent Purchases:**\n`;
    receipts.slice(0, 8).forEach(r => {
      const amount = parseFloat(r.amount) || 0;
      const date = r.receipt_date ? new Date(r.receipt_date).toLocaleDateString() : 'Unknown date';
      const vendor = r.vendor || 'Unknown vendor';
      message += `• £${amount.toFixed(2)} - ${vendor} (${date})\n`;
    });
    
    if (receipts.length > 8) {
      message += `... and ${receipts.length - 8} more receipts\n`;
    }
    
    return {
      success: true,
      message: message
    };
    
  } catch (error) {
    console.error('Error in getCategoryBreakdown:', error);
    return {
      success: false,
      message: "Error retrieving category information. Please try again."
    };
  }
}

async function getRecentReceipts(userId, parameters, supabase) {
  try {
    const limit = parameters.limit || 10;
    
    const { data: receipts, error } = await supabase
      .from('receipts')
      .select('amount, vendor, receipt_date, category, description')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);
    
    if (error) {
      console.error('Error in getRecentReceipts:', error);
      throw error;
    }
    
    if (!receipts || receipts.length === 0) {
      return {
        success: true,
        message: `📄 No receipts found.\n\n💡 Send me a photo of a receipt to get started!`
      };
    }
    
    let message = `📄 **Recent Receipts**\n\n`;
    
    receipts.forEach((r, index) => {
      const amount = parseFloat(r.amount) || 0;
      const date = r.receipt_date ? new Date(r.receipt_date).toLocaleDateString() : 'Unknown date';
      const vendor = r.vendor || 'Unknown vendor';
      const category = r.category || 'other';
      
      const categoryEmoji = {
        materials: '🔧',
        fuel: '⛽',
        tools: '🔨',
        food: '🍔',
        labor: '👷',
        vehicle: '🚗',
        office: '📋',
        other: '📦'
      }[category] || '📦';
      
      message += `${index + 1}. **${vendor}** - £${amount.toFixed(2)}\n`;
      message += `   📅 ${date} • ${categoryEmoji} ${category}\n\n`;
    });
    
    message += `💡 Use /summary for spending totals`;
    
    return {
      success: true,
      message: message
    };
    
  } catch (error) {
    console.error('Error in getRecentReceipts:', error);
    return {
      success: false,
      message: "Error retrieving recent receipts. Please try again."
    };
  }
}

module.exports = {
  processNaturalLanguageQuery,
  parseNaturalLanguageQuery
};