#!/usr/bin/env node
/**
 * Meta API Connection Test Script
 * Run: node api/meta/test-connection.js
 *
 * Tests that your Meta API configuration is correct by:
 * 1. Validating environment variables
 * 2. Getting an app access token
 * 3. Verifying the app token works
 */

// Load environment variables from .env.local
const path = require('path');
const fs = require('fs');

const envPath = path.resolve(__dirname, '../../.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=');
      process.env[key.trim()] = valueParts.join('=').trim();
    }
  });
}

const { META_CONFIG, REQUIRED_PERMISSIONS } = require('./lib/config');
const { MetaApiClient } = require('./lib/client');

async function testConnection() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║          Meta API Connection Test - "Chef Mark"             ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  // Step 1: Check configuration
  console.log('─── Step 1: Configuration Check ───────────────────────────────\n');

  const checks = [
    { key: 'META_APP_ID', value: META_CONFIG.appId, required: true },
    { key: 'META_APP_SECRET', value: META_CONFIG.appSecret, required: true },
    { key: 'META_API_VERSION', value: META_CONFIG.apiVersion, required: true },
    { key: 'META_SYSTEM_USER_ACCESS_TOKEN', value: META_CONFIG.systemUserAccessToken, required: false },
    { key: 'META_PAGE_ACCESS_TOKEN', value: META_CONFIG.pageAccessToken, required: false },
    { key: 'META_BUSINESS_ID', value: META_CONFIG.businessId, required: false },
    { key: 'META_AD_ACCOUNT_ID', value: META_CONFIG.adAccountId, required: false },
    { key: 'META_PAGE_ID', value: META_CONFIG.pageId, required: false },
    { key: 'META_INSTAGRAM_ACCOUNT_ID', value: META_CONFIG.instagramAccountId, required: false },
  ];

  let allRequiredSet = true;
  checks.forEach(({ key, value, required }) => {
    const status = value ? '✅' : (required ? '❌' : '⚠️ ');
    const label = value
      ? (key.includes('SECRET') || key.includes('TOKEN') ? `${value.substring(0, 8)}...` : value)
      : (required ? 'MISSING (required)' : 'Not set (optional - needed later)');
    console.log(`  ${status} ${key}: ${label}`);
    if (required && !value) allRequiredSet = false;
  });

  if (!allRequiredSet) {
    console.log('\n❌ Required configuration is missing. Please check your .env.local file.');
    process.exit(1);
  }

  console.log('\n✅ Required configuration is set.\n');

  // Step 2: Test App Access Token
  console.log('─── Step 2: App Access Token Test ─────────────────────────────\n');

  try {
    const client = new MetaApiClient();
    const appToken = await client.getAppAccessToken();
    console.log(`  ✅ App Access Token obtained: ${appToken.access_token.substring(0, 20)}...`);
    console.log(`     Token type: ${appToken.token_type || 'bearer'}`);
  } catch (error) {
    console.log(`  ❌ Failed to get app access token: ${error.message}`);
    console.log('     This likely means your APP_ID or APP_SECRET is incorrect.');
    process.exit(1);
  }

  // Step 3: Verify token with debug endpoint
  console.log('\n─── Step 3: Token Debug Verification ──────────────────────────\n');

  if (META_CONFIG.systemUserAccessToken) {
    try {
      const client = new MetaApiClient();
      const debug = await client.debugToken(META_CONFIG.systemUserAccessToken);
      console.log(`  ✅ System User Token is valid`);
      console.log(`     App ID: ${debug.data.app_id}`);
      console.log(`     Type: ${debug.data.type}`);
      console.log(`     Expires: ${debug.data.expires_at === 0 ? 'Never' : new Date(debug.data.expires_at * 1000).toISOString()}`);
      console.log(`     Scopes: ${debug.data.scopes?.join(', ') || 'N/A'}`);
    } catch (error) {
      console.log(`  ⚠️  System User Token validation failed: ${error.message}`);
      console.log('     Token may be expired or not yet generated.');
    }
  } else {
    console.log('  ⚠️  No System User Access Token configured.');
    console.log('     This will be available after you create a System User in Business Manager.');
  }

  // Step 4: Summary & Next Steps
  console.log('\n─── Summary & Next Steps ──────────────────────────────────────\n');
  console.log('  🎯 App Name: Chef Mark');
  console.log(`  🆔 App ID: ${META_CONFIG.appId}`);
  console.log(`  📡 API Version: ${META_CONFIG.apiVersion}`);
  console.log(`  🔗 Graph API URL: ${META_CONFIG.graphUrl}`);
  console.log('');
  console.log('  📋 Required Permissions for App Review:');
  Object.entries(REQUIRED_PERMISSIONS).forEach(([category, perms]) => {
    console.log(`\n     ${category.toUpperCase()}:`);
    perms.forEach(p => console.log(`       • ${p}`));
  });

  console.log('\n\n  🚀 NEXT STEPS:');
  console.log('  ────────────────────────────────────────────────────────────');
  console.log('  1. ✅ App configured (App ID & Secret set)');
  console.log('  2. ⬜ Publish Data Privacy page on your site');
  console.log('  3. ⬜ Set up System User Account in Business Manager');
  console.log('  4. ⬜ Install app to System User & generate access token');
  console.log('  5. ⬜ Connect Facebook Page and get Page Access Token');
  console.log('  6. ⬜ Connect Instagram Business Account');
  console.log('  7. ⬜ Connect Ads Manager (Ad Account ID)');
  console.log('  8. ⬜ Submit permissions for App Review');
  console.log('  9. ⬜ Configure webhook URL in Meta Developer Dashboard');
  console.log('');
  console.log('  📖 Setup guide: See META_SETUP_GUIDE.md in this repo');
  console.log('\n══════════════════════════════════════════════════════════════════\n');
}

testConnection().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
