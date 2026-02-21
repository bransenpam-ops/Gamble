import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';
import axios from 'axios';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Data storage (in-memory, persists to file)
const DATA_FILE = path.join(__dirname, 'payments.json');
const COMMANDS_FILE = path.join(__dirname, 'commands.json');
const USERS_FILE = path.join(__dirname, 'users.json');

let payments = [];
let connectedAccount = null;
let users = [];

// Load payments from file on startup
function loadPayments() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = fs.readFileSync(DATA_FILE, 'utf-8');
      payments = JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading payments:', error);
    payments = [];
  }
}

// Save payments to file
function savePayments() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(payments, null, 2));
  } catch (error) {
    console.error('Error saving payments:', error);
  }
}

// Load users from file on startup
function loadUsers() {
  try {
    if (fs.existsSync(USERS_FILE)) {
      const data = fs.readFileSync(USERS_FILE, 'utf-8');
      users = JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading users:', error);
    users = [];
  }
}

// Save users to file
function saveUsers() {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
  } catch (error) {
    console.error('Error saving users:', error);
  }
}

// Load/save command queue
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

// Load on startup
loadPayments();
loadUsers();

// Ensure backups directory exists
const BACKUP_DIR = path.join(__dirname, 'backups');
try { if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR); } catch (e) { console.error('Failed to create backup dir', e); }

// Periodic backup of users.json (every 5 minutes)
setInterval(() => {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const dest = path.join(BACKUP_DIR, `users-backup-${timestamp}.json`);
    fs.copyFileSync(USERS_FILE, dest);
    // Optionally keep only last 20 backups
    const files = fs.readdirSync(BACKUP_DIR).filter(f => f.startsWith('users-backup-')).sort();
    while (files.length > 20) {
      const rm = files.shift();
      try { fs.unlinkSync(path.join(BACKUP_DIR, rm)); } catch (e) {}
    }
  } catch (e) { console.error('User backup failed', e); }
}, 5 * 60 * 1000);

// Discord configuration
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID || '';
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET || '';
const DISCORD_REDIRECT_URI = process.env.DISCORD_REDIRECT_URI || 'http://localhost:3000/api/discord/callback';

// Store pending linking codes and their Discord IDs
let pendingLinks = {}; // { "code": { discordId, discordTag, timestamp } }
const LINK_CODE_STORAGE = path.join(__dirname, 'pending-links.json');

