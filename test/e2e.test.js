'use strict';

/**
 * End-to-end test: mock Ecwid (OAuth token endpoint + Application Storage
 * API) plus the real app. The browser stage (RUN_BROWSER_E2E=1) loads a
 * fake Ecwid storefront that stubs Ecwid.getAppPublicConfig with the saved
 * config and asserts the real CDN widget mounts via public/loader.js.
 */

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
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
      if (req.method === 'POST' && url.pathname === `/api/oauth/token/${STORE_ID}`) {
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
  const res = await fetch(`${appUrl}/auth/callback?code=grant-3&store_id=${STORE_ID}`, { redirect: 'manual' });
  assert.strictEqual(res.status, 302);
  assert.ok(res.headers.get('location').startsWith(`/app?storeId=${STORE_ID}&session=`));
  assert.strictEqual(mockState.tokenRequests[0].client_id, CLIENT_ID);
  assert.strictEqual(mockState.tokenRequests[0].client_secret, CLIENT_SECRET);
  assert.strictEqual(mockState.tokenRequests[0].code, 'grant-3');
});

test('step 1b: callback without code is rejected', async () => {
  assert.strictEqual((await fetch(`${appUrl}/auth/callback`, { redirect: 'manual' })).status, 400);
  // Ecwid's current flow always sends store_id; the retired path is not used.
  assert.strictEqual((await fetch(`${appUrl}/auth/callback?code=x`, { redirect: 'manual' })).status, 400);
  assert.strictEqual((await fetch(`${appUrl}/auth/callback?code=x&store_id=../1`, { redirect: 'manual' })).status, 400);
  // The code is exchanged under the installing store's id (the mock knows only 10001).
  const other = await fetch(`${appUrl}/auth/callback?code=x&store_id=20002`, { redirect: 'manual' });
  assert.strictEqual(other.status, 502);
});

let formToken; // the settings page's signed form token

// The payload Ecwid adds when it opens the app: IV + AES-128-CBC(JSON), base64url.
function ecwidPayload(obj, secret = CLIENT_SECRET) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-128-cbc', Buffer.from(secret.slice(0, 16), 'utf8'), iv);
  const enc = Buffer.concat([cipher.update(JSON.stringify(obj), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, enc]).toString('base64url');
}

test('step 2: settings page opens from the ecwid admin payload; invalid store ids rejected', async () => {
  const res = await fetch(`${appUrl}/app?payload=${ecwidPayload({ store_id: Number(STORE_ID), access_token: 'x', lang: 'en' })}`);
  const html = await res.text();
  assert.strictEqual(res.status, 200);
  assert.ok(html.includes('Paste your Chatbot ID'));
  assert.ok(html.includes(`data-demo-id="${DEMO_ID}"`));
  formToken = html.match(/name="token" value="([^"]+)"/)[1];
  assert.strictEqual((await fetch(`${appUrl}/app?storeId=../evil`)).status, 400);
});

