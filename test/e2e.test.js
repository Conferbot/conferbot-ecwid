'use strict';

/**
 * End-to-end test: mock Ecwid (OAuth token endpoint + Application Storage
 * API) plus the real app. The browser stage (RUN_BROWSER_E2E=1) loads a
 * fake Ecwid storefront that stubs Ecwid.getAppPublicConfig with the saved
 * config and asserts the real CDN widget mounts via public/loader.js.
 */

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

const createApp = require('../src/server');
const { extractBotId, isValidBotId, buildPublicConfig } = require('../src/widgetScript');

const STORE_ID = '10001';
const CLIENT_ID = 'test-ecwid-client';
const CLIENT_SECRET = 'test-ecwid-secret';
const DEMO_ID = '691c970890527a0468f9b2c9';

let mockEcwid;
let appServer;
let appUrl;
const mockState = { tokenRequests: [], publicConfigs: {} };

before(async () => {
  mockEcwid = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const url = new URL(req.url, 'http://localhost');
      if (req.method === 'POST' && url.pathname === '/api/oauth/token') {
        mockState.tokenRequests.push(Object.fromEntries(new URLSearchParams(body)));
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({
          access_token: 'ecwid-mock-token', token_type: 'Bearer',
          scope: 'read_store_profile update_store_profile', store_id: Number(STORE_ID),
        }));
      }
      const m = url.pathname.match(/^\/api\/v3\/(\d+)\/storage\/public$/);
      if (m && req.method === 'PUT') {
        if (req.headers.authorization !== 'Bearer ecwid-mock-token') {
          res.statusCode = 401;
          return res.end('{}');
        }
        mockState.publicConfigs[m[1]] = body;
        res.setHeader('Content-Type', 'application/json');
        return res.end('{"updateCount":1}');
      }
      res.statusCode = 404;
      res.end('not found');
    });
  });
  await new Promise((r) => mockEcwid.listen(0, r));

  const dataFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cbecwid-')), 'stores.json');
  const cfg = {
    port: 0,
    appUrl: '',
    clientId: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    oauthBase: `http://localhost:${mockEcwid.address().port}`,
    apiBase: `http://localhost:${mockEcwid.address().port}`,
    widgetScriptUrl: 'https://cdn.conferbot.com/dist/v1/widget.min.js',
    demoBotId: DEMO_ID,
    dataFile,
  };
  const { app } = createApp(cfg);
  appServer = http.createServer(app);
  await new Promise((r) => appServer.listen(0, r));
  appUrl = `http://localhost:${appServer.address().port}`;
  cfg.appUrl = appUrl;
});

after(async () => {
  await new Promise((r) => appServer.close(r));
  await new Promise((r) => mockEcwid.close(r));
});

// ---- helpers -----------------------------------------------------------------

test('bot id helpers match the other conferbot integrations', () => {
  assert.strictEqual(extractBotId(`window.ConferbotWidget("${DEMO_ID}")`), DEMO_ID);
  assert.strictEqual(extractBotId('nope'), '');
  assert.ok(isValidBotId(DEMO_ID));
  assert.ok(!isValidBotId(DEMO_ID.slice(0, 23)));
});

test('public config shape is what loader.js expects', () => {
  const config = buildPublicConfig({ botId: DEMO_ID, enabled: true, embedType: 'weird' }, {
    widgetScriptUrl: 'https://cdn.x/w.js',
  });
  assert.deepStrictEqual(config, {
    botId: DEMO_ID, embedType: 'live_chat', enabled: true, scriptUrl: 'https://cdn.x/w.js',
  });
});

// ---- the journey -----------------------------------------------------------------

test('step 1: oauth callback exchanges the code and lands on settings', async () => {
  const res = await fetch(`${appUrl}/auth/callback?code=grant-3`, { redirect: 'manual' });
  assert.strictEqual(res.status, 302);
  assert.strictEqual(res.headers.get('location'), `/app?storeId=${STORE_ID}`);
  assert.strictEqual(mockState.tokenRequests[0].client_id, CLIENT_ID);
  assert.strictEqual(mockState.tokenRequests[0].client_secret, CLIENT_SECRET);
  assert.strictEqual(mockState.tokenRequests[0].code, 'grant-3');
});

test('step 1b: callback without code is rejected', async () => {
  assert.strictEqual((await fetch(`${appUrl}/auth/callback`, { redirect: 'manual' })).status, 400);
});

test('step 2: settings page renders with the demo bot; invalid store ids rejected', async () => {
  const html = await (await fetch(`${appUrl}/app?storeId=${STORE_ID}`)).text();
  assert.ok(html.includes('Paste your Chatbot ID'));
  assert.ok(html.includes(`data-demo-id="${DEMO_ID}"`));
  assert.strictEqual((await fetch(`${appUrl}/app?storeId=../evil`)).status, 400);
});

test('step 3: saving pushes the public config to ecwid storage', async () => {
  const body = new URLSearchParams({
    storeId: STORE_ID,
    botId: `js.onload: window.ConferbotWidget("${DEMO_ID}", "live_chat")`,
    enabled: '1',
    embedType: 'live_chat',
  });
  const res = await fetch(`${appUrl}/app/save`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body, redirect: 'manual',
  });
  assert.strictEqual(res.status, 302);

  const saved = JSON.parse(mockState.publicConfigs[STORE_ID]);
  assert.strictEqual(saved.botId, DEMO_ID);
  assert.strictEqual(saved.enabled, true);
  assert.strictEqual(saved.embedType, 'live_chat');
});

test('step 4: the storefront loader is served as javascript', async () => {
  const res = await fetch(`${appUrl}/storefront/loader.js`);
  const js = await res.text();
  assert.match(res.headers.get('content-type'), /javascript/);
  assert.ok(js.includes('getAppPublicConfig'));
  assert.ok(js.includes('conferbot-js'));
});

test('step 5: real browser - widget mounts on an ecwid-like storefront', { skip: process.env.RUN_BROWSER_E2E !== '1' }, async () => {
  const puppeteer = require('puppeteer');
  const publicConfig = mockState.publicConfigs[STORE_ID];

  const site = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.end(`<!doctype html><html><head>
      <script>
        window.Ecwid = {
          OnAPILoaded: { add: function (fn) { setTimeout(fn, 50); } },
          getAppPublicConfig: function (appId) { return ${JSON.stringify(publicConfig)}; },
          getOwnerId: function () { return ${STORE_ID}; }
        };
      </script>
      <script src="${appUrl}/storefront/loader.js"></script>
      </head><body><h1>Mock Ecwid storefront</h1></body></html>`);
  });
  await new Promise((r) => site.listen(0, r));

  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
    args: ['--no-sandbox'],
  });
  try {
    const page = await browser.newPage();
    await page.goto(`http://localhost:${site.address().port}/`, { waitUntil: 'networkidle2', timeout: 60000 });
    await page.waitForSelector('conferbot-widget', { timeout: 30000 });
    assert.strictEqual(await page.evaluate(() => typeof window.ConferbotWidget), 'function');
  } finally {
    await browser.close();
    await new Promise((r) => site.close(r));
  }
});