// Load pending links
function loadPendingLinks() {
  try {
    if (fs.existsSync(LINK_CODE_STORAGE)) {
      const data = fs.readFileSync(LINK_CODE_STORAGE, 'utf-8');
      pendingLinks = JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading pending links:', error);
    pendingLinks = {};
  }
}

// Save pending links
function savePendingLinks() {
  try {
    fs.writeFileSync(LINK_CODE_STORAGE, JSON.stringify(pendingLinks, null, 2));
  } catch (error) {
    console.error('Error saving pending links:', error);
  }
}

loadPendingLinks();

// Get all pending payments
app.get('/api/payments', (req, res) => {
  try {
    // Reload from disk so we return the latest payments saved by the bot
    loadPayments();
    console.log(`[${new Date().toLocaleTimeString()}] /api/payments called - returning ${payments.length} payments`);
    res.json(payments);
  } catch (error) {
    console.error('Error in /api/payments:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get connected account
app.get('/api/account', (req, res) => {
  res.json({ account: connectedAccount });
});

// Connect Minecraft account
app.post('/api/connect-account', (req, res) => {
  const { username, authToken } = req.body;
  
  if (!username) {
    return res.status(400).json({ error: 'Username required' });
  }

  connectedAccount = username;
  res.json({ success: true, account: connectedAccount });
});

// Report a payment (would be called from a mod/plugin)
app.post('/api/report-payment', (req, res) => {
  const { from, amount, authToken } = req.body;
  const token = req.headers.authorization?.split(' ')[1];

  // Simple validation - in production use proper auth
  if (!token || token !== process.env.PAYMENT_REPORT_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!from || !amount) {
    return res.status(400).json({ error: 'Missing from or amount' });
  }

  const payment = {
    id: uuidv4(),
    from,
    amount: parseFloat(amount),
    timestamp: new Date().toISOString(),
    status: 'pending'
  };

  payments.push(payment);
  savePayments();

  // Automatically deposit to user's account
  let user = users.find(u => u.username.toLowerCase() === from.toLowerCase());
  if (!user) {
    user = {
      id: uuidv4(),
      username: from.trim(),
      balance: 0,
      totalWagered: 0,
      totalWon: 0,
      totalLost: 0,
      createdAt: new Date().toISOString(),
      gameHistory: []
    };
    users.push(user);
  }

  user.balance += payment.amount;
  saveUsers();

  res.json({ success: true, payment, userBalance: user.balance });
});


// Process payment (send double amount back)
app.post('/api/pay', (req, res) => {
  const { paymentId } = req.body;

  const payment = payments.find(p => p.id === paymentId);
  if (!payment) {
    return res.status(404).json({ error: 'Payment not found' });
  }

  const doubleAmount = payment.amount * 2;
  const player = payment.from;

  // In a real setup, this would integrate with the Minecraft server
  // For now, we'll log it and mark as paid
  console.log(`MINECRAFT COMMAND: /pay ${player} ${doubleAmount}`);

  payment.status = 'paid';
  payment.paidAmount = doubleAmount;
  payment.processedAt = new Date().toISOString();

  savePayments();

  // Queue the command for the bot to execute
  try {
    const cmds = loadCommands();
    const cmdObj = {
      id: uuidv4(),
      command: `/pay ${player} ${doubleAmount}`,
      status: 'pending',
      createdAt: new Date().toISOString()
    };
    cmds.push(cmdObj);
    saveCommands(cmds);
    console.log(`[${new Date().toLocaleTimeString()}] Queued command: ${cmdObj.command}`);
    res.json({ 
      success: true, 
      message: `Queued pay command for ${player} ${doubleAmount} coins`,
      commandId: cmdObj.id
    });
  } catch (err) {
    console.error('Error queueing command:', err);
    res.status(500).json({ error: 'Failed to queue command' });
  }
});

// Remove payment (lose/deny)
app.post('/api/lose', (req, res) => {
  const { paymentId } = req.body;

  const index = payments.findIndex(p => p.id === paymentId);
  if (index === -1) {
    return res.status(404).json({ error: 'Payment not found' });
  }

  const removed = payments.splice(index, 1)[0];
  savePayments();

  res.json({ success: true, message: 'Payment removed', removed });
});

// Clear all payments (admin)
app.post('/api/clear-all', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token || token !== process.env.AUTH_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const count = payments.length;
  payments = [];
  savePayments();

  res.json({ success: true, message: `Cleared ${count} payments` });
});

// Delete all data (reset)
app.post('/api/reset', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token || token !== process.env.AUTH_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  payments = [];
  connectedAccount = null;
  savePayments();

  res.json({ success: true, message: 'System reset' });
});

// ==================== GAMBLING SYSTEM ====================

// Get or create user account
app.post('/api/register', (req, res) => {
  // Traditional username registration/login is disabled.
  // Use Discord OAuth to authenticate and link accounts instead.
  res.status(403).json({ error: 'Traditional login disabled. Please use Discord login.' });
});

// ==================== DISCORD OAUTH ====================

// Step 1: Redirect to Discord OAuth
app.get('/api/discord/auth', (req, res) => {
  if (!DISCORD_CLIENT_ID) {
    return res.status(500).json({ error: 'Discord client ID not configured' });
  }
  
  const discordAuthUrl = `https://discord.com/api/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(DISCORD_REDIRECT_URI)}&response_type=code&scope=identify`;
  res.redirect(discordAuthUrl);
});

// Step 2: Discord OAuth callback
app.get('/api/discord/callback', async (req, res) => {
  const { code } = req.query;
  
  if (!code) {
    return res.redirect('/?error=no_code');
  }

  try {
    // Exchange code for access token
    const tokenParams = new URLSearchParams();
    tokenParams.append('client_id', DISCORD_CLIENT_ID);
    tokenParams.append('client_secret', DISCORD_CLIENT_SECRET);
    tokenParams.append('code', code);
    tokenParams.append('grant_type', 'authorization_code');
    tokenParams.append('redirect_uri', DISCORD_REDIRECT_URI);

    const tokenResponse = await axios.post('https://discord.com/api/oauth2/token', tokenParams, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    const { access_token } = tokenResponse.data;

    // Get Discord user info
    const userResponse = await axios.get('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${access_token}` }
    });

    const discordUser = userResponse.data;
    const discordId = discordUser.id;
    const discordTag = `${discordUser.username}#${discordUser.discriminator}`;

    // Check if Discord ID is already linked
    const linkedUser = users.find(u => u.discordId === discordId);
    
    if (linkedUser) {
      // User already linked - login successful
      return res.redirect(`/?discord_login=true&user=${encodeURIComponent(linkedUser.username)}`);
    }

    // Generate linking code for user to send in-game
    const linkingCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    pendingLinks[linkingCode] = {
      discordId,
      discordTag,
      timestamp: Date.now()
    };
    savePendingLinks();

    // Redirect to linking page with all necessary parameters
    res.redirect(`/?discordId=${discordId}&discordTag=${encodeURIComponent(discordTag)}&linkingCode=${linkingCode}`);
  } catch (error) {
    console.error('Discord OAuth error:', error.response?.data || error.message);
    res.redirect('/?error=oauth_failed');
  }
});

// Step 3: Link Discord account to Minecraft username (after in-game message confirmation)
app.post('/api/link-account', (req, res) => {
  const { username, linkingCode } = req.body;

  if (!username || !linkingCode) {
    return res.status(400).json({ error: 'Username and linking code required' });
  }

  // Check if linking code is valid
  const linkData = pendingLinks[linkingCode];
  if (!linkData) {
    return res.status(400).json({ error: 'Invalid or expired linking code' });
  }

  // Check code hasn't expired (24 hour expiry)
  if (Date.now() - linkData.timestamp > 24 * 60 * 60 * 1000) {
    delete pendingLinks[linkingCode];
    savePendingLinks();
    return res.status(400).json({ error: 'Linking code expired' });
  }

  // Find user
  let user = users.find(u => u.username.toLowerCase() === username.toLowerCase());
  
  if (!user) {
    // Create new user if doesn't exist
    user = {
      id: uuidv4(),
      username: username.trim(),
      discordId: linkData.discordId,
      discordTag: linkData.discordTag,
      balance: 0,
      totalWagered: 0,
      totalWon: 0,
      totalLost: 0,
      createdAt: new Date().toISOString(),
      gameHistory: []
    };
    users.push(user);
  } else {
    // Link existing user
    user.discordId = linkData.discordId;
    user.discordTag = linkData.discordTag;
  }

  saveUsers();

  // Remove used linking code
  delete pendingLinks[linkingCode];
  savePendingLinks();

  res.json({ success: true, user });
});

// Step 4: Login with Discord (check if Discord ID is already linked)
app.post('/api/discord-login', (req, res) => {
  const { discordId } = req.body;

  if (!discordId) {
    return res.status(400).json({ error: 'Discord ID required' });
  }

  const user = users.find(u => u.discordId === discordId);

  if (!user) {
    return res.status(404).json({ error: 'Discord account not linked. Please link your account first.' });
  }

  res.json({ user });
});

// Get all pending linking codes (for debugging)
app.get('/api/pending-links', (req, res) => {
  res.json({ pending: pendingLinks });
});

// Unlink Discord account from Minecraft username
app.post('/api/unlink-discord', (req, res) => {
  const { username } = req.body;

  if (!username) {
    return res.status(400).json({ error: 'Username required' });
  }

  const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  if (!user.discordId) {
    return res.status(400).json({ error: 'No Discord account linked' });
  }

  // Unlink the Discord account
  user.discordId = null;
  user.discordTag = null;
  saveUsers();

  res.json({ success: true, message: 'Discord account unlinked' });
});

// ==================== USER ENDPOINTS ====================
app.get('/api/user/:username', (req, res) => {
  const { username } = req.params;
  const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  res.json({ user });
});

// Deposit (called when payment is detected)
app.post('/api/deposit', (req, res) => {
  const { username, amount } = req.body;

  if (!username || !amount) {
    return res.status(400).json({ error: 'Username and amount required' });
  }

  let user = users.find(u => u.username.toLowerCase() === username.toLowerCase());

  if (!user) {
    // Create user if doesn't exist
    user = {
      id: uuidv4(),
      username: username.trim(),
      balance: 0,
      totalWagered: 0,
      totalWon: 0,
      totalLost: 0,
      createdAt: new Date().toISOString(),
      gameHistory: []
    };
    users.push(user);
  }

  const deposit = parseFloat(amount);
  user.balance += deposit;

  saveUsers();

  res.json({ 
    success: true, 
    message: `Deposited ${deposit} coins`,
    user 
  });
});

// Get all users (leaderboard)
app.get('/api/users', (req, res) => {
  const sorted = [...users].sort((a, b) => b.balance - a.balance);
  res.json({ users: sorted });
});

// Admin: get all users (protected)
app.get('/api/admin/users', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token || token !== process.env.AUTH_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Return full user objects (including gameHistory)
  const sorted = [...users].sort((a, b) => b.balance - a.balance);
  res.json({ users: sorted });
});

// Admin: set exact balance for a user
app.post('/api/admin/set-balance', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token || token !== process.env.AUTH_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { username, balance } = req.body;
  if (typeof username !== 'string' || typeof balance !== 'number') {
    return res.status(400).json({ error: 'Invalid parameters' });
  }

  const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());
  if (!user) return res.status(404).json({ error: 'User not found' });

  const prev = user.balance;
  user.balance = balance;
  user.gameHistory.push({ type: 'admin_set_balance', prev, newBalance: balance, admin: 'api', timestamp: new Date().toISOString() });
  saveUsers();

  res.json({ success: true, user });
});

