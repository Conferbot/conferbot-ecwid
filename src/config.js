'use strict';

/**
 * Environment-driven configuration. OAUTH_BASE/API_BASE exist so tests can
 * point the token exchange and the storage API at a mock server.
 */
module.exports = {
  port: parseInt(process.env.PORT || '3061', 10),
  appUrl: process.env.APP_URL || 'http://localhost:3061',
  clientId: process.env.ECWID_CLIENT_ID || '',
  clientSecret: process.env.ECWID_CLIENT_SECRET || '',
  oauthBase: process.env.ECWID_OAUTH_BASE || 'https://my.ecwid.com',
  apiBase: process.env.ECWID_API_BASE || 'https://app.ecwid.com',
  widgetScriptUrl: process.env.CONFERBOT_WIDGET_URL || 'https://cdn.conferbot.com/dist/v1/widget.min.js',
  demoBotId: '691c970890527a0468f9b2c9',
  dataFile: process.env.DATA_FILE || require('path').join(__dirname, '..', 'data', 'stores.json'),
};
