// Bill Bot MVP1 - Telegram Bot for Receipt Tracking
// Created for issue #11: Telegram bot receives photos and text messages

require('dotenv').config();
const { Bot, GrammyError, HttpError } = require('grammy');
const { createClient } = require('@supabase/supabase-js');
const { processReceipt, formatReceiptData, estimateProcessingCost } = require('./claude-vision');
const { processNaturalLanguageQuery } = require('./nlp-queries');
const fs = require('fs');
const https = require('https');
const path = require('path');
const cron = require('node-cron');

// Environment variables
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

if (!BOT_TOKEN || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !ANTHROPIC_API_KEY) {
  console.error('Missing required environment variables');
  console.error('Required: TELEGRAM_BOT_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY');
  process.exit(1);
}

// Initialize bot and Supabase
const bot = new Bot(BOT_TOKEN);
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Ensure uploads directory exists
if (!fs.existsSync('./uploads')) {
  fs.mkdirSync('./uploads', { recursive: true });
}

// Helper function to download file
async function downloadFile(fileId, fileName) {
  try {
    const file = await bot.api.getFile(fileId);
    const url = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;
    const localPath = path.join('./uploads', fileName);
    
    return new Promise((resolve, reject) => {
      const fileStream = fs.createWriteStream(localPath);
      
      https.get(url, (response) => {
        response.pipe(fileStream);
        
        fileStream.on('finish', () => {
          fileStream.close();
          resolve(localPath);
        });
        
        fileStream.on('error', reject);
      }).on('error', reject);
    });
  } catch (error) {
    console.error('Error downloading file:', error);
    throw error;
  }
}

// Helper function to upload to Supabase Storage
async function uploadToSupabase(localPath, fileName, userId) {
  try {
    const fileBuffer = fs.readFileSync(localPath);
    const storagePath = `${userId}/${fileName}`;
    
    const { data, error } = await supabase.storage
      .from('receipts')
      .upload(storagePath, fileBuffer, {
        contentType: 'image/jpeg',
        upsert: true
      });
    
    if (error) {
      console.error('Supabase upload error:', error);
      throw error;
    }
    
    // Get public URL (will be signed URL since bucket is private)
    const { data: urlData } = supabase.storage
      .from('receipts')
      .getPublicUrl(storagePath);
    
    // Clean up local file
    fs.unlinkSync(localPath);
    
    return urlData.publicUrl;
  } catch (error) {
    console.error('Error uploading to Supabase:', error);
    throw error;
  }
}

// Helper function to get or create user (returns enhanced data for onboarding)
async function getOrCreateUser(telegramUser) {
  try {
    const { data, error } = await supabase.rpc('get_or_create_user', {
      p_telegram_id: telegramUser.id,
      p_telegram_username: telegramUser.username || null,
      p_first_name: telegramUser.first_name || null
    });
    
    if (error) {
      console.error('Error getting/creating user:', error);
      throw error;
    }
    
    return data[0]; // Return first row of the result
  } catch (error) {
    console.error('Error in getOrCreateUser:', error);
    throw error;
  }
}

// Helper function to get user ID (for backward compatibility)
async function getUserId(telegramUser) {
  const userData = await getOrCreateUser(telegramUser);
  return userData.user_id;
}

// Helper function to update onboarding step
async function updateOnboardingStep(telegramId, step, data = {}) {
  try {
    const { data: result, error } = await supabase.rpc('update_onboarding_step', {
      p_telegram_id: telegramId,
      p_step: step,
      p_display_name: data.displayName || null,
      p_currency: data.currency || null,
      p_trade: data.trade || null,
      p_trade_other: data.tradeOther || null
    });
    
    if (error) {
      console.error('Error updating onboarding step:', error);
      throw error;
    }
    
    return result;
  } catch (error) {
    console.error('Error in updateOnboardingStep:', error);
    throw error;
  }
}

// Onboarding flow handler
async function handleOnboarding(ctx, userData) {
  const step = userData.onboarding_step;
  
  switch (step) {
    case 0:
      // Welcome and ask for name
      await updateOnboardingStep(ctx.from.id, 1);
      await ctx.reply(
        `🎉 **Welcome to Bill Bot!**\n\n` +
        `I help tradespeople track expenses by processing receipt photos with AI.\n\n` +
        `Let's get you set up. First, what should I call you?\n\n` +
        `💬 Just reply with your preferred name (e.g., "Mike" or "Mike Smith")`,
        { parse_mode: 'Markdown' }
      );
      break;
      
    case 1:
      // Store name and ask for currency
      const displayName = ctx.message.text.trim();
      await updateOnboardingStep(ctx.from.id, 2, { displayName });
      
      const currencyKeyboard = {
        inline_keyboard: [
          [
            { text: '🇬🇧 GBP (£)', callback_data: 'onboard_currency_GBP' },
            { text: '🇺🇸 USD ($)', callback_data: 'onboard_currency_USD' }
          ],
          [
            { text: '🇪🇺 EUR (€)', callback_data: 'onboard_currency_EUR' }
          ]
        ]
      };
      
      await ctx.reply(
        `Nice to meet you, **${displayName}**! 👋\n\n` +
        `Which currency do you use for expenses?`,
        { parse_mode: 'Markdown', reply_markup: currencyKeyboard }
      );
      break;
      
    case 2:
      // This step is handled by callback query (currency selection)
      break;
      
    case 3:
      // Ask for trade
      const tradeKeyboard = {
        inline_keyboard: [
          [
            { text: '🔧 Plumber', callback_data: 'onboard_trade_plumber' },
            { text: '🏗️ Builder', callback_data: 'onboard_trade_builder' }
          ],
          [
            { text: '⚡ Electrician', callback_data: 'onboard_trade_electrician' },
            { text: '🌿 Landscaper', callback_data: 'onboard_trade_landscaper' }
          ],
          [
            { text: '🔨 Other Trade', callback_data: 'onboard_trade_other' }
          ]
        ]
      };
      
      await ctx.reply(
        `💼 What's your trade or profession?\n\n` +
        `This helps me categorize your expenses better.`,
        { reply_markup: tradeKeyboard }
      );
      break;
      
    case 4:
      // Tutorial
      await updateOnboardingStep(ctx.from.id, 5);
      
      await ctx.reply(
        `🎓 **Quick Tutorial**\n\n` +
        `📸 **Send me a photo** of any receipt and I'll:\n` +
        `• Extract the amount, vendor, and date\n` +
        `• Categorize the expense\n` +
        `• Store it in your expense tracker\n\n` +
        `🏷️ **Tag to jobs** by:\n` +
        `• Adding a caption: "Johnson bathroom"\n` +
        `• Using the quick-tag buttons\n` +
        `• Replying to receipts with job names\n\n` +
        `📊 **Get summaries** with:\n` +
        `• /summary - This month's breakdown\n` +
        `• /jobs - View your active jobs\n` +
        `• Automatic weekly/monthly reports\n\n` +
        `**Ready to try? Send me a photo of a receipt! 📸**`,
        { parse_mode: 'Markdown' }
      );
      
      // Also send a helpful tip
      await ctx.reply(
        `💡 **Pro Tips:**\n\n` +
        `• Take photos in good lighting\n` +
        `• Keep receipts flat and straight\n` +
        `• Use /help anytime for commands\n\n` +
        `Your expenses are tracked automatically! 🚀`,
        { parse_mode: 'Markdown' }
      );
      
      console.log(`User ${ctx.from.id} completed onboarding`);
      break;
      
    default:
      console.log(`Unknown onboarding step: ${step}`);
      break;
  }
}

