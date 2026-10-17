# Changelog

## 0.1.0 - 2026-10-17

First tagged version of the Conferbot Ecwid app (Express, OAuth). Not yet listed on the Ecwid App Market.

- OAuth callback, settings page and the public config pushed to Ecwid app storage; storefront loader.
- OAuth: the code is exchanged at `/api/oauth/token/{store_id}`, and the install callback requires and passes Ecwid's `store_id`.
- Public config saved as Ecwid's `{ value }` entry and read with the app's client id; the loader is served with the configured client id.
- Settings open and save only for the store admin, through signed, short-lived tokens; the admin payload Ecwid opens the app with is decoded and checked.
- Tracking: logged-in customer passed to the widget, purchases once per order, add-to-cart.
- Webhooks: signatures verified; uninstall and data-removal webhooks delete the store record.
- Settings say where the bot ID is in the Conferbot dashboard (Share > Embed into your website).
