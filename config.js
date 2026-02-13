/**
 * Configuration File
 * These settings can be modified to customize the payment tracker
 */

export const config = {
  // Server settings
  server: {
    port: parseInt(process.env.PORT) || 3000,
    host: 'localhost'
  },

  // Payment detection settings
  payment: {
    // Chat message patterns to detect payments
    // Format: "<PlayerName> paid you <amount>"
    detectPatterns: [
      /^<([a-zA-Z0-9_]{2,16})> paid you (\d+)$/,
      /^([a-zA-Z0-9_]{2,16}) paid you (\d+)$/
    ],
    
    // Minimum payment amount to track
    minAmount: 1,
    
    // Maximum payment amount to track (0 = unlimited)
    maxAmount: 0
  },

  // Dashboard settings
  dashboard: {
    // Auto-refresh interval in milliseconds
    refreshInterval: 2000,
    
    // Show payment history page
    showHistory: true,
    
    // Show statistics
    showStats: true
  },

  // Feature flags
  features: {
    // Allow users to connect multiple accounts
    multiAccount: false,
    
    // Allow payment reporting via API
    apiReporting: true,
    
    // Store payment history
    storeHistory: true,
    
    // Log to file
    logToFile: false
  },

  // Authentication
  auth: {
    // Require password for dashboard
    requirePassword: false,
    
    // Token expiration time (minutes)
    tokenExpiry: 1440 // 24 hours
  },

  // Currency settings
  currency: {
    name: 'Dubloons',
    symbol: '💰',
    decimals: 0 // Set to 2 for decimal values like 10.50
  },

  // Server integration
  integration: {
    // Execute /pay command automatically
    autoExecutePayCommand: false,
    
    // Method to execute commands: 'console', 'plugin', 'webhook'
    commandMethod: 'console',
    
    // Webhook URL for command execution (if commandMethod is 'webhook')
    webhookUrl: null
  }
};

// Validation
export function validateConfig() {
  if (config.server.port < 1 || config.server.port > 65535) {
    throw new Error('Invalid port number');
  }
  
  if (config.payment.minAmount < 0) {
    throw new Error('Minimum amount cannot be negative');
  }
  
  return true;
}

export default config;