// Helper function to find or create job
async function findOrCreateJob(userId, jobName) {
  try {
    // First try to find existing job (case-insensitive)
    const { data: existingJobs, error: findError } = await supabase
      .from('jobs')
      .select('id, name')
      .eq('user_id', userId)
      .ilike('name', jobName)
      .limit(1);
    
    if (findError) {
      console.error('Error finding job:', findError);
      throw findError;
    }
    
    if (existingJobs && existingJobs.length > 0) {
      return existingJobs[0];
    }
    
    // Create new job if not found
    const { data: newJob, error: createError } = await supabase
      .from('jobs')
      .insert({
        user_id: userId,
        name: jobName.trim()
      })
      .select()
      .single();
    
    if (createError) {
      console.error('Error creating job:', createError);
      throw createError;
    }
    
    return newJob;
  } catch (error) {
    console.error('Error in findOrCreateJob:', error);
    throw error;
  }
}

// Helper function to get user's jobs for inline keyboard
async function getUserJobs(userId, limit = 5) {
  try {
    const { data: jobs, error } = await supabase
      .from('jobs')
      .select('id, name')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(limit);
    
    if (error) {
      console.error('Error fetching user jobs:', error);
      throw error;
    }
    
    return jobs || [];
  } catch (error) {
    console.error('Error in getUserJobs:', error);
    return [];
  }
}

// Helper function to tag receipt to job
async function tagReceiptToJob(receiptId, jobId) {
  try {
    const { data, error } = await supabase
      .from('receipts')
      .update({ job_id: jobId })
      .eq('id', receiptId)
      .select()
      .single();
    
    if (error) {
      console.error('Error tagging receipt to job:', error);
      throw error;
    }
    
    return data;
  } catch (error) {
    console.error('Error in tagReceiptToJob:', error);
    throw error;
  }
}

// Helper function to parse manual expense entry
async function parseManualExpense(text, userId) {
  // Examples: "45 screwfix materials", "32.50 fuel", "Johnson job: 120 materials"
  const patterns = [
    // Pattern 1: "JobName job: amount category [description]"
    /^(.+?)\s+job:\s*(\d+(?:\.\d{1,2})?)\s+([a-z]+)(?:\s+(.+))?$/i,
    // Pattern 2: "amount vendor category [description]"
    /^(\d+(?:\.\d{1,2})?)\s+([a-zA-Z]+[\w\s]*)\s+([a-z]+)(?:\s+(.+))?$/i,
    // Pattern 3: "amount category [description]"
    /^(\d+(?:\.\d{1,2})?)\s+([a-z]+)(?:\s+(.+))?$/i
  ];

  const validCategories = ['materials', 'fuel', 'tools', 'food', 'labor', 'vehicle', 'office', 'other'];
  
  // Try pattern 1: Job-specific entry
  let match = text.match(patterns[0]);
  if (match) {
    const jobName = match[1].trim();
    const amount = parseFloat(match[2]);
    const category = match[3].toLowerCase();
    const description = match[4] || `${category} expense`;
    
    if (!validCategories.includes(category)) {
      return { error: `Invalid category: ${category}. Valid: ${validCategories.join(', ')}` };
    }
    
    try {
      const job = await findOrCreateJob(userId, jobName);
      return {
        amount,
        category,
        description,
        vendor: 'Manual entry',
        jobId: job.id,
        jobName: job.name,
        confidence: 1.0
      };
    } catch (error) {
      return { error: 'Failed to create/find job' };
    }
  }
  
  // Try pattern 2: Amount + vendor + category
  match = text.match(patterns[1]);
  if (match) {
    const amount = parseFloat(match[1]);
    const vendor = match[2].trim();
    const category = match[3].toLowerCase();
    const description = match[4] || `${vendor} ${category}`;
    
    if (!validCategories.includes(category)) {
      return { error: `Invalid category: ${category}. Valid: ${validCategories.join(', ')}` };
    }
    
    return {
      amount,
      category,
      description,
      vendor,
      jobId: null,
      jobName: null,
      confidence: 1.0
    };
  }
  
  // Try pattern 3: Amount + category only
  match = text.match(patterns[2]);
  if (match) {
    const amount = parseFloat(match[1]);
    const category = match[2].toLowerCase();
    const description = match[3] || `${category} expense`;
    
    if (!validCategories.includes(category)) {
      return { error: `Invalid category: ${category}. Valid: ${validCategories.join(', ')}` };
    }
    
    return {
      amount,
      category,
      description,
      vendor: 'Manual entry',
      jobId: null,
      jobName: null,
      confidence: 1.0
    };
  }
  
  return { error: null }; // No match, not a manual expense entry
}

// Command handlers

// Start command
bot.command('start', async (ctx) => {
  try {
    const userId = await getOrCreateUser(ctx.from);
    
    const welcomeMessage = `🧾 Welcome to Bill Bot!

I help tradespeople track expenses by photographing receipts.

**What I can do:**
📸 Process receipt photos with AI
💰 Track spending by job/client
📊 Generate spending summaries
📋 Export data for accounting

**Get started:**
• Send me a photo of a receipt
• Use /help to see all commands
• Use /jobs to manage your projects

Ready to track your expenses?`;

    await ctx.reply(welcomeMessage);
    console.log(`User ${ctx.from.first_name} (${ctx.from.id}) started the bot`);
  } catch (error) {
    console.error('Error in start command:', error);
    await ctx.reply('Sorry, there was an error setting up your account. Please try again.');
  }
});