// Admin: adjust balance by delta (positive or negative)
app.post('/api/admin/adjust-balance', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token || token !== process.env.AUTH_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { username, delta } = req.body;
  if (typeof username !== 'string' || typeof delta !== 'number') {
    return res.status(400).json({ error: 'Invalid parameters' });
  }

  const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());
  if (!user) return res.status(404).json({ error: 'User not found' });

  const prev = user.balance;
  user.balance += delta;
  user.gameHistory.push({ type: 'admin_adjust_balance', delta, prev, newBalance: user.balance, admin: 'api', timestamp: new Date().toISOString() });
  saveUsers();

  res.json({ success: true, user });
});

// ==================== GAMES ====================

// Coin Flip endpoint removed

// Blackjack game
app.post('/api/games/blackjack', (req, res) => {
  const { username, wager, won, dealerValue, playerValue } = req.body;

  const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  const betAmount = parseFloat(wager);
  if (betAmount <= 0 || betAmount > user.balance) {
    return res.status(400).json({ error: 'Invalid bet amount' });
  }

  // Determine winnings
  let winnings = 0;
  if (won) {
    winnings = betAmount * 2;
    user.balance -= betAmount; // Deduct bet
    user.balance += winnings; // Add winnings
    user.totalWon += winnings;
  } else {
    user.balance -= betAmount;
    user.totalLost += betAmount;
  }
  user.totalWagered += betAmount;

  user.gameHistory.push({
    type: 'blackjack',
    wager: betAmount,
    won,
    playerValue,
    dealerValue,
    winnings,
    timestamp: new Date().toISOString()
  });

  saveUsers();

  res.json({ 
    success: true, 
    won,
    playerValue,
    dealerValue,
    winnings,
    message: won ? `Blackjack! You won ${winnings} coins!` : `Dealer wins. You lost ${betAmount} coins.`,
    user
  });
});

