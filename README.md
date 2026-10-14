# Conferbot Ecwid App

Installs the [Conferbot](https://conferbot.com) AI chat widget on an Ecwid storefront. Same product as the other Conferbot integrations ([Shopify](https://github.com/Conferbot/conferbot-shopify), [BigCommerce](https://github.com/Conferbot/conferbot-bigcommerce), [Wix](https://github.com/Conferbot/conferbot-wix), [WordPress](https://github.com/Conferbot/conferbot-wordpress), [PrestaShop](https://github.com/Conferbot/conferbot-prestashop)), Ecwid-shaped: OAuth install, settings saved to the app's **public storage**, and a storefront loader that reads it via `Ecwid.getAppPublicConfig()`.

## See it in action

![Conferbot Ecwid demo](docs/demo.gif)

[HD video (MP4)](docs/demo.mp4)

## How it works

```
merchant installs from the Ecwid App Market
  -> Ecwid redirects to {APP_URL}/auth/callback?code=
  -> code exchanged at my.ecwid.com/api/oauth/token -> access_token + store_id

merchant saves settings (/app -> /app/save)
  -> app writes {botId, embedType, enabled, scriptUrl} to
     PUT app.ecwid.com/api/v3/{storeId}/storage/public

every storefront page load
  -> Ecwid loads {APP_URL}/storefront/loader.js (registered in the dev portal)
  -> loader reads Ecwid.getAppPublicConfig() and boots
     window.ConferbotWidget(botId, embedType, { customData: { platform: "ecwid", storeId }, user? })
  -> Ecwid.OnOrderPlaced  -> ConferbotWidget.track("purchase", { value, currency?, order_id })  (once per order)
  -> Ecwid.OnCartChanged  -> ConferbotWidget.track("add_to_cart")                              (when items are added)
```

The logged-in customer (from `Ecwid.Customer.get`) is passed as the visitor, unverified: a storefront script cannot hold the identity verification secret. Orders and add-to-cart are reported so Conferbot can credit a sale to the chat that led to it.

The settings page opens only for the store's own admin: from the encrypted `payload` Ecwid adds when it opens the app, or with the short-lived token from the install, and every save carries a token signed with the client secret. A bare `?storeId=` is refused.

Everything visitors see is set per bot in the Conferbot dashboard and delivered at runtime, with nothing to configure in the store: flows and AI agents, live chat with handover to your team (queue position, leave a message when nobody is free, read receipts, file sharing, post-chat rating), the home screen, themes and dark mode, colours, launcher and mascot, greetings, languages and disabled URLs.

The only merchant-facing setting is the **Chatbot ID** (bare ID, full snippet, or URL - auto-extracted), with a one-click **demo bot** (`691c970890527a0468f9b2c9`) that works without a Conferbot account.

## Project layout

```
public/loader.js       # THE storefront file registered in the Ecwid dev portal
src/
├── index.js           # entrypoint
├── server.js          # /auth/callback, /app, /app/save, /storefront/loader.js
├── config.js          # env config (ECWID_OAUTH_BASE/ECWID_API_BASE overridable for tests)
├── ecwid.js           # OAuth token exchange + public storage write
├── widgetScript.js    # bot ID helpers + public-config shape
├── adminPage.js       # two-step settings page
└── store.js           # JSON-file store (swap for a real DB)
test/e2e.test.js       # journey against mock Ecwid + browser widget mount
```

## Setup

1. Register the app at the [Ecwid Developer Portal](https://my.ecwid.com/#develop-apps): set the OAuth redirect to `{APP_URL}/auth/callback`, request scopes `read_store_profile update_store_profile`, and add `{APP_URL}/storefront/loader.js` as the app's storefront JS (External files).
2. Copy `.env.example` to `.env` with the client ID/secret. `APP_URL` must be public HTTPS.
3. `npm install && npm start`, install on your dev store from the portal.

## Tests

```bash
npm test                    # helpers + oauth/settings/storage journey (mock Ecwid)
RUN_BROWSER_E2E=1 npm test  # + headless Chrome: real CDN widget mounts via loader.js
```

## Production checklist (before App Market submission)

- [ ] Real database behind the store record interface
- [x] Ecwid admin payload decryption (settings open from the Ecwid control panel)
- [ ] Register the settings page as the app's native iframe in the Ecwid Developer Portal
- [ ] App Market listing assets (see the submission guide)

## License

MIT.
