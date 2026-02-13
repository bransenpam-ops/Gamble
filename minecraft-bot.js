/**
 * Minecraft Payment Tracker Bot
 * 
 * Connects to a Minecraft server and reads chat to detect payments.
 * 
 * Usage: node minecraft-bot.js
 */

import mineflayer from 'mineflayer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const CONFIG = {
  server: {
    host: 'donutsmp.net',
    port: 25565,
    username: 'reljohn0911@outlook.com'  // Change to your email
  },
  paymentOwner: 'Tomato4444'  // Change to your in-game username
};

// API Server config
const API_BASE_URL = 'http://localhost:3000/api';
const PAYMENT_REPORT_TOKEN = process.env.PAYMENT_REPORT_TOKEN || 'test-token';

// Payment detection pattern: supports both Java and Bedrock formats
// Bedrock: .PlayerName paid you $1M.  (leading dot included)
// Java: PlayerName paid you $1000
// Capture optional leading dot as part of the username and amounts with
// optional commas, decimals and suffixes (K, M, B)
const PAYMENT_PATTERN = /(\.?[a-zA-Z0-9_]+) paid you \$([0-9,]+(?:\.\d+)?[KMBkmb]?)/;

// Convert amount strings like "1,000", "2.5K", "1M" into numeric value
function parseAmount(amountStr) {
  if (!amountStr) return 0;
  const s = amountStr.replace(/,/g, '').trim();
  const suffix = s.slice(-1).toUpperCase();
  let numPart = s;
  let multiplier = 1;

  if (suffix === 'K' || suffix === 'M' || suffix === 'B') {
    numPart = s.slice(0, -1);
    if (suffix === 'K') multiplier = 1e3;
    if (suffix === 'M') multiplier = 1e6;
    if (suffix === 'B') multiplier = 1e9;
  }

  const parsed = parseFloat(numPart);
  if (Number.isNaN(parsed)) return 0;
  return Math.round(parsed * multiplier);
}

// Storage file path
const DATA_FILE = path.join(__dirname, 'payments.json');
const COMMANDS_FILE = path.join(__dirname, 'commands.json');


// Load existing payments from file
function loadPayments() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = fs.readFileSync(DATA_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading payments:', error);
  }
  return [];
}

// Command queue load/save
function loadCommands() {
  try {
    if (fs.existsSync(COMMANDS_FILE)) {
      const data = fs.readFileSync(COMMANDS_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading commands:', error);
  }
  return [];
}

function saveCommands(cmds) {
  try {
    fs.writeFileSync(COMMANDS_FILE, JSON.stringify(cmds, null, 2));
  } catch (error) {
    console.error('Error saving commands:', error);
  }
}

// Save payments to file
function savePayment(payerName, amount) {
  try {
    console.log(`[DEBUG] Loading payments from file...`);
    let payments = loadPayments();
    console.log(`[DEBUG] Current payments: ${payments.length}`);
    
    const newPayment = {
      id: uuidv4(),
      from: payerName,
      amount: parseInt(amount),
      timestamp: new Date().toISOString(),
      status: 'pending'
    };
    
    payments.push(newPayment);
    console.log(`[DEBUG] Saving ${payments.length} payments to file...`);
    fs.writeFileSync(DATA_FILE, JSON.stringify(payments, null, 2));
    console.log('✅ Payment saved to website database');

    // Report payment to API server to credit player account
    reportPaymentToAPI(payerName, amount);
  } catch (error) {
    console.error('❌ Error saving payment:', error.message);
    console.error(error.stack);
  }
}

// Report payment to the web API to credit player account
async function reportPaymentToAPI(playerName, amount) {
  try {
    const response = await fetch(`${API_BASE_URL}/report-payment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${PAYMENT_REPORT_TOKEN}`
      },
      body: JSON.stringify({
        from: playerName,
        amount: parseInt(amount)
      })
    });

    const result = await response.json();
    
    if (response.ok) {
      console.log(`💳 API: Payment reported for ${playerName} - New balance: ${result.userBalance} coins`);
    } else {
      console.error(`❌ API Error: ${result.error || 'Failed to report payment'}`);
    }
  } catch (error) {
    console.error(`❌ API Connection Error: ${error.message}`);
  }
}

