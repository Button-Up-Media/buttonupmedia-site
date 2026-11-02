// Shared Google OAuth helper for the reporting scripts.
//
// Uses the gcloud Application Default Credentials already on this Mac
// (~/.config/gcloud/application_default_credentials.json) and exchanges the
// stored refresh token for a short-lived access token. No service account, no
// key file in the repo, nothing to rotate by hand.
//
// The ADC must be authorized with the Analytics + Search Console read scopes.
// scripts/report.mjs prints the exact command to run if they are missing.
import { readFile } from 'fs/promises';
import { homedir } from 'os';
import path from 'path';

export const ADC_PATH = path.join(homedir(), '.config', 'gcloud', 'application_default_credentials.json');

// Google blocks the Analytics scopes on gcloud's shared client ID, so a single
// `application-default login` cannot hold everything this tooling needs. The
// grant that still carries Analytics is kept in its own file; a later
// re-authorization overwrites the main file without taking it down with it.
// Credentials are selected per API, so a scope only has to live in one of them.
export const CRED_PATHS = [
  ADC_PATH,
  path.join(homedir(), '.config', 'gcloud', 'bum-analytics-adc.json'),
];

// Which scope each Google host needs, so callers do not have to say.
const HOST_SCOPE = [
  ['analyticsdata.googleapis.com', 'https://www.googleapis.com/auth/analytics.readonly'],
  ['analyticsadmin.googleapis.com', 'https://www.googleapis.com/auth/analytics.readonly'],
  ['searchconsole.googleapis.com', 'https://www.googleapis.com/auth/webmasters.readonly'],
  ['webmasters.googleapis.com', 'https://www.googleapis.com/auth/webmasters.readonly'],
  ['tagmanager.googleapis.com', 'https://www.googleapis.com/auth/tagmanager.edit.containers'],
];

function scopeForUrl(url) {
  for (const [host, scope] of HOST_SCOPE) if (String(url).indexOf(host) !== -1) return scope;
  return null;
}

// Every scope this tooling can use, named so callers can ask for just the one
// they need. Each is checked at the point of use, never upfront, so a partial
// grant still runs whatever it does have access to.
export const SCOPE_ANALYTICS = 'https://www.googleapis.com/auth/analytics.readonly';
export const SCOPE_ANALYTICS_EDIT = 'https://www.googleapis.com/auth/analytics.edit';
export const SCOPE_SEARCH_CONSOLE = 'https://www.googleapis.com/auth/webmasters.readonly';
export const SCOPE_GTM_EDIT = 'https://www.googleapis.com/auth/tagmanager.edit.containers';
export const SCOPE_GTM_PUBLISH = 'https://www.googleapis.com/auth/tagmanager.publish';

export const SCOPES = [
  SCOPE_ANALYTICS,
  SCOPE_ANALYTICS_EDIT,
  SCOPE_SEARCH_CONSOLE,
  SCOPE_GTM_EDIT,
  SCOPE_GTM_PUBLISH,
];

// The one command the owner runs to grant everything this tooling needs. Listing
// all of them every time matters: gcloud replaces the stored grant rather than
// adding to it, so re-authorizing with a short list silently revokes the rest.
export const AUTH_COMMAND =
  `gcloud auth application-default login --scopes="openid,email,profile,https://www.googleapis.com/auth/cloud-platform,${SCOPES.join(',')}"`;

export class AuthError extends Error {}

async function readAdc(credPath) {
  let raw;
  try {
    raw = await readFile(credPath, 'utf8');
  } catch {
    throw new AuthError(
      `No Google credentials found at ${credPath}.\n\nRun this once, then re-run this script:\n\n  ${AUTH_COMMAND}\n`
    );
  }
  const adc = JSON.parse(raw);
  if (adc.type === 'service_account') {
    throw new AuthError(
      'ADC holds a service account key. This tooling expects user credentials so it can read the properties you own.\n' +
        `Re-authorize with:\n\n  ${AUTH_COMMAND}\n`
    );
  }
  if (!adc.refresh_token || !adc.client_id || !adc.client_secret) {
    throw new AuthError(`Credentials at ${credPath} are incomplete.\n\nRe-authorize with:\n\n  ${AUTH_COMMAND}\n`);
  }
  return adc;
}

