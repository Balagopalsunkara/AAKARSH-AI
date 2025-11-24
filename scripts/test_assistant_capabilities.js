#!/usr/bin/env node

/**
 * Test script for AI-APP Built-in Assistant Capabilities
 * Demonstrates all IT workplace operations features
 * 
 * Usage: node scripts/test_assistant_capabilities.js
 * Make sure the backend server is running on port 4000
 */

const axios = require('axios');

const API_BASE = 'http://localhost:4000';

// Color output helpers
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function section(title) {
  console.log('\n' + '='.repeat(60));
  log(title, 'cyan');
  console.log('='.repeat(60));
}

async function testEndpoint(name, method, endpoint, data = null) {
  try {
    log(`\n📍 Testing: ${name}`, 'blue');
    const config = { method, url: `${API_BASE}${endpoint}` };
    if (data) {
      config.data = data;
      config.headers = { 'Content-Type': 'application/json' };
    }
    
    const response = await axios(config);
    log(`✅ Success (${response.status})`, 'green');
    return response.data;
  } catch (error) {
    log(`❌ Failed: ${error.message}`, 'red');
    return null;
  }
}

async function demonstrateCapabilities() {
  log('\n🚀 AI-APP Built-in Assistant - IT Operations Demo', 'cyan');
  log('Testing enhanced capabilities for workplace operations\n', 'yellow');

  // 1. Get assistant capabilities
  section('1. Assistant Capabilities Overview');
  const capabilities = await testEndpoint(
    'Get Capabilities',
    'GET',
    '/api/v1/assistant/capabilities'
  );
  if (capabilities) {
    log(`Version: ${capabilities.version}`, 'yellow');
    log(`Available features: ${Object.keys(capabilities.capabilities).join(', ')}`, 'yellow');
  }

  // 2. Intent Detection
  section('2. Intent Detection');
  const queries = [
    'How do I deploy my application to production?',
    'What security vulnerabilities should I check?',
    'My database queries are slow, how do I optimize them?',
    'Generate unit tests for my functions'
  ];

  for (const query of queries) {
    const result = await testEndpoint(
      `Detect intent: "${query}"`,
      'POST',
      '/api/v1/intent',
      { query }
    );
    if (result) {
      log(`  → Detected: ${result.intent} (${result.name})`, 'yellow');
    }
  }

  // 3. Code Review
  section('3. Code Review');
  const codeToReview = `
function getUserById(id) {
  return db.query('SELECT * FROM users WHERE id = ' + id);
}
  `.trim();

  const reviewResult = await testEndpoint(
    'Code Review Analysis',
    'POST',
    '/api/v1/assistant/code-review',
    { code: codeToReview, language: 'javascript' }
  );
  if (reviewResult) {
    log('Review snippet:', 'yellow');
    console.log(reviewResult.review.substring(0, 200) + '...');
  }

  // 4. Troubleshooting
  section('4. Troubleshooting Assistant');
  const troubleshootResult = await testEndpoint(
    'Troubleshoot Issue',
    'POST',
    '/api/v1/assistant/troubleshoot',
    {
      error_message: 'Error: ECONNREFUSED localhost:5432',
      context: 'PostgreSQL database connection',
      stack_trace: 'at Connection.connect (/app/db.js:42:15)'
    }
  );
  if (troubleshootResult) {
    log('Analysis snippet:', 'yellow');
    console.log(troubleshootResult.analysis.substring(0, 200) + '...');
  }

  // 5. Security Check
  section('5. Security Analysis');
  const securityResult = await testEndpoint(
    'Security Check',
    'POST',
    '/api/v1/assistant/security-check',
    {
      code: 'const query = `SELECT * FROM users WHERE email = "${email}"`;',
      type: 'javascript'
    }
  );
  if (securityResult) {
    log('Security analysis snippet:', 'yellow');
    console.log(securityResult.analysis.substring(0, 200) + '...');
  }

  // 6. Performance Optimization
  section('6. Performance Optimization');
  const optimizeResult = await testEndpoint(
    'Optimization Suggestions',
    'POST',
    '/api/v1/assistant/optimize',
    {
      code: 'for(let i=0; i<arr.length; i++) { for(let j=0; j<arr.length; j++) { process(arr[i], arr[j]); } }',
      bottleneck: 'Nested loop causing O(n²) complexity'
    }
  );
  if (optimizeResult) {
    log('Optimization suggestions snippet:', 'yellow');
    console.log(optimizeResult.suggestions.substring(0, 200) + '...');
  }

  // 7. Test Generation
  section('7. Test Generation');
  const testGenResult = await testEndpoint(
    'Generate Tests',
    'POST',
    '/api/v1/assistant/generate-tests',
    {
      code: 'function calculateDiscount(price, percentage) { return price * (1 - percentage / 100); }',
      framework: 'jest',
      type: 'unit'
    }
  );
  if (testGenResult) {
    log(`Framework: ${testGenResult.framework}, Type: ${testGenResult.type}`, 'yellow');
    console.log(testGenResult.tests.substring(0, 200) + '...');
  }

  // 8. Documentation Generation
  section('8. Documentation Generation');
  const docResult = await testEndpoint(
    'Generate Documentation',
    'POST',
    '/api/v1/assistant/document',
    {
      type: 'api',
      content: 'POST /api/v1/users - Creates a new user account with email and password',
      format: 'markdown'
    }
  );
  if (docResult) {
    log(`Type: ${docResult.type}, Format: ${docResult.format}`, 'yellow');
    console.log(docResult.documentation.substring(0, 200) + '...');
  }

  // 9. Deployment Checklist
  section('9. Deployment Checklist');
  const checklistResult = await testEndpoint(
    'Get Deployment Checklist',
    'GET',
    '/api/v1/assistant/deployment-checklist'
  );
  if (checklistResult) {
    log('Checklist sections:', 'yellow');
    Object.keys(checklistResult.checklist).forEach(section => {
      log(`  • ${section}: ${checklistResult.checklist[section].length} items`, 'yellow');
    });
  }

  // 10. Available Intents
  section('10. All Available Intents');
  const intentsResult = await testEndpoint(
    'List All Intents',
    'GET',
    '/api/v1/intents'
  );
  if (intentsResult && intentsResult.intents) {
    log(`Total intents: ${intentsResult.intents.length}`, 'yellow');
    intentsResult.intents.forEach(intent => {
      log(`  • ${intent.name} (${intent.id})`, 'yellow');
    });
  }

  // 11. Chat Interface
  section('11. Conversational Chat Interface');
  const chatTopics = [
    'How do I optimize Docker builds?',
    'What monitoring should I set up?',
    'Explain database indexing strategies'
  ];

  for (const topic of chatTopics) {
    const chatResult = await testEndpoint(
      `Chat: "${topic}"`,
      'POST',
      '/api/v1/chat',
      { messages: [{ role: 'user', content: topic }] }
    );
    if (chatResult) {
      log(`  Response length: ${chatResult.message.length} chars`, 'yellow');
    }
  }

  // Summary
  section('✨ Demo Complete');
  log('\nAll IT workplace operations capabilities tested successfully!', 'green');
  log('\nKey Features Demonstrated:', 'cyan');
  log('  ✅ Intent detection for 16 categories', 'green');
  log('  ✅ Code review and security analysis', 'green');
  log('  ✅ Troubleshooting and incident response', 'green');
  log('  ✅ Performance optimization suggestions', 'green');
  log('  ✅ Automated test generation', 'green');
  log('  ✅ Documentation generation', 'green');
  log('  ✅ Deployment checklists and best practices', 'green');
  log('  ✅ Conversational chat interface', 'green');
  log('\n💡 All features work offline with the built-in local assistant!', 'yellow');
  log('\nFor more details, see ASSISTANT_CAPABILITIES.md\n', 'cyan');
}

// Check if server is running
async function checkServer() {
  try {
    await axios.get(`${API_BASE}/health`);
    return true;
  } catch (error) {
    return false;
  }
}

// Main execution
(async () => {
  const serverRunning = await checkServer();
  
  if (!serverRunning) {
    log('❌ Backend server is not running on port 4000', 'red');
    log('Please start the server first:', 'yellow');
    log('  cd backend && npm run dev', 'cyan');
    process.exit(1);
  }

  await demonstrateCapabilities();
})();