// Help command
bot.command('help', async (ctx) => {
  const helpMessage = `🧾 **Bill Bot Commands**

📸 **Send a photo** - I'll process any receipt automatically
💬 **Send text** - I'll try to help with your question

**Commands:**
/start - Welcome message
/help - Show this help
/jobs - List your active jobs
/newjob <name> - Create a new job/client
/job <name> - View expenses for a specific job
/tag last <job> - Tag most recent receipt to job
/summary - This month's spending
/export - Download CSV of receipts

**Job Tagging:**
• Send photo + caption: "Johnson bathroom"
• Reply to receipt with job name
• Use inline keyboard for quick selection

**Examples:**
"How much did I spend this month?"
"Show me receipts for the Johnson job"
"What did I spend on materials this week?"

Need help? Just ask me in plain English!`;

  await ctx.reply(helpMessage, { parse_mode: 'Markdown' });
});

// Jobs command
bot.command('jobs', async (ctx) => {
  try {
    const userId = await getOrCreateUser(ctx.from);
    
    const { data: jobs, error } = await supabase
      .from('jobs')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Error fetching jobs:', error);
      throw error;
    }
    
    if (!jobs || jobs.length === 0) {
      await ctx.reply('💼 No jobs found. Use /newjob <name> to create one!');
      return;
    }
    
    let message = '💼 **Your Jobs**\n\n';
    
    for (const job of jobs) {
      message += `📋 **${job.name}**\n`;
      if (job.client) {
        message += `   👤 Client: ${job.client}\n`;
      }
      message += `   📅 Created: ${new Date(job.created_at).toLocaleDateString()}\n`;
      message += `   📊 Status: ${job.status}\n\n`;
    }
    
    message += '💡 Use /newjob <name> to add a new job';
    
    await ctx.reply(message, { parse_mode: 'Markdown' });
    
  } catch (error) {
    console.error('Error in jobs command:', error);
    await ctx.reply('❌ Sorry, there was an error fetching your jobs.');
  }
});

// New job command
bot.command('newjob', async (ctx) => {
  try {
    const jobName = ctx.message.text.replace('/newjob', '').trim();
    
    if (!jobName) {
      await ctx.reply('💼 Please specify a job name. Example: /newjob Johnson bathroom renovation');
      return;
    }
    
    const userId = await getOrCreateUser(ctx.from);
    
    // Check if job already exists
    const { data: existingJobs, error: checkError } = await supabase
      .from('jobs')
      .select('id, name')
      .eq('user_id', userId)
      .ilike('name', jobName);
    
    if (checkError) {
      console.error('Error checking existing jobs:', checkError);
      throw checkError;
    }
    
    if (existingJobs && existingJobs.length > 0) {
      await ctx.reply(`💼 Job "${jobName}" already exists! Use /jobs to see all your jobs.`);
      return;
    }
    
    // Create new job
    const { data: newJob, error: createError } = await supabase
      .from('jobs')
      .insert({
        user_id: userId,
        name: jobName
      })
      .select()
      .single();
    
    if (createError) {
      console.error('Error creating job:', createError);
      throw createError;
    }
    
    await ctx.reply(`✅ Created job: **${jobName}**\n\n💡 Next time you send a receipt, you can tag it to this job!`, { parse_mode: 'Markdown' });
    
    console.log(`User ${ctx.from.id} created job: ${jobName}`);
    
  } catch (error) {
    console.error('Error in newjob command:', error);
    await ctx.reply('❌ Sorry, there was an error creating your job. Please try again.');
  }
});

// Job details command
bot.command('job', async (ctx) => {
  try {
    const jobName = ctx.message.text.replace('/job', '').trim();
    
    if (!jobName) {
      await ctx.reply('💼 Please specify a job name. Example: /job Johnson bathroom');
      return;
    }
    
    const userId = await getOrCreateUser(ctx.from);
    
    // Find the job
    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .select('id, name, client, created_at')
      .eq('user_id', userId.user_id)
      .ilike('name', `%${jobName}%`)
      .limit(1)
      .single();
      
    if (jobError || !job) {
      await ctx.reply(`❌ Job "${jobName}" not found. Use /jobs to see all your jobs.`);
      return;
    }
    
    // Get all receipts for this job
    const { data: receipts, error: receiptsError } = await supabase
      .from('receipts')
      .select('amount, vendor, receipt_date, category, description, created_at')
      .eq('job_id', job.id)
      .order('receipt_date', { ascending: false });
      
    if (receiptsError) {
      console.error('Error fetching receipts for job:', receiptsError);
      await ctx.reply('❌ Sorry, there was an error fetching job details.');
      return;
    }
    
    let message = `📄 **${job.name}**\n`;
    if (job.client) {
      message += `👤 Client: ${job.client}\n`;
    }
    message += `📅 Created: ${new Date(job.created_at).toLocaleDateString()}\n\n`;
    
    if (!receipts || receipts.length === 0) {
      message += '📂 No expenses yet for this job.\n\n';
      message += '💡 Tag receipts to this job by:\n';
      message += '• Sending photos with caption "' + job.name + '"\n';
      message += '• Using manual entry: "' + job.name + ' job: 50 materials"\n';
      message += '• Replying to receipt confirmations with job name';
    } else {
      const total = receipts.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);
      
      message += `💰 **Total: £${total.toFixed(2)}**\n`;
      message += `📂 **${receipts.length} expenses**\n\n`;
      
      // Group by category
      const byCategory = receipts.reduce((acc, r) => {
        const cat = r.category || 'other';
        if (!acc[cat]) {
          acc[cat] = { count: 0, total: 0 };
        }
        acc[cat].count++;
        acc[cat].total += parseFloat(r.amount) || 0;
        return acc;
      }, {});
      
      message += '**By Category:**\n';
      for (const [category, stats] of Object.entries(byCategory)) {
        const emoji = {
          materials: '🔧',
          fuel: '⛽',
          tools: '🔨',
          food: '🍴',
          labor: '👷',
          vehicle: '🚗',
          office: '💼',
          other: '📝'
        }[category] || '📝';
        
        message += `${emoji} ${category}: £${stats.total.toFixed(2)} (${stats.count} items)\n`;
      }
      
      message += '\n**Recent Expenses:**\n';
      const recentExpenses = receipts.slice(0, 5);
      for (const receipt of recentExpenses) {
        const date = new Date(receipt.receipt_date).toLocaleDateString();
        const amount = receipt.amount ? `£${parseFloat(receipt.amount).toFixed(2)}` : 'N/A';
        message += `• ${date} - ${receipt.vendor || 'Unknown'} - ${amount}\n`;
      }
      
      if (receipts.length > 5) {
        message += `\n🔽 ${receipts.length - 5} more expenses...`;
      }
    }
    
    await ctx.reply(message, { parse_mode: 'Markdown' });
    
  } catch (error) {
    console.error('Error in job command:', error);
    await ctx.reply('❌ Sorry, there was an error fetching job details.');
  }
});

