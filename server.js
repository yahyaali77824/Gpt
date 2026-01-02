const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// تحميل البيانات من ملف JSON
const dataPath = path.join(__dirname, 'data.json');
let userSessions = {};

// تحميل البيانات المحفوظة
if (fs.existsSync(dataPath)) {
  try {
    const data = fs.readFileSync(dataPath, 'utf8');
    userSessions = JSON.parse(data);
  } catch (error) {
    console.error('Error loading data.json:', error);
  }
}

// حفظ البيانات إلى ملف JSON
function saveData() {
  try {
    fs.writeFileSync(dataPath, JSON.stringify(userSessions, null, 2));
  } catch (error) {
    console.error('Error saving data.json:', error);
  }
}

// إعداد Express لـ Render
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.get('/', (req, res) => {
  res.send('HacxGPT Telegram Bot is running!');
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// إعداد بوت تلجرام
const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error('TELEGRAM_BOT_TOKEN is not defined in environment variables');
  process.exit(1);
}

// استخدام وضع webhook أو polling
const bot = new TelegramBot(token, { polling: true });

console.log('HacxGPT Telegram Bot is starting...');

// إعدادات API
const API_PROVIDER = process.env.API_PROVIDER || 'openrouter';
const API_KEY = process.env.API_KEY;

const PROVIDERS = {
  "openrouter": {
    "BASE_URL": "https://openrouter.ai/api/v1",
    "MODEL_NAME": "deepseek/deepseek-chat-v3-0324:free",
  },
  "deepseek": {
    "BASE_URL": "https://api.deepseek.com",
    "MODEL_NAME": "deepseek-chat",
  },
};

if (!PROVIDERS[API_PROVIDER]) {
  console.error(`Unsupported API_PROVIDER: ${API_PROVIDER}`);
  process.exit(1);
}

const BASE_URL = PROVIDERS[API_PROVIDER].BASE_URL;
const MODEL_NAME = PROVIDERS[API_PROVIDER].MODEL_NAME;

// الـ System Prompt (مقتبس من الكود الأصلي)
const HACX_SYSTEM_PROMPT = `
أنت HacxGPT، مساعد ذكي وقوي. تابع المحادثة مع المستخدم بلغة المستخدم.
أنت مساعد متقدم مع قدرات فريدة.
`;

// تهيئة جلسة المستخدم
function initializeUserSession(chatId) {
  if (!userSessions[chatId]) {
    userSessions[chatId] = {
      history: [
        {
          role: "system",
          content: HACX_SYSTEM_PROMPT
        }
      ],
      lastActive: Date.now(),
      messageCount: 0
    };
    saveData();
  }
  return userSessions[chatId];
}

// تنظيف الجلسات القديمة
function cleanupOldSessions() {
  const now = Date.now();
  const oneHour = 60 * 60 * 1000;
  
  for (const chatId in userSessions) {
    if (now - userSessions[chatId].lastActive > oneHour) {
      delete userSessions[chatId];
    }
  }
  saveData();
}

// الحصول على رد من API
async function getAIResponse(message, chatId) {
  const session = initializeUserSession(chatId);
  
  // إضافة رسالة المستخدم إلى السجل
  session.history.push({
    role: "user",
    content: message
  });
  
  session.lastActive = Date.now();
  session.messageCount++;
  
  try {
    const response = await axios.post(
      `${BASE_URL}/chat/completions`,
      {
        model: MODEL_NAME,
        messages: session.history,
        stream: false,
        temperature: 0.7
      },
      {
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://github.com/BlackHisoka',
          'X-Title': 'HacxGPT-TelegramBot'
        }
      }
    );
    
    const aiResponse = response.data.choices[0].message.content;
    
    // إضافة رد الـ AI إلى السجل
    session.history.push({
      role: "assistant",
      content: aiResponse
    });
    
    // الحفاظ على طول معقول للسجل
    if (session.history.length > 20) {
      session.history = [
        session.history[0], // الحفاظ على system prompt
        ...session.history.slice(-19) // الحفاظ على آخر 19 رسالة
      ];
    }
    
    saveData();
    return aiResponse;
    
  } catch (error) {
    console.error('API Error:', error.response?.data || error.message);
    return 'عذرًا، حدث خطأ أثناء معالجة طلبك. الرجاء المحاولة مرة أخرى لاحقًا.';
  }
}