// Plinko game - physics-based peg scattering game
app.post('/api/games/plinko', (req, res) => {
  const { username, wager, winAmount, multiplier } = req.body;

  const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  const betAmount = parseFloat(wager);
  if (betAmount <= 0 || betAmount > user.balance) {
    return res.status(400).json({ error: 'Invalid bet amount' });
  }

  const payout = parseFloat(winAmount);
  const won = payout > betAmount;

  // Update balance
  user.balance -= betAmount;
  user.balance += payout;
  
  if (won) {
    user.totalWon += payout;
  } else {
    user.totalLost += betAmount;
  }
  user.totalWagered += betAmount;

  user.gameHistory.push({
    type: 'plinko',
    wager: betAmount,
    won,
    multiplier,
    payout,
    timestamp: new Date().toISOString()
  });

  saveUsers();

  res.json({ 
    success: true, 
    won,
    payout,
    multiplier,
    message: won ? `Plinko! You won ${payout} coins!` : `Plinko! You got ${multiplier}x.`,
    user
  });
});

// Slots endpoint removed

// Number game - pick a number 1-10, match to win 5x
app.post('/api/games/number', (req, res) => {
  const { username, wager, number } = req.body;

  const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  const betAmount = parseFloat(wager);
  const pickedNumber = parseInt(number);

  if (betAmount <= 0 || betAmount > user.balance) {
    return res.status(400).json({ error: 'Invalid bet amount' });
  }

  if (pickedNumber < 1 || pickedNumber > 10) {
    return res.status(400).json({ error: 'Number must be between 1 and 10' });
  }

  // Draw number
  const drawnNumber = Math.floor(Math.random() * 10) + 1;
  const won = drawnNumber === pickedNumber;
  const winnings = won ? betAmount * 10 : 0; // 10x payout

  // Update user
  user.balance -= betAmount;
  if (won) {
    user.balance += winnings;
    user.totalWon += winnings;
  } else {
    user.totalLost += betAmount;
  }
  user.totalWagered += betAmount;

  user.gameHistory.push({
    type: 'number',
    picked: pickedNumber,
    drawn: drawnNumber,
    wager: betAmount,
    won,
    winnings,
    timestamp: new Date().toISOString()
  });

  saveUsers();

  res.json({ 
    success: true,
    drawnNumber,
    won,
    winnings,
    message: won ? `You picked ${pickedNumber} and the number was ${drawnNumber}! You won ${winnings} coins!` : `You picked ${pickedNumber} but the number was ${drawnNumber}. You lost ${betAmount} coins.`,
    user
  });
});