// Tag command for retroactive tagging
bot.command('tag', async (ctx) => {
  try {
    const args = ctx.message.text.split(' ').slice(1); // Remove '/tag'
    
    if (args.length < 2) {
      await ctx.reply('🏷️ **Tag Usage:**\n\n' +
        '/tag last JobName - Tag the most recent receipt\n' +
        '/tag 3 JobName - Tag the 3rd most recent receipt\n\n' +
        'Example: /tag last Johnson bathroom');
      return;
    }
    
    const position = args[0].toLowerCase();
    const jobName = args.slice(1).join(' ');
    
    const userId = await getOrCreateUser(ctx.from);
    
    // Parse position
    let receiptIndex = 0;
    if (position === 'last') {
      receiptIndex = 0;
    } else if (position.match(/^\d+$/)) {
      receiptIndex = parseInt(position) - 1;
      if (receiptIndex < 0) {
        await ctx.reply('❌ Position must be 1 or higher (1 = most recent)');
        return;
      }
    } else {
      await ctx.reply('❌ Invalid position. Use "last" or a number (e.g. "3")');
      return;
    }
    
    // Find or create the job
    const job = await findOrCreateJob(userId.user_id, jobName);
    
    // Get user's receipts (untagged ones first, then all)
    const { data: receipts, error: receiptsError } = await supabase
      .from('receipts')
      .select('id, amount, vendor, receipt_date, category, job_id')
      .eq('user_id', userId.user_id)
      .order('created_at', { ascending: false });
      
    if (receiptsError) {
      console.error('Error fetching receipts:', receiptsError);
      await ctx.reply('❌ Sorry, there was an error fetching your receipts.');
      return;
    }
    
    if (!receipts || receipts.length === 0) {
      await ctx.reply('❌ No receipts found. Send me a photo or manual entry first!');
      return;
    }
    
    if (receiptIndex >= receipts.length) {
      await ctx.reply(`❌ You only have ${receipts.length} receipts. Try a smaller number.`);
      return;
    }
    
    const targetReceipt = receipts[receiptIndex];
    
    // Tag the receipt
    const { error: updateError } = await supabase
      .from('receipts')
      .update({ job_id: job.id })
      .eq('id', targetReceipt.id);
      
    if (updateError) {
      console.error('Error tagging receipt:', updateError);
      await ctx.reply('❌ Sorry, there was an error tagging the receipt.');
      return;
    }
    
    const receiptDesc = `£${parseFloat(targetReceipt.amount || 0).toFixed(2)} from ${targetReceipt.vendor || 'Unknown'} (${targetReceipt.category || 'other'})`;
    
    await ctx.reply(
      `✅ **Receipt tagged!**\n\n` +
      `📄 Receipt: ${receiptDesc}\n` +
      `🏷️ Job: **${job.name}**\n\n` +
      `💡 Use /job ${job.name} to see all expenses for this job.`,
      { parse_mode: 'Markdown' }
    );
    
    console.log(`Tagged receipt ${targetReceipt.id} to job ${job.name}`);
    
  } catch (error) {
    console.error('Error in tag command:', error);
    await ctx.reply('❌ Sorry, there was an error tagging the receipt.');
  }
});