test('step 2b: settings refuse anyone but the store admin', async () => {
  const session = require('../src/session');
  // A bare ?storeId= (the old hole), a payload made with another secret, another store's token.
  assert.strictEqual((await fetch(`${appUrl}/app?storeId=${STORE_ID}`)).status, 401);
  assert.strictEqual((await fetch(`${appUrl}/app?payload=${ecwidPayload({ store_id: Number(STORE_ID) }, 'another-secret-xx')}`)).status, 400);
  const other = session.issueToken('999', CLIENT_SECRET);
  assert.strictEqual((await fetch(`${appUrl}/app?storeId=${STORE_ID}&session=${encodeURIComponent(other)}`)).status, 401);
  const post = (fields) => fetch(`${appUrl}/app/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ storeId: STORE_ID, botId: 'aaaaaaaaaaaaaaaaaaaaaaaa', enabled: '1', ...fields }),
    redirect: 'manual',
  });
  assert.strictEqual((await post({})).status, 401);
  assert.strictEqual((await post({ token: session.issueToken(STORE_ID, 'wrong-secret') })).status, 401);
  assert.strictEqual(mockState.publicConfigs[STORE_ID], undefined);
});

test('step 3: saving pushes the public config to ecwid storage', async () => {
  const body = new URLSearchParams({
    storeId: STORE_ID,
    botId: `js.onload: window.ConferbotWidget("${DEMO_ID}", "live_chat")`,
    enabled: '1',
    embedType: 'live_chat',
    token: formToken,
  });
  const res = await fetch(`${appUrl}/app/save`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body, redirect: 'manual',
  });
  assert.strictEqual(res.status, 302);

  // Ecwid storage takes { value: "<string>" }; the value is the config as JSON text.
  const entry = JSON.parse(mockState.publicConfigs[STORE_ID]);
  assert.deepStrictEqual(Object.keys(entry), ['value']);
  assert.strictEqual(typeof entry.value, 'string');
  const saved = JSON.parse(entry.value);
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
  assert.ok(js.includes(`var APP_ID = "${CLIENT_ID}";`));
});

test('step 4b: the loader boots from the public config however Ecwid returns it', async () => {
  const js = await (await fetch(`${appUrl}/storefront/loader.js`)).text();
  const value = JSON.parse(mockState.publicConfigs[STORE_ID]).value;
  for (const returned of [value, JSON.stringify({ key: 'public', value }), { key: 'public', value }]) {
    const calls = [];
    const added = [];
    const doc = {
      getElementById: () => null,
      createElement: () => ({}),
      head: { appendChild: (el) => added.push(el) },
    };
    const Ecwid = { getAppPublicConfig: (id) => { calls.push(id); return returned; } };
    new Function('window', 'document', js)({ Ecwid }, doc);
    assert.deepStrictEqual(calls, [CLIENT_ID]);
    assert.strictEqual(added.length, 1);
    assert.strictEqual(added[0].src, 'https://cdn.conferbot.com/dist/v1/widget.min.js');
    assert.strictEqual(added[0].id, 'conferbot-js');
  }
});

function signedWebhook(event, secret = CLIENT_SECRET) {
  const signature = crypto.createHmac('sha256', secret).update(`${event.eventCreated}.${event.eventId}`).digest('base64');
  return fetch(`${appUrl}/webhooks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Ecwid-Webhook-Signature': signature },
    body: JSON.stringify(event),
  });
}

test('step 6: uninstall webhook is verified and removes the store', async () => {
  const event = { eventId: 'e-1', eventCreated: 1760000000, storeId: Number(STORE_ID), entityId: Number(STORE_ID), eventType: 'application.uninstalled', data: {} };
  // Unsigned and forged calls are refused and change nothing.
  const unsigned = await fetch(`${appUrl}/webhooks`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(event) });
  assert.strictEqual(unsigned.status, 401);
  assert.strictEqual((await signedWebhook(event, 'another-secret')).status, 401);
  assert.strictEqual((await fetch(`${appUrl}/preview/public-config.json?storeId=${STORE_ID}`).then((r) => r.json())).botId, DEMO_ID);

  // Other events are acknowledged and ignored.
  assert.strictEqual((await signedWebhook({ ...event, eventId: 'e-0', eventType: 'order.created' })).status, 200);
  assert.strictEqual((await fetch(`${appUrl}/preview/public-config.json?storeId=${STORE_ID}`).then((r) => r.json())).botId, DEMO_ID);

  assert.strictEqual((await signedWebhook(event)).status, 200);
  assert.deepStrictEqual(await fetch(`${appUrl}/preview/public-config.json?storeId=${STORE_ID}`).then((r) => r.json()), {});
  const page = await fetch(`${appUrl}/app?payload=${ecwidPayload({ store_id: Number(STORE_ID) })}`);
  assert.strictEqual(page.status, 401);
});

test('step 5: real browser - widget mounts on an ecwid-like storefront', { skip: process.env.RUN_BROWSER_E2E !== '1' }, async () => {
  const puppeteer = require('puppeteer');
  const publicConfig = JSON.parse(mockState.publicConfigs[STORE_ID]).value;

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