function createBot() {
  console.log('\n🤖 Starting Minecraft bot...');
  console.log(`📍 Server: ${CONFIG.server.host}:${CONFIG.server.port}`);
  console.log(`👤 Account: ${CONFIG.server.username}`);
  console.log(`💳 Monitoring for payments to: ${CONFIG.paymentOwner}`);
  
  const bot = mineflayer.createBot({
    host: CONFIG.server.host,
    port: CONFIG.server.port,
    username: CONFIG.server.username,
    auth: 'microsoft',
    version: '1.20.4'  // Specify version to match server
  });
  
  // ============================================
  // EVENT HANDLERS
  // ============================================
  
  bot.on('login', () => {
    console.log('\n✅ Successfully logged in!');
    console.log('🎮 Connected to server');
    console.log('👂 Listening for payments...\n');
    
    // Heartbeat every 10 seconds to confirm bot is alive
    setInterval(() => {
      console.log('[HEARTBEAT] Bot is still listening...');
    }, 10000);
    
    // Keep connection alive by sending a chat message every 30 minutes
    setInterval(() => {
      try {
        bot.chat(''); // Send empty chat to keep alive
      } catch (e) {
        // Ignore errors
      }
    }, 30 * 60 * 1000);

    // Poll for queued commands every 2 seconds
    setInterval(async () => {
      try {
        const cmds = loadCommands();
        let changed = false;
        for (const c of cmds) {
          if (c.status === 'pending') {
            console.log(`[COMMAND] Executing queued command: ${c.command}`);
            try {
              // send command as chat (prefix with /)
              await bot.chat(c.command);
              c.status = 'done';
              c.executedAt = new Date().toISOString();
              c.executedBy = bot.username;
              changed = true;
              console.log(`[COMMAND] Executed: ${c.command}`);
            } catch (err) {
              console.error('[COMMAND] Failed to execute command:', err.message);
            }
          }
        }
        if (changed) saveCommands(cmds);
      } catch (err) {
        console.error('[COMMAND] Poll error:', err.message);
      }
    }, 2000);
  });
  
  bot.on('error', (err) => {
    console.error('\n❌ Bot error:', err.message);
    console.error(err.stack);
    if (err.message.includes('Invalid credentials')) {
      console.error('   Try deleting cache.json if Microsoft auth fails');
    }
    // Don't exit - keep running and try to reconnect
    console.log('Bot is still running, waiting for next payment...');
  });
  
  bot.on('kicked', (reason) => {
    console.error('\n❌ Kicked from server:', reason);
    console.log('Attempting to reconnect in 10 seconds...');
    setTimeout(() => {
      console.log('Reconnecting...');
      process.exit(1); // Exit and let system restart
    }, 10000);
  });
  
  bot.on('end', () => {
    console.log('\n⛔ Disconnected from server');
    console.log('Attempting to reconnect in 10 seconds...');
    setTimeout(() => {
      console.log('Reconnecting...');
      process.exit(1); // Exit and let system restart
    }, 10000);
  });
  
  bot.on('message', (msg) => {
    try {
      const messageText = msg.toString();
      const timestamp = new Date().toLocaleTimeString();

      // Log ALL messages to console with timestamp
      console.log(`[${timestamp}] [CHAT] ${messageText}`);

      // Check for payment pattern
      const match = messageText.match(PAYMENT_PATTERN);
      if (match) {
        const playerName = match[1];
        const amount = match[2];

        // Any "paid you" message is a payment to YOU - parse and save it
        const numeric = parseAmount(amount);
        console.log(`[${timestamp}] \n💰 PAYMENT DETECTED: ${playerName} paid you $${amount} -> ${numeric}`);
        savePayment(playerName, numeric);
        return;
      }

      // Check for Discord linking codes (6-character uppercase)
      // Players send linking code in private message to bot
      // Message format: ".username -> YOU: LINKCODE" (Bedrock) or "username -> YOU: LINKCODE" (Java)
      const linkingCodeMatch = messageText.match(/([A-Z0-9]{6})\s*$/);
      if (linkingCodeMatch) {
        const linkingCode = linkingCodeMatch[1];
        
        // Extract username from message - includes optional dot prefix (Bedrock has dot, Java doesn't)
        const usernameMatch = messageText.match(/^(\.?[a-zA-Z0-9_]+)\s+->/);
        const playerName = usernameMatch ? usernameMatch[1] : 'Unknown';

        // Verify this linking code exists
        verifyLinkingCode(playerName, linkingCode);
      }
    } catch (error) {
      const timestamp = new Date().toLocaleTimeString();
      console.error(`[${timestamp}] ❌ Error processing message:`, error.message);
      console.error(error.stack);
    }
  });

  return bot;
}

// Verify linking code sent in-game and confirm with API
async function verifyLinkingCode(playerName, linkingCode) {
  try {
    const response = await fetch(`${API_BASE_URL}/link-account`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        username: playerName,
        linkingCode: linkingCode
      })
    });

    const result = await response.json();

    if (response.ok) {
      const timestamp = new Date().toLocaleTimeString();
      console.log(`[${timestamp}] ✅ DISCORD LINKED: ${playerName} linked Discord account ${result.user.discordTag}`);
    } else {
      const timestamp = new Date().toLocaleTimeString();
      console.log(`[${timestamp}] ❌ Linking failed: ${result.error}`);
    }
  } catch (error) {
    const timestamp = new Date().toLocaleTimeString();
    console.error(`[${timestamp}] ❌ Error verifying linking code:`, error.message);
  }
}

// ============================================
// MAIN
// ============================================

console.log('╔═════════════════════════════════════════╗');
console.log('║  Minecraft Chat Payment Monitor         ║');
console.log('╚═════════════════════════════════════════╝');

// Create and start bot
const bot = createBot();

// Monitor bot state with timestamps
console.log('[DEBUG] Bot object created, monitoring state...');
setInterval(() => {
  const timestamp = new Date().toLocaleTimeString();
  console.log(`[${timestamp}] [STATUS] Bot health: ${bot.health}, Players nearby: ${Object.keys(bot.players).length}`);
}, 5000);

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n⛔ Shutting down...');
  bot.quit();
  process.exit(0);
});

// Catch unhandled errors
process.on('uncaughtException', (error) => {
  console.error('\n❌ Uncaught error:', error);
  console.log('Bot is still running, waiting for next payment...');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('\n❌ Unhandled rejection:', reason);
  console.log('Bot is still running, waiting for next payment...');
});