// Summary command
bot.command('summary', async (ctx) => {
  try {
    const userId = await getOrCreateUser(ctx.from);
    const args = ctx.message.text.split(' ').slice(1); // Remove '/summary'
    
    let startDate, endDate, periodName;
    
    if (args.length === 0) {
      // Default to current month
      const now = new Date();
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      periodName = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    } else if (args[0] === 'week') {
      // Current week (Monday to Sunday)
      const now = new Date();
      const monday = new Date(now.setDate(now.getDate() - now.getDay() + 1));
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      startDate = monday;
      endDate = sunday;
      periodName = 'This Week';
    } else if (args[0] === 'lastweek') {
      // Last week
      const now = new Date();
      const monday = new Date(now.setDate(now.getDate() - now.getDay() + 1 - 7));
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      startDate = monday;
      endDate = sunday;
      periodName = 'Last Week';
    } else if (args[0] === 'lastmonth') {
      // Last month
      const now = new Date();
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
      startDate = lastMonth;
      endDate = lastMonthEnd;
      periodName = lastMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    } else {
      // Try to parse as YYYY-MM format
      const [year, month] = args[0].split('-');
      if (year && month) {
        const yearNum = parseInt(year);
        const monthNum = parseInt(month) - 1; // JS months are 0-indexed
        startDate = new Date(yearNum, monthNum, 1);
        endDate = new Date(yearNum, monthNum + 1, 0);
        periodName = startDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      } else {
        await ctx.reply(
          '❌ Invalid format. Examples:\n' +
          '/summary - This month\n' +
          '/summary week - This week\n' +
          '/summary lastweek - Last week\n' +
          '/summary lastmonth - Last month\n' +
          '/summary 2026-03 - March 2026'
        );
        return;
      }
    }
    
    // Format dates for SQL
    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];
    
    // Get spending summary using the SQL function
    const { data: summary, error } = await supabase.rpc('get_spending_summary', {
      p_telegram_id: ctx.from.id,
      p_start_date: startDateStr,
      p_end_date: endDateStr
    });
    
    if (error) {
      console.error('Error getting spending summary:', error);
      throw error;
    }
    
    if (!summary || summary.length === 0) {
      await ctx.reply(`📊 **${periodName} Summary**\n\nNo receipts found for this period.`, { parse_mode: 'Markdown' });
      return;
    }
    
    const summaryData = summary[0];
    const totalAmount = parseFloat(summaryData.total_amount) || 0;
    const categoryBreakdown = summaryData.category_breakdown || {};
    const jobBreakdown = summaryData.job_breakdown || {};
    const receiptCount = summaryData.receipt_count || 0;
    
    let message = `📊 **${periodName} Summary**\n\n`;
    message += `💰 **Total Spent:** £${totalAmount.toFixed(2)}\n`;
    message += `📄 **Receipts:** ${receiptCount}\n\n`;
    
    // Category breakdown
    if (Object.keys(categoryBreakdown).length > 0) {
      message += `📂 **By Category:**\n`;
      const categories = Object.entries(categoryBreakdown)
        .sort(([,a], [,b]) => parseFloat(b) - parseFloat(a))
        .slice(0, 8); // Top 8 categories
      
      for (const [category, amount] of categories) {
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
        
        const percentage = totalAmount > 0 ? ((parseFloat(amount) / totalAmount) * 100).toFixed(0) : 0;
        message += `  ${categoryEmoji} ${category}: £${parseFloat(amount).toFixed(2)} (${percentage}%)\n`;
      }
      message += '\n';
    }
    
    // Job breakdown
    if (Object.keys(jobBreakdown).length > 0) {
      message += `💼 **By Job:**\n`;
      const jobs = Object.entries(jobBreakdown)
        .sort(([,a], [,b]) => parseFloat(b) - parseFloat(a))
        .slice(0, 5); // Top 5 jobs
      
      for (const [jobName, amount] of jobs) {
        const percentage = totalAmount > 0 ? ((parseFloat(amount) / totalAmount) * 100).toFixed(0) : 0;
        message += `  🏷️ ${jobName}: £${parseFloat(amount).toFixed(2)} (${percentage}%)\n`;
      }
      
      if (Object.keys(jobBreakdown).length > 5) {
        message += `  ... and ${Object.keys(jobBreakdown).length - 5} more jobs\n`;
      }
    }
    
    // Add tips
    message += `\n💡 **Tips:**\n`;
    message += `• Use \`/export\` to download CSV\n`;
    message += `• Use \`/summary week\` for weekly view\n`;
    message += `• Tag receipts to jobs for better tracking`;
    
    await ctx.reply(message, { parse_mode: 'Markdown' });
    
    console.log(`Summary generated for user ${ctx.from.id}: ${periodName}`);
    
  } catch (error) {
    console.error('Error in summary command:', error);
    await ctx.reply('❌ Sorry, there was an error generating your summary. Please try again.');
  }
});

// Recent receipts command
bot.command('recent', async (ctx) => {
  try {
    const userId = await getOrCreateUser(ctx.from);
    
    const { data: receipts, error } = await supabase
      .from('receipts')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(5);
    
    if (error) {
      console.error('Error fetching recent receipts:', error);
      throw error;
    }
    
    if (!receipts || receipts.length === 0) {
      await ctx.reply('📄 No receipts found. Send me a photo of a receipt to get started!');
      return;
    }
    
    let message = '📄 **Recent Receipts**\n\n';
    
    receipts.forEach((receipt, index) => {
      const amount = receipt.amount ? `£${receipt.amount}` : 'Unknown';
      const date = receipt.receipt_date || 'Unknown date';
      const vendor = receipt.vendor || 'Unknown vendor';
      const category = receipt.category || 'other';
      
      message += `${index + 1}. **${vendor}** - ${amount}\n`;
      message += `   📅 ${date} • 📂 ${category}\n`;
      if (receipt.description && receipt.description !== 'Receipt processed') {
        message += `   📝 ${receipt.description}\n`;
      }
      message += '\n';
    });
    
    message += '💡 Use /summary for totals by category (coming soon)';
    
    await ctx.reply(message, { parse_mode: 'Markdown' });
    
  } catch (error) {
    console.error('Error in recent command:', error);
    await ctx.reply('❌ Sorry, there was an error fetching your recent receipts.');
  }
});

// Photo message handler
bot.on('message:photo', async (ctx) => {
  try {
    console.log(`Received photo from ${ctx.from.first_name} (${ctx.from.id})`);
    
    // Send initial processing message
    const processingMsg = await ctx.reply('📸 Processing your receipt with AI...');
    
    // Get user ID
    const userId = await getOrCreateUser(ctx.from);
    
    // Check if there's a caption for job tagging
    const caption = ctx.message.caption?.trim();
    let jobId = null;
    let jobName = null;
    
    if (caption) {
      try {
        const job = await findOrCreateJob(userId, caption);
        jobId = job.id;
        jobName = job.name;
        console.log(`Tagged to job: ${jobName} (${jobId})`);
      } catch (jobError) {
        console.error('Error handling job from caption:', jobError);
        // Continue processing without job tagging
      }
    }
    
    // Get the largest photo size
    const photo = ctx.message.photo[ctx.message.photo.length - 1];
    const fileName = `receipt_${Date.now()}.jpg`;
    
    // Download photo
    const localPath = await downloadFile(photo.file_id, fileName);
    console.log(`Downloaded photo to: ${localPath}`);
    
    // Update processing message for OCR step
    await ctx.api.editMessageText(
      ctx.chat.id,
      processingMsg.message_id,
      '🤖 Analyzing receipt with Claude Vision...'
    );
    
    // Process with Claude Vision
    const extractedData = await processReceipt(localPath);
    console.log('Extracted data:', extractedData);
    
    // Upload to Supabase
    const imageUrl = await uploadToSupabase(localPath, fileName, userId);
    console.log(`Uploaded to Supabase: ${imageUrl}`);
    
    // Store receipt record with extracted data
    const { data: receiptData, error: receiptError } = await supabase
      .from('receipts')
      .insert({
        user_id: userId,
        job_id: jobId,
        image_url: imageUrl,
        telegram_message_id: ctx.message.message_id,
        amount: extractedData.amount,
        vendor: extractedData.vendor,
        receipt_date: extractedData.date,
        category: extractedData.category,
        description: extractedData.description,
        raw_ocr_text: extractedData.raw_ocr_text
      })
      .select()
      .single();
    
    if (receiptError) {
      console.error('Error saving receipt:', receiptError);
      throw receiptError;
    }
    
    // Format and send results
    let resultMessage = formatReceiptData(extractedData);
    
    // Add job tag info if tagged
    if (jobName) {
      resultMessage += `\n🏷️ Tagged to: **${jobName}**`;
    } else {
      resultMessage += `\n🏷️ No job tagged`;
    }
    
    // Get user's recent jobs for inline keyboard
    const recentJobs = await getUserJobs(userId, 5);
    
    // Create inline keyboard for job tagging (if not already tagged)
    let keyboard = null;
    if (!jobId && recentJobs.length > 0) {
      const buttons = recentJobs.map(job => ([
        {
          text: job.name,
          callback_data: `tag_${receiptData.id}_${job.id}`
        }
      ]));
      
      // Add "New Job" button
      buttons.push([
        {
          text: '➕ New Job',
          callback_data: `newjob_${receiptData.id}`
        }
      ]);
      
      keyboard = {
        inline_keyboard: buttons
      };
      
      resultMessage += `\n\n💡 Quick tag to a job:`;
    }
    
    // Update processing message with results
    await ctx.api.editMessageText(
      ctx.chat.id,
      processingMsg.message_id,
      resultMessage,
      { 
        parse_mode: 'Markdown',
        reply_markup: keyboard
      }
    );
    
    console.log(`Receipt processed and saved for user ${ctx.from.id}: ${receiptData.id}`);
    
    // Send cost estimate if low confidence
    if (extractedData.confidence < 0.7) {
      await ctx.reply(
        '💡 **Need better results?** \n\n' +
        'For better OCR accuracy:\n' +
        '• Ensure good lighting\n' +
        '• Keep receipt flat and straight\n' +
        '• Avoid shadows or glare\n' +
        '• Take photo directly above receipt',
        { parse_mode: 'Markdown' }
      );
    }
    
  } catch (error) {
    console.error('Error processing photo:', error);
    
    // Update or send error message
    try {
      const errorMsg = '❌ Sorry, there was an error processing your receipt. The photo has been saved but OCR failed. You can manually add details or try uploading again with better lighting.';
      
      if (ctx.message.photo) {
        await ctx.reply(errorMsg);
      }
    } catch (replyError) {
      console.error('Error sending error message:', replyError);
    }
  }
});

