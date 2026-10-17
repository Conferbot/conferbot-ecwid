'use strict';

const crypto = require('crypto');

/**
 * Ecwid OAuth + Application Storage helpers. Store identity is the numeric
 * Ecwid store ID returned by the token exchange.
 */

const STORE_ID_RE = /^[0-9]+$/;

function isValidStoreId(id) {
  return STORE_ID_RE.test(String(id || ''));
}

/**
 * Exchanges the install code for the store's access token. Since Ecwid's
 * September 2025 change the redirect carries ?code=&store_id= and the code
 * is exchanged at POST /api/oauth/token/{store_id}.
 */
async function exchangeCodeForToken({ code, storeId, redirectUri, cfg }) {
  if (!isValidStoreId(storeId)) {
    throw new Error('missing or invalid store_id');
  }
  const body = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    code,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  });
  const res = await fetch(`${cfg.oauthBase}/api/oauth/token/${encodeURIComponent(storeId)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    throw new Error(`token exchange failed: HTTP ${res.status}`);
  }
  const data = await res.json();
  if (!data.access_token || !data.store_id) {
    throw new Error('token exchange returned no access_token/store_id');
  }
  if (String(data.store_id) !== String(storeId)) {
    throw new Error('token exchange returned another store');
  }
  return data;
}

/**
 * Writes the app's PUBLIC storage key. Ecwid exposes it to the storefront
 * via Ecwid.getAppPublicConfig(clientId), which our loader.js reads.
 * Ecwid's storage takes { "value": "<string>" }, so the config travels as JSON text.
 */
async function savePublicConfig({ storeId, accessToken, config, cfg }) {
  const res = await fetch(`${cfg.apiBase}/api/v3/${storeId}/storage/public`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ value: JSON.stringify(config) }),
  });
  if (!res.ok) {
    throw new Error(`public config save failed: HTTP ${res.status}`);
  }
  return true;
}

/**
 * The payload Ecwid adds when it opens the app in the store's admin:
 * base64url(IV[16] + AES-128-CBC(JSON)), keyed with the first 16 characters
 * of the client secret. Returns the decoded JSON ({ store_id, ... }) or null
 * when it was not made with our secret.
 */
function decodeAppPayload(payload, clientSecret) {
  try {
    if (!payload || !clientSecret || clientSecret.length < 16) return null;
    const data = Buffer.from(String(payload).replace(/-/g, '+').replace(/_/g, '/'), 'base64');
    if (data.length < 32) return null;
    const decipher = crypto.createDecipheriv('aes-128-cbc', Buffer.from(clientSecret.slice(0, 16), 'utf8'), data.subarray(0, 16));
    const json = Buffer.concat([decipher.update(data.subarray(16)), decipher.final()]).toString('utf8');
    const out = JSON.parse(json);
    return out && isValidStoreId(out.store_id) ? out : null;
  } catch (_) {
    return null;
  }
}

/**
 * Ecwid webhook signature: X-Ecwid-Webhook-Signature is
 * base64(HMAC-SHA256("{eventCreated}.{eventId}", client secret)).
 */
function verifyWebhookSignature({ eventCreated, eventId, signature }, clientSecret) {
  if (!clientSecret || !signature || eventCreated === undefined || eventId === undefined) return false;
  const want = Buffer.from(
    crypto.createHmac('sha256', clientSecret).update(`${eventCreated}.${eventId}`).digest('base64'),
    'utf8'
  );
  const got = Buffer.from(String(signature), 'utf8');
  return want.length === got.length && crypto.timingSafeEqual(want, got);
}

/**
 * The required scopes the token response did not grant. Ecwid returns the
 * granted scopes as one space-separated string.
 */
function missingScopes(granted, required) {
  const have = new Set(String(granted || '').split(/[\s,]+/).filter(Boolean));
  return (required || []).filter((s) => !have.has(s));
}

module.exports = { isValidStoreId, missingScopes, exchangeCodeForToken, savePublicConfig, decodeAppPayload, verifyWebhookSignature };
