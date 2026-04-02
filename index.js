// Bill Bot MVP1 - Telegram Bot for Receipt Tracking
// Created for issue #11: Telegram bot receives photos and text messages

require('dotenv').config();
const { Bot, GrammyError, HttpError } = require('grammy');
const { createClient } = require('@supabase/supabase-js');
const { processReceipt, formatReceiptData, estimateProcessingCost } = require('./claude-vision');
const fs = require('fs');
const https = require('https');
const path = require('path');

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

// Helper function to get or create user
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
    
    return data;
  } catch (error) {
    console.error('Error in getOrCreateUser:', error);
    throw error;
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
    
    // Simple responses for common queries
    const text = ctx.message.text.toLowerCase();
    
    if (text.includes('help') || text.includes('how')) {
      await ctx.reply('👋 I can help you track expenses! Send me a photo of a receipt and I\'ll process it. Use /help to see all commands.');
    } else if (text.includes('summary') || text.includes('spending') || text.includes('total')) {
      await ctx.reply('📊 Spending summaries coming soon! Use /summary command when it\'s ready.');
    } else if (text.includes('job') || text.includes('project') || text.includes('client')) {
      await ctx.reply('💼 Job tracking works! Use /jobs to see jobs or /newjob <name> to create one.');
    } else {
      // Generic helpful response
      await ctx.reply(`💬 I received your message: "${ctx.message.text}"

I'm still learning! Right now I can:
📸 Process receipt photos
🏷️ Tag receipts to jobs
💬 Answer basic questions

More AI features coming soon! Use /help to see what I can do.`);
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

// Start the application
if (require.main === module) {
  startBot();
}

module.exports = { bot, supabase };