/**
 * Conferbot storefront loader for Ecwid.
 *
 * Register this file's public URL as the app's storefront JS in the Ecwid
 * Developer Portal (App details > External files). Ecwid loads it on every
 * storefront page; it reads the per-store settings the settings page saved
 * to the app's PUBLIC storage and boots the Conferbot widget.
 */
(function () {
  var BOT_ID_RE = /^[a-f0-9]{24}$/i;

  function boot(config) {
    if (!config || !config.botId || !BOT_ID_RE.test(config.botId) || config.enabled === false) return;
    if (document.getElementById('conferbot-js')) return;
    var js = document.createElement('script');
    js.async = true;
    js.src = config.scriptUrl || 'https://cdn.conferbot.com/dist/v1/widget.min.js';
    js.id = 'conferbot-js';
    js.charset = 'UTF-8';
    js.onload = function () {
      var options = { customData: { platform: 'ecwid' } };
      try {
        if (window.Ecwid && typeof window.Ecwid.getOwnerId === 'function') {
          options.customData.storeId = String(window.Ecwid.getOwnerId());
        }
      } catch (e) {}
      window.ConferbotWidget(
        config.botId,
        config.embedType === 'popup_chat' ? 'popup_chat' : 'live_chat',
        options
      );
    };
    (document.head || document.documentElement).appendChild(js);
  }

  function readConfig() {
    try {
      var raw = window.Ecwid.getAppPublicConfig('conferbot-live-chat');
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  if (window.Ecwid && typeof window.Ecwid.OnAPILoaded === 'object' && window.Ecwid.OnAPILoaded.add) {
    window.Ecwid.OnAPILoaded.add(function () { boot(readConfig()); });
  } else if (window.Ecwid && typeof window.Ecwid.getAppPublicConfig === 'function') {
    boot(readConfig());
  }
})();
