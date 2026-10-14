'use strict';

const path = require('path');
const express = require('express');
const ecwid = require('./ecwid');
const ShopStore = require('./store');
const { extractBotId, isValidBotId, buildPublicConfig } = require('./widgetScript');
const { renderAdminPage } = require('./adminPage');
const session = require('./session');

/**
 * App factory - config injected so tests can point OAuth/storage at a mock
 * Ecwid. Returns { app, store }.
 *
 * Ecwid flow: install from the App Market -> Ecwid redirects to
 * {appUrl}/auth/callback?code= -> token exchange returns access_token +
 * store_id -> merchant configures in /app -> every save writes the app's
 * PUBLIC storage, which public/loader.js reads on the storefront via
 * Ecwid.getAppPublicConfig().
 */
function createApp(cfg) {
  const app = express();
  const store = new ShopStore(cfg.dataFile);

  app.use(express.urlencoded({ extended: false }));

  app.get('/healthz', (req, res) => res.json({ ok: true }));

  app.get('/logo.png', (req, res) => res.sendFile(path.join(__dirname, '..', 'logo.png')));

  // The storefront loader registered in the Ecwid Developer Portal.
  app.get('/storefront/loader.js', (req, res) => {
    res.type('application/javascript');
    res.set('Cache-Control', 'public, max-age=3600');
    res.sendFile(path.join(__dirname, '..', 'public', 'loader.js'));
  });

  // ---- OAuth callback (Ecwid -> us after marketplace install) ---------------

  app.get('/auth/callback', async (req, res) => {
    try {
      const { code } = req.query;
      if (!code) {
        return res.status(400).send('Missing code');
      }
      const token = await ecwid.exchangeCodeForToken({
        code,
        redirectUri: `${cfg.appUrl}/auth/callback`,
        cfg,
      });
      const storeId = String(token.store_id);
      const existing = store.get(storeId);
      store.upsert(storeId, {
        accessToken: token.access_token,
        enabled: existing ? existing.enabled : false,
      });
      const pageToken = session.issueToken(storeId, cfg.clientSecret, 10 * 60 * 1000);
      res.redirect(`/app?storeId=${encodeURIComponent(storeId)}&session=${encodeURIComponent(pageToken)}`);
    } catch (e) {
      res.status(502).send('Installation failed: ' + e.message);
    }
  });

  // ---- Settings page ----------------------------------------------------------

  // Only the store's own admin: Ecwid opens the app with an encrypted
  // payload naming the store, or the install hands over a short-lived token.
  // The form then carries a token signed with the client secret.
  app.get('/app', (req, res) => {
    const fromEcwid = ecwid.decodeAppPayload(req.query.payload, cfg.clientSecret);
    const storeId = fromEcwid ? String(fromEcwid.store_id) : String(req.query.storeId || '');
    if (!ecwid.isValidStoreId(storeId)) {
      return res.status(400).send('Missing or invalid storeId');
    }
    const allowed = fromEcwid || session.verifyToken(String(req.query.session || ''), storeId, cfg.clientSecret);
    if (!store.get(storeId) || !allowed) {
      return res.status(401).send('Open Conferbot from your Ecwid admin (Apps > My Apps).');
    }
    res.send(renderAdminPage({
      storeId,
      record: store.get(storeId),
      demoBotId: cfg.demoBotId,
      saved: req.query.saved === '1',
      formToken: session.issueToken(storeId, cfg.clientSecret),
    }));
  });

  app.post('/app/save', async (req, res) => {
    const storeId = String(req.body.storeId || '');
    if (!ecwid.isValidStoreId(storeId)) {
      return res.status(400).send('Missing or invalid storeId');
    }
    const formToken = String(req.body.token || '');
    if (!store.get(storeId) || !session.verifyToken(formToken, storeId, cfg.clientSecret)) {
      return res.status(401).send('This settings page has expired. Open Conferbot from your Ecwid admin again.');
    }
    const botId = extractBotId(req.body.botId);
    const enabled = req.body.enabled === '1' && isValidBotId(botId);
    const record = store.upsert(storeId, {
      botId,
      enabled,
      embedType: req.body.embedType === 'popup_chat' ? 'popup_chat' : 'live_chat',
    });

    if (record.accessToken) {
      try {
        await ecwid.savePublicConfig({
          storeId,
          accessToken: record.accessToken,
          config: buildPublicConfig(record, cfg),
          cfg,
        });
      } catch (e) {
        return res.status(502).send('Saved locally but Ecwid rejected the config update: ' + e.message);
      }
    }
    res.redirect(`/app?storeId=${encodeURIComponent(storeId)}&session=${encodeURIComponent(formToken)}&saved=1`);
  });

  // Dev/preview helper mirroring what Ecwid public storage would hold.
  app.get('/preview/public-config.json', (req, res) => {
    const storeId = String(req.query.storeId || '');
    if (!ecwid.isValidStoreId(storeId)) {
      return res.status(400).json({ error: 'invalid storeId' });
    }
    const record = store.get(storeId);
    res.json(record ? buildPublicConfig(record, cfg) : {});
  });

  return { app, store };
}

module.exports = createApp;
