'use strict';

/** Bot ID helpers shared by every Conferbot integration. */

const BOT_ID_RE = /^[a-f0-9]{24}$/i;

function isValidBotId(id) {
  return BOT_ID_RE.test(String(id || ''));
}

function extractBotId(text) {
  const m = String(text || '').match(/[a-f0-9]{24}/i);
  return m ? m[0] : '';
}

/** The JSON blob written to Ecwid public storage and read by public/loader.js. */
function buildPublicConfig(record, cfg) {
  return {
    botId: record.botId || '',
    embedType: record.embedType === 'popup_chat' ? 'popup_chat' : 'live_chat',
    enabled: !!record.enabled,
    scriptUrl: cfg.widgetScriptUrl,
  };
}

module.exports = { isValidBotId, extractBotId, buildPublicConfig };