// Callback query handler for inline keyboards
bot.on('callback_query', async (ctx) => {
  try {
    const data = ctx.callbackQuery.data;
    console.log(`Callback query from ${ctx.from.first_name}: ${data}`);
    
    if (data.startsWith('tag_')) {
      // Handle job tagging: tag_receiptId_jobId
      const [_, receiptId, jobId] = data.split('_');
      
      // Get job name for confirmation
      const { data: job, error: jobError } = await supabase
        .from('jobs')
        .select('name')
        .eq('id', jobId)
        .single();
      
      if (jobError || !job) {
        await ctx.answerCallbackQuery('Job not found', { show_alert: true });
        return;
      }
      
      // Tag receipt to job
      await tagReceiptToJob(receiptId, jobId);
      
      // Update the message
      const updatedMessage = ctx.callbackQuery.message.text.replace(
        /🏷️ No job tagged/,
        `🏷️ Tagged to: **${job.name}**`
      ).replace(/\n\n💡 Quick tag to a job:/, '');
      
      await ctx.editMessageText(
        updatedMessage,
        { parse_mode: 'Markdown' }
      );
      
      await ctx.answerCallbackQuery(`Tagged to ${job.name}!`);
      
    } else if (data.startsWith('newjob_')) {
      // Handle new job creation: newjob_receiptId
      const receiptId = data.split('_')[1];
      
      await ctx.answerCallbackQuery();
      await ctx.reply(
        `📋 Creating a new job for this receipt.\n\nReply to this message with the job name.\n\nExample: "Johnson bathroom renovation"`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            force_reply: true,
            input_field_placeholder: "Enter job name..."
          }
        }
      );
    }
    
  } catch (error) {
    console.error('Error handling callback query:', error);
    await ctx.answerCallbackQuery('Error occurred', { show_alert: true });
  }
});