// One live session per credential file that loaded. Cached for the process
// lifetime so a report making a dozen calls authenticates once per file.
let sessions = null;

async function exchange(credPath) {
  const adc = await readAdc(credPath);
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: adc.client_id,
      client_secret: adc.client_secret,
      refresh_token: adc.refresh_token,
      grant_type: 'refresh_token',
    }),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = body.error_description || body.error || `HTTP ${res.status}`;
    throw new AuthError(`Could not refresh the token in ${credPath} (${detail}).`);
  }

  return {
    path: credPath,
    token: body.access_token,
    expires: Date.now() + (body.expires_in || 3600) * 1000,
    // Record what was actually granted. A partial grant is not fatal: a report
    // can still render the half it has scope for.
    granted: String(body.scope || '').split(/\s+/).filter(Boolean),
  };
}

async function loadSessions() {
  if (sessions && sessions.every((s) => s.expires > Date.now() + 60_000)) return sessions;

  const loaded = [];
  const failures = [];
  for (const credPath of CRED_PATHS) {
    try {
      loaded.push(await exchange(credPath));
    } catch (err) {
      // A missing second file is the normal case, not an error worth raising.
      failures.push(`  ${credPath}: ${String(err.message).split('\n')[0]}`);
    }
  }

  if (!loaded.length) {
    throw new AuthError(
      `No usable Google credentials.\n${failures.join('\n')}\n\nRe-authorize with:\n\n  ${AUTH_COMMAND}\n`
    );
  }

  sessions = loaded;
  return sessions;
}

// Returns a token that carries `scope`. Without one, returns the first token,
// which is what callers that only need an identity want.
export async function accessToken(scope) {
  const live = await loadSessions();
  if (!scope) return live[0].token;
  const hit = live.find((s) => s.granted.includes(scope));
  if (!hit) {
    throw new AuthError(
      `None of these credentials carry the scope:\n  ${scope}\n\n` +
        `Checked: ${live.map((s) => s.path).join(', ')}\n\nRe-authorize with:\n\n  ${AUTH_COMMAND}\n`
    );
  }
  return hit.token;
}

// True once any loaded credential includes the scope.
export async function hasScope(scope) {
  const live = await loadSessions();
  return live.some((s) => s.granted.includes(scope));
}

// Throws a targeted, actionable error for the one feature that needs this scope.
export async function requireScope(scope, feature) {
  if (await hasScope(scope)) return;
  throw new AuthError(
    `${feature} needs a Google scope these credentials do not have:\n  - ${scope}\n\n` +
      `Re-authorize with:\n\n  ${AUTH_COMMAND}\n`
  );
}

// Thin JSON wrapper that turns Google's error envelopes into readable messages.
export async function googleFetch(url, { method = 'GET', body, label = url, scope } = {}) {
  const token = await accessToken(scope || scopeForUrl(url) || undefined);
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`${label}: unparseable response (HTTP ${res.status}): ${text.slice(0, 300)}`);
  }

  if (!res.ok) {
    const err = json.error || {};
    const msg = err.message || `HTTP ${res.status}`;
    if (res.status === 403 && /has not been used|disabled|SERVICE_DISABLED/i.test(msg)) {
      throw new AuthError(
        `${label}: the required Google API is not enabled for this project.\n\n${msg}\n\n` +
          `Enable both APIs, then re-run:\n` +
          `  gcloud services enable analyticsdata.googleapis.com analyticsadmin.googleapis.com searchconsole.googleapis.com\n`
      );
    }
    throw new Error(`${label}: ${msg}`);
  }
  return json;
}
