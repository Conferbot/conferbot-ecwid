'use strict';

/**
 * Ecwid OAuth + Application Storage helpers. Store identity is the numeric
 * Ecwid store ID returned by the token exchange.
 */

const STORE_ID_RE = /^[0-9]+$/;

function isValidStoreId(id) {
  return STORE_ID_RE.test(String(id || ''));
}

async function exchangeCodeForToken({ code, redirectUri, cfg }) {
  const body = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    code,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  });
  const res = await fetch(`${cfg.oauthBase}/api/oauth/token`, {
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
  return data;
}

/**
 * Writes the app's PUBLIC storage key. Ecwid exposes it to the storefront
 * via Ecwid.getAppPublicConfig(appId), which our loader.js reads.
 */
async function savePublicConfig({ storeId, accessToken, config, cfg }) {
  const res = await fetch(`${cfg.apiBase}/api/v3/${storeId}/storage/public`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(config),
  });
  if (!res.ok) {
    throw new Error(`public config save failed: HTTP ${res.status}`);
  }
  return true;
}

module.exports = { isValidStoreId, exchangeCodeForToken, savePublicConfig };