// Text message handler
bot.on('message:text', async (ctx) => {
  try {
    console.log(`Received text from ${ctx.from.first_name} (${ctx.from.id}): ${ctx.message.text}`);
    
    // Skip if it's a command (already handled above)
    if (ctx.message.text.startsWith('/')) {
      return;
    }
    
    // Get user ID
    const userId = await getOrCreateUser(ctx.from);
    
    // Check if this is a reply to a receipt (job tagging)
    if (ctx.message.reply_to_message) {
      const replyText = ctx.message.reply_to_message.text;
      
      // Look for receipt confirmation message pattern
      if (replyText && (replyText.includes('✅ Got it!') || replyText.includes('📸 Receipt processed') || replyText.includes('🏪'))) {
        const jobName = ctx.message.text.trim();
        
        // Find the most recent receipt for this user that hasn't been tagged
        const { data: recentReceipt, error: receiptError } = await supabase
          .from('receipts')
          .select('id, job_id')
          .eq('user_id', userId)
          .is('job_id', null)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();
        
        if (!receiptError && recentReceipt) {
          try {
            const job = await findOrCreateJob(userId, jobName);
            await tagReceiptToJob(recentReceipt.id, job.id);
            
            await ctx.reply(
              `✅ Tagged receipt to: **${job.name}**`,
              { parse_mode: 'Markdown' }
            );
            
            console.log(`Tagged receipt ${recentReceipt.id} to job ${job.name}`);
            return;
          } catch (tagError) {
            console.error('Error tagging receipt via reply:', tagError);
            await ctx.reply('❌ Sorry, there was an error tagging the receipt. Please try again.');
            return;
          }
        }
      }
      
      // Handle new job creation reply
      if (replyText && replyText.includes('Reply to this message with the job name')) {
        const jobName = ctx.message.text.trim();
        
        try {
          const job = await findOrCreateJob(userId, jobName);
          
          await ctx.reply(
            `✅ Created job: **${job.name}**\n\n💡 Use /jobs to see all your jobs.`,
            { parse_mode: 'Markdown' }
          );
          
          console.log(`Created new job via reply: ${job.name}`);
          return;
        } catch (jobError) {
          console.error('Error creating job via reply:', jobError);
          await ctx.reply('❌ Sorry, there was an error creating the job. Please try again.');
          return;
        }
      }
    }
    
    // Try to parse as manual expense entry
    const expenseData = await parseManualExpense(ctx.message.text, userId.user_id);
    
    if (expenseData.error) {
      await ctx.reply(`❌ ${expenseData.error}\n\n💡 Try formats like:\n• "45.50 materials"\n• "32 fuel from Shell"\n• "Johnson job: 120 materials"`);
      return;
    }
    
    if (expenseData.amount) {
      try {
        // Save manual expense entry to database
        const receiptData = {
          user_id: userId.user_id,
          job_id: expenseData.jobId,
          amount: expenseData.amount,
          vendor: expenseData.vendor,
          receipt_date: new Date().toISOString().split('T')[0],
          category: expenseData.category,
          description: expenseData.description,
          raw_ocr_text: `Manual entry: ${ctx.message.text}`,
          telegram_message_id: ctx.message.message_id,
          image_url: null // No image for manual entries
        };
        
        const { data: receipt, error: receiptError } = await supabase
          .from('receipts')
          .insert(receiptData)
          .select()
          .single();
          
        if (receiptError) {
          console.error('Error saving manual expense:', receiptError);
          await ctx.reply('❌ Sorry, there was an error saving your expense. Please try again.');
          return;
        }
        
        // Format confirmation message
        let confirmMessage = `✅ **Manual expense added**\n\n`;
        confirmMessage += `💰 **Amount:** £${expenseData.amount.toFixed(2)}\n`;
        confirmMessage += `🏪 **Vendor:** ${expenseData.vendor}\n`;
        confirmMessage += `📅 **Date:** ${receiptData.receipt_date}\n`;
        confirmMessage += `📂 **Category:** ${expenseData.category.charAt(0).toUpperCase() + expenseData.category.slice(1)}\n`;
        confirmMessage += `📝 **Description:** ${expenseData.description}\n`;
        
        if (expenseData.jobName) {
          confirmMessage += `🏷️ **Job:** ${expenseData.jobName}\n`;
        } else {
          confirmMessage += `🏷️ **Job:** None (reply with job name to tag)\n`;
        }
        
        await ctx.reply(confirmMessage, { parse_mode: 'Markdown' });
        
        console.log(`Manual expense added: £${expenseData.amount} ${expenseData.category} by ${ctx.from.first_name}`);
        return;
        
      } catch (error) {
        console.error('Error processing manual expense:', error);
        await ctx.reply('❌ Sorry, there was an error processing your expense. Please try again.');
        return;
      }
    }
    
    // Try to process as natural language query about spending
    try {
      const queryResult = await processNaturalLanguageQuery(ctx.message.text, userId.user_id);
      
      if (queryResult.error) {
        console.log('NLP Query error:', queryResult.error);
        // Fall back to simple responses
        const text = ctx.message.text.toLowerCase();
        
        if (text.includes('help') || text.includes('how')) {
          await ctx.reply('👋 I can help you track expenses! Send me a photo of a receipt and I\'ll process it. Use /help to see all commands.');
        } else if (text.includes('summary') || text.includes('spending') || text.includes('total')) {
          await ctx.reply('📊 Try asking: "How much did I spend this month?" or "What are my expenses?"');
        } else if (text.includes('job') || text.includes('project') || text.includes('client')) {
          await ctx.reply('💼 Try asking: "Show me expenses for [job name]" or use /job <name>');
        } else {
          await ctx.reply(`💬 I received your message: "${ctx.message.text}"\n\nI can answer questions about your spending! Try asking:\n• "How much did I spend this month?"\n• "Show materials expenses"\n• "What did I spend on Johnson job?"\n\nOr use /help for commands.`);
        }
        return;
      }
      
      if (queryResult.answer && queryResult.answer.trim()) {
        // Successfully processed as spending query
        await ctx.reply(queryResult.answer, { parse_mode: 'Markdown' });
        console.log(`Processed NLP query: "${ctx.message.text}" -> ${queryResult.data?.length || 0} results`);
      } else {
        // No relevant data found
        await ctx.reply('💬 I understood your question, but couldn\'t find any relevant expenses.\n\n📸 Send me some receipts first, or use /help for available commands.');
      }
      
    } catch (nlpError) {
      console.error('NLP processing error:', nlpError);
      // Fall back to simple response
      await ctx.reply(`💬 I received your message: "${ctx.message.text}"\n\nI can answer questions about your spending! Try asking:\n• "How much did I spend this month?"\n• "Show materials expenses"\n• "What did I spend on Johnson job?"\n\nOr use /help for commands.`);
    }
    
  } catch (error) {
    console.error('Error processing text message:', error);
    await ctx.reply('❌ Sorry, I had trouble understanding that. Try /help for available commands.');
  }
});

// Unsupported message types
bot.on('message', async (ctx) => {
  // Only handle unsupported types (not photo or text)
  if (ctx.message.photo || ctx.message.text) {
    return;
  }
  
  await ctx.reply(`🤔 I can only process photos and text messages right now.

📸 **Send me a photo** of your receipt
💬 **Send me text** with questions

Use /help to see what I can do!`);
});

// Error handling
bot.catch((err) => {
  const ctx = err.ctx;
  console.error(`Error while handling update ${ctx.update.update_id}:`);
  
  const e = err.error;
  if (e instanceof GrammyError) {
    console.error('Error in request:', e.description);
  } else if (e instanceof HttpError) {
    console.error('Could not contact Telegram:', e);
  } else {
    console.error('Unknown error:', e);
  }
});

// Start the bot
async function startBot() {
  try {
    console.log('🚀 Starting Bill Bot...');
    
    // Test database connection
    const { data, error } = await supabase
      .from('users')
      .select('count')
      .limit(1);
    
    if (error) {
      console.error('Database connection failed:', error);
      process.exit(1);
    }
    
    console.log('✅ Database connection successful');
    
    // Start bot
    await bot.start();
    console.log('🤖 Bill Bot is running!');
    
    // Setup automated summaries
    setupCronJobs();
    
  } catch (error) {
    console.error('Failed to start bot:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🛑 Received SIGTERM, shutting down gracefully...');
  await bot.stop();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('🛑 Received SIGINT, shutting down gracefully...');
  await bot.stop();
  process.exit(0);
});

