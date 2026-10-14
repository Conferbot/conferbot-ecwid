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

  function track(name, props, once) {
    if (!window.ConferbotWidget || typeof window.ConferbotWidget.track !== 'function') return;
    try {
      if (once) {
        if (sessionStorage.getItem('cb-track-' + once)) return;
        sessionStorage.setItem('cb-track-' + once, '1');
      }
    } catch (e) {}
    window.ConferbotWidget.track(name, props || {});
  }

  // What the visitor did, for Conferbot's "chats that led to a sale": the
  // order (once per order) and items added to the cart.
  function watchStore() {
    var E = window.Ecwid;
    if (!E) return;
    if (E.OnOrderPlaced && typeof E.OnOrderPlaced.add === 'function') {
      E.OnOrderPlaced.add(function (order) {
        if (!order) return;
        var id = String(order.vendorOrderNumber || order.orderNumber || order.id || '');
        var props = { value: Number(order.total) || 0, order_id: id };
        if (order.currency) props.currency = String(order.currency);
        track('purchase', props, id ? 'order-' + id : '');
      });
    }
    if (E.OnCartChanged && typeof E.OnCartChanged.add === 'function') {
      var last = null;
      E.OnCartChanged.add(function (cart) {
        var count = cart && typeof cart.productsQuantity === 'number' ? cart.productsQuantity : 0;
        if (last !== null && count > last) track('add_to_cart');
        last = count;
      });
    }
  }

  // The logged-in customer, when Ecwid knows one. Sent unverified: a
  // storefront script cannot hold the identity verification secret.
  function withCustomer(done) {
    var finished = false;
    var finish = function (user) { if (!finished) { finished = true; done(user); } };
    try {
      if (window.Ecwid && window.Ecwid.Customer && typeof window.Ecwid.Customer.get === 'function') {
        window.Ecwid.Customer.get(function (c) {
          finish(c && c.email ? { id: c.id ? 'ecwid-' + c.id : undefined, email: String(c.email), name: c.billingPerson && c.billingPerson.name ? String(c.billingPerson.name) : '' } : null);
        });
        setTimeout(function () { finish(null); }, 2000);
        return;
      }
    } catch (e) {}
    finish(null);
  }

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
      withCustomer(function (user) {
        if (user) options.user = user;
        window.ConferbotWidget(
          config.botId,
          config.embedType === 'popup_chat' ? 'popup_chat' : 'live_chat',
          options
        );
        watchStore();
      });
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
