import 'dotenv/config';
import TelegramBot from 'node-telegram-bot-api';

const botToken = process.argv[2] || process.env.TELEGRAM_BOT_TOKEN;

if (!botToken) {
  console.error('❌ No bot token provided');
  console.error('Usage: node scripts/get-telegram-chat-id.js [BOT_TOKEN]');
  console.error('Or set TELEGRAM_BOT_TOKEN in .env');
  process.exit(1);
}

console.log('╔════════════════════════════════════════════════╗');
console.log('║      Telegram Chat ID Discovery Helper         ║');
console.log('╚════════════════════════════════════════════════╝\n');

console.log('Listening for messages...\n');
console.log('Instructions:');
console.log('1. Find your bot in Telegram');
console.log('2. Send ANY message to it');
console.log('3. Your chat ID will appear below\n');

const bot = new TelegramBot(botToken, { polling: true });

let foundChatId = false;

bot.on('message', (msg) => {
  const chatId = msg.chat.id;

  if (!foundChatId) {
    console.log('═'.repeat(50));
    console.log('\n✅ Chat ID Found!\n');
    console.log(`Chat ID: ${chatId}`);
    console.log(`Name: ${msg.chat.first_name || msg.chat.title || 'Unknown'}`);
    console.log(`Type: ${msg.chat.type}`);
    console.log(`\nAdd to your .env file:`);
    console.log(`TELEGRAM_CHAT_ID=${chatId}`);
    console.log('\n═'.repeat(50));
    console.log('\nStopping listener...');

    foundChatId = true;
    bot.stopPolling();

    // Send confirmation message back to user
    bot.sendMessage(chatId, '✅ Chat ID captured! You can now use this bot with Daily Paper.');

    setTimeout(() => {
      process.exit(0);
    }, 1000);
  }
});

bot.on('polling_error', (error) => {
  console.error('❌ Telegram polling error:', error);
  console.error('\nMake sure:');
  console.error('1. Bot token is correct');
  console.error('2. You have internet connection');
  console.error('3. Telegram API is accessible');
  process.exit(1);
});