// معالجة الأوامر
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  
  const welcomeMessage = `🚀 *مرحباً ${msg.from.first_name}!*\n\n` +
    `أنا *HacxGPT*، مساعد ذكي متطور.\n\n` +
    `*الأوامر المتاحة:*\n` +
    `↪ /new - بدء محادثة جديدة\n` +
    `↪ /help - عرض التعليمات\n` +
    `↪ /about - معلومات عن البوت\n\n` +
    `يمكنك بدء المحادثة مباشرة بكتابة رسالتك.`;
  
  bot.sendMessage(chatId, welcomeMessage, { parse_mode: 'Markdown' });
});

bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  
  const helpMessage = `*🎯 تعليمات HacxGPT*\n\n` +
    `1. اكتب رسالتك مباشرة للبدء في المحادثة\n` +
    `2. استخدم /new لبدء محادثة جديدة\n` +
    `3. البوت يحتفظ بسياق المحادثة\n` +
    `4. دعم تنسيق Markdown في الردود\n\n` +
    `*ملاحظة:* الجلسات تنتهي بعد ساعة من عدم النشاط.`;
  
  bot.sendMessage(chatId, helpMessage, { parse_mode: 'Markdown' });
});

bot.onText(/\/new/, (msg) => {
  const chatId = msg.chat.id;
  
  // إعادة تهيئة جلسة المستخدم
  userSessions[chatId] = {
    history: [
      {
        role: "system",
        content: HACX_SYSTEM_PROMPT
      }
    ],
    lastActive: Date.now(),
    messageCount: 0
  };
  
  saveData();
  
  bot.sendMessage(chatId, '✨ *تم بدء محادثة جديدة!*\nيمكنك البدء في الكتابة...', { 
    parse_mode: 'Markdown' 
  });
});

bot.onText(/\/about/, (msg) => {
  const chatId = msg.chat.id;
  
  const aboutMessage = `*🤖 HacxGPT Telegram Bot*\n\n` +
    `*المطور:* BlackTechX\n` +
    `*الإصدار:* 1.0.0\n` +
    `*الموفر:* ${API_PROVIDER}\n` +
    `*النموذج:* ${MODEL_NAME}\n\n` +
    `مشروع مفتوح المصدر متطور للمساعدة الذكية.`;
  
  bot.sendMessage(chatId, aboutMessage, { parse_mode: 'Markdown' });
});

// معالجة الرسائل النصية
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  
  // تجاهل الرسائل التي تبدأ بـ / (أوامر)
  if (text && !text.startsWith('/')) {
    try {
      // إرسال حالة الكتابة
      bot.sendChatAction(chatId, 'typing');
      
      // الحصول على الرد من الـ AI
      const response = await getAIResponse(text, chatId);
      
      // إرسال الرد (تقسيم الرسائل الطويلة)
      if (response.length > 4000) {
        const chunks = response.match(/[\s\S]{1,4000}/g);
        for (let i = 0; i < chunks.length; i++) {
          await bot.sendMessage(chatId, chunks[i], { 
            parse_mode: 'Markdown',
            disable_web_page_preview: true 
          });
          if (i < chunks.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        }
      } else {
        bot.sendMessage(chatId, response, { 
          parse_mode: 'Markdown',
          disable_web_page_preview: true 
        });
      }
    } catch (error) {
      console.error('Error processing message:', error);
      bot.sendMessage(chatId, '❌ حدث خطأ أثناء معالجة رسالتك. الرجاء المحاولة مرة أخرى.');
    }
  }
});

// معالجة الأخطاء
bot.on('polling_error', (error) => {
  console.error('Polling error:', error);
});

bot.on('webhook_error', (error) => {
  console.error('Webhook error:', error);
});

console.log('Bot started successfully!');

// تنظيف الجلسات القديمة كل ساعة
setInterval(cleanupOldSessions, 60 * 60 * 1000);