# Ecwid (Lightspeed E-Series) App Market: submission kit

Everything needed to get the Conferbot Ecwid app (0.1.0) into the Ecwid App Market. Checked against docs.ecwid.com on 2026-10-17. There is no self-serve listing: Ecwid approves the app idea first, then sets up the production app and listing with you.

## 1. Where to submit

| What | Where |
| --- | --- |
| Step 1: app idea | The **"Submit your app idea"** form, linked from https://docs.ecwid.com/launch-apps/steps-to-go-live-with-a-public-app. The form is https://forms.monday.com/forms/4307bb490509448eee3ccc4a54695711?r=use1. Answer in 1–2 business days. If approved, Ecwid gives you a free Premium test store and a dev app. Contact: ec.apps@lightspeedhq.com |
| Step 2: readiness | The **App Readiness Form** (sent by email during onboarding) carries the listing content and assets. Ecwid reviews it in about 3 business days and creates the production app. |
| Step 3: validation | Meet the Validation checklist and record a validation screencast (usability, speed, security, data handling). https://docs.ecwid.com/launch-apps/steps-to-go-live-with-a-public-app/guide-to-app-validation |
| Eligibility | **AI-based apps require a registered company (LLC, LTD, GmbH or equivalent).** You also need a bank or PayPal account that receives USD. https://docs.ecwid.com/launch-apps/faq-about-public-applications |
| Fees | Listing is free. A partner contract with a revenue share on app sales (rate given during onboarding) applies only if the app charges. This one is free. |

## 2. Current requirements and where we stand