// Automated summary functions
async function sendWeeklySummary() {
  try {
    console.log('Sending weekly summaries...');
    
    // Get all users who have receipts in the last 30 days
    const { data: activeUsers, error } = await supabase
      .rpc('get_active_users_last_30_days');
    
    if (error) {
      console.error('Error fetching active users:', error);
      return;
    }
    
    if (!activeUsers || activeUsers.length === 0) {
      console.log('No active users found for weekly summary');
      return;
    }
    
    for (const user of activeUsers) {
      try {
        // Calculate last week dates
        const now = new Date();
        const lastSunday = new Date(now.setDate(now.getDate() - now.getDay()));
        const lastMonday = new Date(lastSunday);
        lastMonday.setDate(lastSunday.getDate() - 6);
        
        const startDateStr = lastMonday.toISOString().split('T')[0];
        const endDateStr = lastSunday.toISOString().split('T')[0];
        
        // Get summary
        const { data: summary, error: summaryError } = await supabase.rpc('get_spending_summary', {
          p_telegram_id: user.telegram_id,
          p_start_date: startDateStr,
          p_end_date: endDateStr
        });
        
        if (summaryError || !summary || summary.length === 0) {
          console.log(`No data for user ${user.telegram_id}`);
          continue;
        }
        
        const summaryData = summary[0];
        const totalAmount = parseFloat(summaryData.total_amount) || 0;
        const receiptCount = summaryData.receipt_count || 0;
        
        if (totalAmount === 0) {
          console.log(`No spending for user ${user.telegram_id}`);
          continue;
        }
        
        // Format message
        let message = `📅 **Weekly Summary** (${lastMonday.toLocaleDateString()} - ${lastSunday.toLocaleDateString()})\n\n`;
        message += `💰 **Total Spent:** £${totalAmount.toFixed(2)}\n`;
        message += `📄 **Receipts:** ${receiptCount}\n\n`;
        
        // Add top categories
        const categoryBreakdown = summaryData.category_breakdown || {};
        if (Object.keys(categoryBreakdown).length > 0) {
          message += `🏆 **Top Categories:**\n`;
          const topCategories = Object.entries(categoryBreakdown)
            .sort(([,a], [,b]) => parseFloat(b) - parseFloat(a))
            .slice(0, 3);
          
          for (const [category, amount] of topCategories) {
            message += `  • ${category}: £${parseFloat(amount).toFixed(2)}\n`;
          }
        }
        
        message += `\n💡 Use /summary for detailed breakdown`;
        
        // Send message
        await bot.api.sendMessage(user.telegram_id, message, { parse_mode: 'Markdown' });
        console.log(`Weekly summary sent to user ${user.telegram_id}`);
        
        // Add small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (userError) {
        console.error(`Error sending weekly summary to user ${user.telegram_id}:`, userError);
      }
    }
    
  } catch (error) {
    console.error('Error in sendWeeklySummary:', error);
  }
}

async function sendMonthlySummary() {
  try {
    console.log('Sending monthly summaries...');
    
    // Similar to weekly but for last month
    const { data: activeUsers, error } = await supabase
      .rpc('get_active_users_last_30_days');
    
    if (error) {
      console.error('Error fetching active users:', error);
      return;
    }
    
    if (!activeUsers || activeUsers.length === 0) {
      console.log('No active users found for monthly summary');
      return;
    }
    
    for (const user of activeUsers) {
      try {
        // Calculate last month dates
        const now = new Date();
        const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
        
        const startDateStr = lastMonth.toISOString().split('T')[0];
        const endDateStr = lastMonthEnd.toISOString().split('T')[0];
        
        // Get summary
        const { data: summary, error: summaryError } = await supabase.rpc('get_spending_summary', {
          p_telegram_id: user.telegram_id,
          p_start_date: startDateStr,
          p_end_date: endDateStr
        });
        
        if (summaryError || !summary || summary.length === 0) {
          console.log(`No monthly data for user ${user.telegram_id}`);
          continue;
        }
        
        const summaryData = summary[0];
        const totalAmount = parseFloat(summaryData.total_amount) || 0;
        const receiptCount = summaryData.receipt_count || 0;
        
        if (totalAmount === 0) {
          console.log(`No monthly spending for user ${user.telegram_id}`);
          continue;
        }
        
        // Format message
        const monthName = lastMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        let message = `📆 **Monthly Summary - ${monthName}**\n\n`;
        message += `💰 **Total Spent:** £${totalAmount.toFixed(2)}\n`;
        message += `📄 **Receipts:** ${receiptCount}\n\n`;
        
        // Add category and job breakdown
        const categoryBreakdown = summaryData.category_breakdown || {};
        const jobBreakdown = summaryData.job_breakdown || {};
        
        if (Object.keys(categoryBreakdown).length > 0) {
          message += `🏆 **Top Categories:**\n`;
          const topCategories = Object.entries(categoryBreakdown)
            .sort(([,a], [,b]) => parseFloat(b) - parseFloat(a))
            .slice(0, 3);
          
          for (const [category, amount] of topCategories) {
            message += `  • ${category}: £${parseFloat(amount).toFixed(2)}\n`;
          }
          message += '\n';
        }
        
        if (Object.keys(jobBreakdown).length > 0) {
          message += `💼 **Top Jobs:**\n`;
          const topJobs = Object.entries(jobBreakdown)
            .sort(([,a], [,b]) => parseFloat(b) - parseFloat(a))
            .slice(0, 3);
          
          for (const [jobName, amount] of topJobs) {
            message += `  • ${jobName}: £${parseFloat(amount).toFixed(2)}\n`;
          }
          message += '\n';
        }
        
        message += `📊 Use /summary lastmonth for full details`;
        
        // Send message
        await bot.api.sendMessage(user.telegram_id, message, { parse_mode: 'Markdown' });
        console.log(`Monthly summary sent to user ${user.telegram_id}`);
        
        // Add small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (userError) {
        console.error(`Error sending monthly summary to user ${user.telegram_id}:`, userError);
      }
    }
    
  } catch (error) {
    console.error('Error in sendMonthlySummary:', error);
  }
}

// Setup cron jobs
function setupCronJobs() {
  // Weekly summary every Sunday at 7 PM
  cron.schedule('0 19 * * 0', () => {
    console.log('Running weekly summary cron job...');
    sendWeeklySummary();
  }, {
    timezone: "Europe/London"
  });
  
  // Monthly summary on 1st of month at 9 AM
  cron.schedule('0 9 1 * *', () => {
    console.log('Running monthly summary cron job...');
    sendMonthlySummary();
  }, {
    timezone: "Europe/London"
  });
  
  console.log('✅ Cron jobs scheduled: Weekly (Sun 7PM), Monthly (1st 9AM)');
}

// Start the application
if (require.main === module) {
  startBot();
}

module.exports = { bot, supabase };