// Keno endpoint removed

// Withdraw (send payout command)
app.post('/api/withdraw', (req, res) => {
  const { username, amount } = req.body;

  const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  const withdrawAmount = parseFloat(amount);
  if (withdrawAmount <= 0 || withdrawAmount > user.balance) {
    return res.status(400).json({ error: 'Invalid withdrawal amount' });
  }

  // Deduct from balance
  user.balance -= withdrawAmount;
  saveUsers();

  // Queue the command for the bot to execute
  try {
    const cmds = loadCommands();
    const cmdObj = {
      id: uuidv4(),
      command: `/pay ${username} ${withdrawAmount}`,
      status: 'pending',
      createdAt: new Date().toISOString()
    };
    cmds.push(cmdObj);
    saveCommands(cmds);
    console.log(`[${new Date().toLocaleTimeString()}] Queued withdrawal: /pay ${username} ${withdrawAmount}`);
    
    res.json({ 
      success: true,
      message: `Withdrawal of ${withdrawAmount} coins queued!`,
      user
    });
  } catch (err) {
    console.error('Error queueing withdrawal:', err);
    // Refund the balance since command failed
    user.balance += withdrawAmount;
    saveUsers();
    res.status(500).json({ error: 'Failed to queue withdrawal' });
  }
});

// ==================== NEW GAMES ====================

// Mines endpoints removed

// Crash endpoint removed

// Crash server logic removed

// ==================== START SERVER ====================

app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════╗
║   DONUT-SMP Payment Tracker running on port ${PORT}   ║
║   Open: http://localhost:${PORT}                       ║
╚═══════════════════════════════════════════════════════╝
  `);
  console.log('Connected Account:', connectedAccount || 'None');
  console.log('Pending Payments:', payments.length);
});