| Requirement | Status |
| --- | --- |
| Storefront JS through `customJsUrl`, which needs the **`customize_storefront`** scope | OK in code (#9, fixed). `src/config.js` and the README declare `read_store_profile update_store_profile customize_storefront add_to_cp`. **Ask Ecwid for exactly these four when they create the app**: a scope change later forces every store to reinstall. |
| Settings page inside the Ecwid admin (`add_to_cp` plus `iframeUrl`), with the payload decrypted with the client secret | Code OK (AES payload decryption). The **native page must be registered** by Ecwid (`iframeUrl` = `{APP_URL}/app`), as the README checklist notes. |
| Store ID included in external app authentication (since Sept 2025) | OK. The OAuth callback uses `store_id` in the token exchange URL. |
| Uninstall and personal-data-removal webhooks | OK. `application.uninstalled` and `profile.personalDataRemovalRequest` are both handled, with the signature checked. |
| Uses the Ecwid APIs substantively (apps that mostly collect data are refused) | OK. It uses the storefront JS API, public app storage, and the customer API. |
| AI apps: company entity on file | Owner. |
| Hosted, persistent, reliable (repeated downtime gets an app delisted) | **To do.** A public HTTPS `APP_URL` and a database (`src/store.js` is a JSON file). |

## 3. Blockers

1. **Idea approval** by Ecwid, then onboarding. This is the gate.
2. **Hosting**: a public HTTPS `APP_URL`, a database, and `ECWID_CLIENT_ID` / secret from the app Ecwid creates.
3. **Company entity** details, because this is an AI app.

## 4. Listing copy (ready to paste into the idea and readiness forms)

- **App name:** `Conferbot AI Chatbot`
- **One-line idea / tagline:** `AI chatbot and live chat for Ecwid stores: answer shoppers 24/7, capture leads and hand over to your team.`
- **Idea description** (for the idea form):

  > Conferbot is a hosted AI chatbot and live chat platform. The app adds the Conferbot widget to the merchant's Ecwid storefront through the storefront JS API, with a native settings page in the Ecwid admin where the merchant pastes a Chatbot ID and switches the chat on. Signed-in customers are recognised through `Ecwid.Customer`, so the bot and the merchant's team see who they are talking to. The app is free; merchants need a Conferbot account (a free plan exists).

- **Store description:**

  > Add an AI chat assistant to your Ecwid store. It answers product, shipping and order questions instantly, day and night, collects leads, and hands the conversation to a person on your team whenever a shopper needs one, with queue position, file sharing and a post-chat rating. When nobody is free, shoppers leave a message.
  >
  > Open the app in your Ecwid admin, paste your Chatbot ID and switch the chat on. The widget's look and behaviour (guided flows or an AI agent trained on your content, colours, launcher, greetings and languages) are designed in your Conferbot dashboard and apply straight away. Signed-in customers are recognised, so you know who you are talking to.
  >
  > The app is free. A Conferbot account is needed to run your own bot, and the free plan is enough to start. A demo bot lets you try the widget first.

- **Key benefits:** 24/7 AI answers; live chat handover with an offline message form; lead capture; signed-in customer name and email in the conversation; one-ID setup with no theme edits; a fully brandable widget.
- **Category:** *Customer support* / *Live chat* (as offered)
- **Keywords:** `chatbot, live chat, ai chatbot, customer support, chat widget, helpdesk`
- **Pricing:** Free. Text: "Free app. Requires a Conferbot account; a free plan is available (no card)."
- **Support email:** `support@conferbot.com` (the address on the app's settings page and conferbot.com/contact)
- **Privacy policy:** https://www.conferbot.com/privacy-policy (HTTP 200). **Terms:** https://www.conferbot.com/terms-of-service (HTTP 200)

### Data and GDPR statement

This statement matches `src/server.js`, `src/widgetScript.js` and `public/loader.js`.

- **The app server stores** only, per store ID: the access token and the settings (bot ID, switch, embed type). The `application.uninstalled` and `profile.personalDataRemovalRequest` webhooks delete the record.
- **Ecwid public app storage** holds `{botId, embedType, enabled, scriptUrl}` so the storefront loader can read it. It contains no personal data.
- **What the storefront widget sends:** the shopper's browser loads `https://cdn.conferbot.com/dist/v1/widget.min.js`. The page passes the widget:
  - the Chatbot ID
  - `platform: "ecwid"` and the store ID
  - for a **signed-in customer** (from `Ecwid.Customer.get`): the customer ID (`ecwid-<id>`), email and billing name
- Whatever the shopper types or uploads in the chat goes to Conferbot as the conversation.
- The app sets no cookies of its own.

## 5. Reviewer / validation test instructions (once hosted)

> 1. Install the app on the test store. Open it from the Ecwid admin (Apps > My Apps > Conferbot); the settings page opens inside the admin.
> 2. Click "Try our demo bot", or paste the public demo Chatbot ID `691c970890527a0468f9b2c9` (a live "Startup Consultation Chatbot"; no Conferbot account needed). Turn the chat on and save.
> 3. Open the storefront. A chat bubble appears bottom right. Click it and reply to the bot.
> 4. Sign in as a customer and reload: the conversation receives the customer's name and email.
> 5. Uninstall: the storefront JS stops loading, and the store's record and token are deleted (uninstall webhook).

## 6. Assets (in `docs/marketplace/assets/`)

Ecwid publishes no image specs; they arrive with the readiness form.

| File | Size | Content |
| --- | --- | --- |
| `icon-512x512.png` | 512x512 | Conferbot logo (from the landing site) on white |
| `screenshot-1-settings-1600x900.png` | 1600x900 | The app's real settings page after saving (from the e2e recording) |

**Still needed** (sizes from the readiness form): the settings page inside the Ecwid admin, and the storefront with the chat open, both captured on the Premium test store. The storefront in `docs/demo.gif` is a mock and must not be used. You also need the validation screencast.

## 7. Owner checklist

- [ ] Submit the app idea (form above) with the idea description. Wait 1–2 business days.
- [ ] Provide company entity details (AI app rule) and accept the partner contract.
- [x] Fix #9 (scopes declared in code and README).
- [ ] Ask Ecwid for the scopes `read_store_profile update_store_profile customize_storefront add_to_cp`. Host the app (HTTPS `APP_URL`, a database) and give Ecwid the `iframeUrl`, `customJsUrl`, `webhookUrl` and redirect URL.
- [ ] Fill in the App Readiness Form with the copy and assets above, plus screenshots from the test store.
- [ ] Record the validation screencast and pass validation.

Owner time: about half a day spread over onboarding. Process: idea review 1–2 days, readiness 3 days, then validation. Fees: none for a free app.
