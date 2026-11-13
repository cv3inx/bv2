<h1 align="center">@violetix/baileys</h1>

<p align="center">
   A WhatsApp Web API for Node — Baileys v7 with interactive messages, albums, payment
   messages, newsletter media, and the protocol surface upstream does not expose yet.
   <br><br>
   <a href="https://www.npmjs.com/package/@violetix/baileys">
      <img src="https://img.shields.io/npm/v/@violetix/baileys?style=for-the-badge&logo=npm" alt="npm version" />
   </a>
   <a href="https://www.npmjs.com/package/@violetix/baileys">
      <img src="https://img.shields.io/npm/dm/@violetix/baileys?style=for-the-badge&logo=npm" alt="npm downloads" />
   </a>
   <a href="https://github.com/cv3inx/bv2">
      <img src="https://img.shields.io/github/stars/cv3inx/bv2?style=for-the-badge&logo=github" alt="GitHub stars" />
   </a>
   <a href="LICENSE">
      <img src="https://img.shields.io/badge/license-MIT-blue?style=for-the-badge" alt="MIT license" />
   </a>
   <a href="https://nodejs.org">
      <img src="https://img.shields.io/badge/node-%3E%3D20-339933?logo=node.js&labelColor=green&logoColor=white&style=for-the-badge" alt="Node.js 20 or newer" />
   </a>
   <a href="#-import-esm--cjs">
      <img src="https://img.shields.io/badge/ESM-only?logo=javascript&labelColor=yellow&logoColor=black&style=for-the-badge" alt="ES modules" />
   </a>
</p>

```bash
npm i @violetix/baileys
```

<details>
<summary><b>📋 Table of contents</b></summary>

- [📥 Installation](#-installation)
  - [🧩 Import (ESM & CJS)](#-import-esm--cjs)
- [🌐 Connect to WhatsApp (Quick Step)](#-connect-to-whatsapp-quick-step)
  - [🔐 Auth State](#-auth-state)
- [🗄️ Implementing Data Store](#%EF%B8%8F-implementing-data-store)
- [🪪 WhatsApp IDs Explain](#-whatsapp-ids-explain)
- [⚡ Why this fork exists](#-why-this-fork-exists)
- [🛠️ Upstream Fixes & Improvements](#%EF%B8%8F-upstream-fixes--improvements)
- [📨 Messages Handling & Compatibility](#-messages-handling--compatibility)
- [🧩 Additional Message Options](#-additional-message-options)
- [🆕 WhatsApp Protocol Extensions](#-whatsapp-protocol-extensions)
- [✉️ Sending Messages](#%EF%B8%8F-sending-messages)
  - [🔠 Text](#-text)
  - [🔔 Mention](#-mention)
  - [😁 Reaction](#-reaction)
  - [📌 Pin Message](#-pin-message)
  - [🔖 Keep Chat](#-keep-chat)
  - [➡️ Forward Message](#%EF%B8%8F-forward-message)
  - [👤 Contact](#-contact)
  - [📍 Location](#-location)
  - [🗓️ Event](#%EF%B8%8F-event)
  - [👥 Group Invite](#-group-invite)
  - [🛍️ Product](#%EF%B8%8F-product)
  - [📊 Poll](#-poll)
  - [💭 Button Response](#-button-response)
  - [✨ Rich Response](#-rich-response)
  - [🧾 Message with Code Block](#-message-with-code-block)
  - [🌏 Message with Inline Entities](#-message-with-inline-entities)
  - [📋 Message with Table](#-message-with-table)
  - [🎞️ Status Mention](#%EF%B8%8F-status-mention)
- [📁 Sending Media Messages](#-sending-media-messages)
  - [🖼️ Image](#%EF%B8%8F-image)
  - [🎥 Video](#-video)
  - [📃 Sticker](#-sticker)
  - [💽 Audio](#-audio)
  - [🗂️ Document](#%EF%B8%8F-document)
  - [🖼️ Album (Image & Video)](#%EF%B8%8F-album-image--video)
  - [📦 Sticker Pack](#-sticker-pack)
- [📤 Downloading Media](#-downloading-media)
- [👉🏻 Sending Interactive Messages](#-sending-interactive-messages)
  - [🔘 Buttons](#-buttons)
  - [📋 List](#-list)
  - [🗄️ Interactive](#%EF%B8%8F-interactive)
  - [🫙 Hydrated Template](#-hydrated-template)
- [💳 Sending Payment Messages](#-sending-payment-messages)
  - [➕ Invite Payment](#-invite-payment)
  - [🧾 Invoice](#-invoice)
  - [🛍️ Order](#%EF%B8%8F-order)
  - [💳 Request Payment](#-request-payment)
- [👁️ Other Message Options](#%EF%B8%8F-other-message-options)
  - [🤖 AI Icon](#-ai-icon)
  - [🕒 Ephemeral](#-ephemeral)
  - [📰 External Ad Reply](#-external-ad-reply)
  - [🧑‍🧑‍🧒 Group Status](#%E2%80%8D%E2%80%8D-group-status)
  - [🐱 Lottie Sticker](#-lottie-sticker)
  - [🧩 Raw](#-raw)
  - [🏷️ Secure Meta Service Label](#%EF%B8%8F-secure-meta-service-label)
  - [📑 Spoiler](#-spoiler)
  - [👁️ View Once](#%EF%B8%8F-view-once)
  - [👁️ View Once V2](#%EF%B8%8F-view-once-v2)
  - [👁️ View Once V2 Extension](#%EF%B8%8F-view-once-v2-extension)
- [♻️ Modify Messages](#%EF%B8%8F-modify-messages)
  - [🗑️ Delete Messages](#%EF%B8%8F-delete-messages)
  - [✏️ Edit Messages](#%EF%B8%8F-edit-messages)
- [🧰 Additional Contents](#-additional-contents)
  - [🏷️ Find User ID (JID|PN/LID)](#%EF%B8%8F-find-user-id-jidpnlid)
  - [🔑 Request Custom Pairing Code](#-request-custom-pairing-code)
  - [🖼️ Image Processing](#%EF%B8%8F-image-processing)
  - [📣 Newsletter Management](#-newsletter-management)
  - [👥 Group Management](#-group-management)
  - [👥 Community Management](#-community-management)
  - [👤 Profile Management](#-profile-management)
  - [🛒 Business Management](#-business-management)
  - [🔐 Privacy Management](#-privacy-management)
  - [🆔 Username Management](#-username-management)
  - [🔍 USync Queries](#-usync-queries)
  - [🤝 Interoperability (BirdyChat & Haiket)](#-interoperability-birdychat--haiket)
  - [🔒 Account Security (Password & Passkey)](#-account-security-password--passkey)
  - [👪 Managed Accounts & Payments](#-managed-accounts--payments)
  - [🌐 HTTPS GraphQL (Meta AI & Imagine)](#-https-graphql-meta-ai--imagine)
  - [📡 Events](#-events)
- [Development checks](#development-checks)
- [📦 Fork Base](#-fork-base)
- [📣 Credits](#-credits)

</details>

## 📥 Installation

Requires **Node.js 20 or newer**. The package uses **ES modules (ESM)**.
Save examples as `.mjs` files, or set `"type": "module"` in your application's `package.json`.

```bash
# from npm
npm i @violetix/baileys

# or straight from the repository, to track main ahead of a release
npm i github:cv3inx/bv2
```

Equivalent `package.json` entries — one or the other, not both:

```json
{
   "dependencies": {
      "@violetix/baileys": "^0.3.18"
   }
}
```

```json
{
   "dependencies": {
      "@violetix/baileys": "github:cv3inx/bv2"
   }
}
```

### 🧩 Import (ESM & CJS)

ES modules:

```javascript
import makeWASocket, { useMultiFileAuthState } from "@violetix/baileys";
```

From CommonJS, use dynamic `import()` inside an async function:

```javascript
async function main() {
  const { makeWASocket, useMultiFileAuthState } = await import("@violetix/baileys");
  // Create your socket here.
}

main().catch(console.error);
```

## 🌐 Connect to WhatsApp (Quick Step)

1. Install the package and the logger used by this example:

   ```bash
   npm install @violetix/baileys pino
   ```

2. Save the following code as `index.mjs`. Replace `myPhoneNumber` with your WhatsApp number, including the country code and using digits only.

```javascript
import {
  makeWASocket,
  delay,
  DisconnectReason,
  fetchLatestWaWebVersion,
  useMultiFileAuthState,
} from "@violetix/baileys";
import pino from "pino";

const myPhoneNumber = "6288888888888";
const logger = pino({ level: "silent" });

async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState("session");
  const sock = makeWASocket({
    logger,
    auth: state,
    // Optional: resolve the WhatsApp Web version on each connection.
    version: async () => (await fetchLatestWaWebVersion()).version,
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async ({ connection, lastDisconnect }) => {
    try {
      if (connection === "close") {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        console.log("Connection closed:", lastDisconnect?.error);

        if (shouldReconnect) {
          await delay(3000);
          await connectToWhatsApp();
        } else {
          console.log("Logged out. Pair a new session to connect again.");
        }
      } else if (connection === "open") {
        console.log("Connected to WhatsApp");
      }
    } catch (error) {
      console.error("Connection error:", error);
    }
  });

  sock.ev.on("messages.upsert", async ({ type, messages }) => {
    if (type !== "notify") return;

    for (const message of messages) {
      const jid = message.key.remoteJid;
      if (!message.message || message.key.fromMe || !jid) continue;
      if (!jid.endsWith("@s.whatsapp.net") && !jid.endsWith("@lid")) continue;

      try {
        await sock.sendMessage(jid, { text: "Hello world" });
      } catch (error) {
        console.error("Failed to reply:", error);
      }
    }
  });

  if (!state.creds.registered) {
    // This fork waits internally until the server is ready for pairing.
    const code = await sock.requestPairingCode(myPhoneNumber);
    console.log("Pairing code:", code);
  }
}

connectToWhatsApp().catch(console.error);
```

3. Run `node index.mjs`, then enter the printed pairing code in WhatsApp's linked-device flow on your phone.

This example replies to new incoming direct messages. Credentials are saved in
`session/` and reused on later runs. Keep that directory private and out of version control.

### 🔐 Auth State

> [!NOTE]
> You can use the experimental `useSingleFileAuthState` and `useSqliteAuthState` as an alternative to `useMultiFileAuthState`. However, `useSingleFileAuthState` already includes an internal caching mechanism, so there is no need to wrap `state.keys` with `makeCacheableSignalKeyStore`.

## 🗄️ Implementing Data Store

`makeInMemoryStore` keeps chats, contacts, and messages in memory. For larger deployments,
use a persistent store appropriate to your application's memory and retention requirements.

Add this import and create the store **outside** `connectToWhatsApp()` in the quick-start example,
after the `logger` declaration, so reconnects reuse the same store:

```javascript
import { makeInMemoryStore } from "@violetix/baileys";

const storePath = "./store.json";
const store = makeInMemoryStore({ logger });
store.readFromFile(storePath);

// Create one persistence timer for the application, not one per reconnect.
setInterval(() => {
  try {
    store.writeToFile(storePath);
  } catch (error) {
    console.error("Failed to save the store:", error);
  }
}, 180_000).unref();
```

Add `getMessage` to the `makeWASocket` options so retries and poll updates can retrieve
previously stored messages:

```javascript
getMessage: async (key) => {
  if (!key.remoteJid || !key.id) return undefined;
  const message = await store.loadMessage(key.remoteJid, key.id);
  return message?.message;
},
```

Immediately after creating each socket, bind its events to the store:

```javascript
store.bind(sock.ev);

sock.ev.on("chats.upsert", () => {
  console.log("Chats:", store.chats.all());
});

sock.ev.on("contacts.upsert", () => {
  console.log("Contacts:", Object.values(store.contacts));
});
```

The file snapshot is saved every three minutes. Keep `store.json` private as it contains chat data.

## 🪪 WhatsApp IDs Explain

A JID identifies a WhatsApp account, group, or destination. A LID is an account identifier;
it is not a phone number and must not be converted into one by changing its suffix.

| Destination | Example JID |
| --- | --- |
| User, addressed by phone number | `19999999999@s.whatsapp.net` |
| User, addressed by LID | `12699999999@lid` |
| Group | `123456789-123345@g.us` |
| Newsletter / channel | `120111111111111111@newsletter` |
| Meta AI | `11111111111@bot` |
| Broadcast list | `[timestamp of creation]@broadcast` |
| Status / stories | `status@broadcast` |

Use the JID returned by message events or lookup APIs instead of constructing one from an assumed phone number.

> [!IMPORTANT]
> Senders who set a WhatsApp [username](#-username-management) arrive LID-addressed, and WhatsApp sends **no** phone number alongside them. This fork recovers the phone number from the local LID↔PN mapping and fills in `key.remoteJidAlt` (or `key.participantAlt` in groups).
> That recovery only works once a mapping exists — from history sync, group metadata, or an earlier chat. On a first-ever contact from a username user there is genuinely no phone number to recover, so **handle `@lid` natively** rather than assuming a phone number is always available.

## ⚡ Why this fork exists

This is the Baileys build that runs the Violetics bot fleet: roughly 125 WhatsApp sessions inside
one Node process. Everything in the table below came out of that, and most of it is invisible until
you run more than a handful of sockets at once — a bug that costs one session a reconnect costs a
fleet an hour of flapping.

| Change | What it fixes |
| --- | --- |
| **Disconnect reasons are named** | `CB:failure` closed with the constant message `Connection Failure` for a 401 device-removal and for a transient 503 alike. A host that re-emits the close as its own `error` event forwards `message` and nothing else, so it could not tell a dead session from a blip and reconnected both — one logout became a re-auth loop and the number got banned. `end()` now appends the code and its `DisconnectReason`: `Connection Failure [401 loggedOut]`. |
| **Retry caches are bounded** | `sessionRecreateHistory` and `retryCounters` had a TTL but no `max`, and one `MessageRetryManager` exists per socket. `retryCounters` sets `updateAgeOnGet`, so a message stuck in a retry loop refreshed its own expiry indefinitely — the opposite of what a TTL backstop is for. |
| **Keepalive is per socket, and staggered** | A single process-wide 30s timer pinged every socket in the same tick, while the staleness check used the configured interval — so any `keepAliveIntervalMs` other than 30000 produced false `connectionLost` closes. Each socket now owns its timer and starts on a random offset. |
| **Housekeeping is not gated on presence** | The 24-hour `tcTokenKnownJids` prune only ran while `isOnline` was true, and `isOnline` is only ever set by `sendPresenceUpdate`. A bot that never marks itself online never pruned anything. |
| **One failing socket cannot take the host down** | A socket that failed to open, and an unhandled rejection out of `end()` mid-teardown, killed the whole process — and with it every other session sharing it. |
| **Signal writes persist before success** | Key-store writes are awaited, transaction contexts are isolated per auth store, and session deletion is reflected immediately. Close still waits for the key-store flush barrier. |
| **The offline queue drains fully** | Baileys asked for one `offline_batch` of 100 stanzas and never asked for another, so a larger backlog stayed on the server and grew on every reconnect. |

Upstream feature work — newsletter media, interactive messages, albums, the MEX and HTTPS GraphQL
surface — is listed under [Upstream Fixes & Improvements](#%EF%B8%8F-upstream-fixes--improvements)
and the sections after it.

## 🛠️ Upstream Fixes & Improvements

- 🖼️ Fixed an issue where media could not be sent to newsletters due to an upstream issue.
- 📁 Reintroduced [`makeInMemoryStore`](#%EF%B8%8F-implementing-data-store) with a minimal ESM adaptation and small adjustments for Baileys v7.
- 📦 Switched FFmpeg execution from `exec` to `spawn` for safer process handling.
- 🗃️ Added [`@napi-rs/image`](https://www.npmjs.com/package/@napi-rs/image) as a supported image processing backend in [`getImageProcessingLibrary()`](#%EF%B8%8F-image-processing), offering a balance between performance and compatibility.
- 🪪 Recovered the phone number for LID-addressed senders that arrive without one, so [username](#-username-management) users no longer show up as a bare `@lid`.
- 📞 Routed top-level call stanzas (`<offer>`, `<terminate>`, …) that arrive outside a `<call>` wrapper, and acknowledged them — previously they were never acked, so the server kept redelivering them.
- 🤖 Decrypted `msmsg` Meta AI bot replies instead of dropping them. The `messageSecret` is captured at send time and recovered from `getMessage` after a restart.
- 🔍 Parsed the USync fields that were previously left as TODOs: per-protocol errors with backoff, cache `refresh` hints, `side_list`, per-contact privacy tokens, and blocked-by-contact detection.
- 🆔 Fixed the USync username parser, which returned `null` for the `Uint8Array` payloads the binary decoder actually produces.
- 📥 Drained the whole offline queue on reconnect. Baileys requested a single `offline_batch` of 100 stanzas and never asked for another, so any larger backlog stayed on the server and grew on every reconnect.
- 📣 Fanned out sends to broadcast lists (`<id>@broadcast`) over a sender key, using the same `statusJidList` option as status posts for the recipient list.
- 🔑 Surfaced `keyRequired` from `onWhatsAppUsername()` when the server withholds the account until the 4-digit username key is supplied; previously such rows were dropped.
- 🔔 Emitted `username.update` (a contact set or removed their `@username`), `lid-mapping.update` (a contact's LID rotated; the known phone number is carried over), and `privacy.update` (privacy settings changed on the phone) from server notifications.
- 🙈 Skipped placeholder resend requests for `<unavailable/>` messages WhatsApp marks as unrecoverable (`<bot/>`, `hosted="true"`, `type="view_once"`); the previous check compared against attribute values the server never sends.
- 🪪 Recognised own LID / hosted devices as `fromMe` in status posts and group notifications, and read `remoteJidUsername` from the `username` attribute on 1:1 messages.
- 📌 Requested `fetch_pinned_messages` on `newsletterMetadata()`, so pinned posts come back with the metadata.
- 🎞️ Attached the `streamingSidecar` WhatsApp Web sends with video and audio uploads, so recipients can seek and play while downloading. Skipped for mp4 files that are not faststart (`mdat` before `moov`), where a sidecar would make playback fail instead of falling back to a plain download.
- 🕒 Stamped `disappearingMode` (and `ephemeralSettingTimestamp` when passed via `sendMessage` options) on ephemeral messages, matching WhatsApp Web; without it the peer warns the message will not disappear.
- 🗳️ Added `decryptPollVoteWithFallback()` / `decryptEventResponseWithFallback()`, which try the poll or event creator's PN and LID forms; voters encrypt with whichever form of the creator JID they hold. Event responses now use it internally.
- 🆔 Username lookups (`onWhatsAppUsername()`) request LID addressing, as WhatsApp Web does; `USyncQuery.withContactProtocol('lid' | 'pn')` exposes the switch.
- 🗳️ Poll votes are decrypted again inside `processMessage` and surfaced as `pollUpdates` on `messages.update` (like Baileys v6.4 did), trying the creator's PN and LID forms. Requires `getMessage` to return the poll creation message.
- 🧾 `hideVoter` / `canAddOption` polls go out as `pollCreationMessageV6`, the only version that carries those flags.
- 🧠 History sync chunks are decoded one conversation at a time instead of materialising the whole `HistorySync` tree, cutting peak memory on large syncs. Output is byte-identical to the previous path.
- 🔢 `version` accepts a resolver function, and a `405 client_too_old` failure fetches the live WA Web build and applies it on the next reconnect. `fetchLatestWaWebVersion()` now times out after 10s (`timeoutMs` / `signal` options).
- 🔐 Passkey-gated (Shortcake) accounts are surfaced: `connection.update { passkeyRequired: true }` plus a warning when the server sends `passkey_prologue_request`. Expired pairing codes (`refresh_code`) are re-registered automatically with the same code, or surfaced as `connection.update { pairingCodeExpired: true }`.
- 🏢 `onWhatsAppUsername()` also reports `isBusiness` / `pnJid`; the USync business parser treats a `<error/>` child as "not a business" instead of failing the whole query, and `withBusinessProtocol(null)` asks for the verified name only.
- 🖼️ Added [image polls](#%EF%B8%8F-image-poll): `sendMessage(jid, { imagePoll })` uploads one image per option, hashes each option over its uploaded `fileSha256`, sends the `pollCreationMessageV3` parent with `pollContentType: IMAGE`, then one `pollCreationOptionImageMessage` child per option associated back by `MEDIA_POLL`. `hashImagePollOption()` is exported separately. Ported from [`@rennzsync/baileys`](https://github.com/RennZSync/baileys).
- 🧩 Added [A2UI widgets](#-a2ui-widget): `sendMessage(jid, { a2ui })` with a declarative builder (`Text`, `Image`, `Video`, `Button`, `Card`, `Column`, `Row`, `Divider`, `CheckBox`, `TextField`, `ChoicePicker`, plus `listCard`) compiled into `interactiveMessage.bloksWidget`. Ported from [`@rennzsync/baileys`](https://github.com/RennZSync/baileys), rebuilt on this fork's own interactive path so the `<biz>` node and button shapes are the existing ones.
- 🙊 Added the [`exclusive`](#-exclusive-message) send option: a group message addressed to a single member (`to=<group> participant=<member>`, per-device encryption instead of the group sender key), so no other member receives the stanza. The recipient comes from the quoted message's author, or from an explicit jid.
- 🚫 Added [`sock.ignoreKey()`](#-ignoring-inbound-stanzas): drops matching inbound stanzas before any handler — including the decryption and persistence paths — while still acking so the server stops redelivering. Matches by `remoteJid` / `fromMe` / `id` / `participant` (PN ↔ LID alt attributes included) or by predicate, over `message`, `receipt`, `notification`, `presence`, `chatstate` and `call`. `category='peer'` traffic from your own devices is never dropped, so an app-state key share cannot be filtered away by accident.
- 🛡️ Added [`createAnchorGuard()`](#%EF%B8%8F-anchor-guard) / `detectBug()`: flags payloads that force-close WhatsApp clients — invisible and combining character floods, mention bombs, oversized native-flow / list / carousel payloads, broken `buttonParamsJson`, over-deep or circular structures — then deletes them and optionally blocks the sender or kicks on burst. Ported from [`@rexxhayanasi/elaina-anchorguard`](https://www.npmjs.com/package/@rexxhayanasi/elaina-anchorguard) (MIT) via [`@rennzsync/baileys`](https://github.com/RennZSync/baileys).
- 🗓️ Sent `encEventResponseMessage` and `EVENT_EDIT` secrets as `type=event`. Only `eventMessage` was matched, so event responses went out as `type=text` — a pairing a real client never sends, and the server validates stanza shape.
- 🧾 Stamped `mediatype=group_history` on `messageHistoryBundle` sends, which previously carried no media type at all.
- 🔑 `useMultiFileAuthState(folder, logger)` and `useSingleFileAuthState(file, logger)` accept a logger. Credential write failures were swallowed entirely (the internal logger was hard-wired to `null`), so a full disk or a permission error lost the session and looked like a random logout on the next boot. Corrupt or unreadable key files are reported too, and `_destroy()` releases the process exit hooks a long-lived multi-session host would otherwise leak.

## 📨 Messages Handling & Compatibility

- 📩 Expanded messages support for:
  - 🖼️ [Album Message](#%EF%B8%8F-album-image--video)
  - 👤 [Group Status Message](#%E2%80%8D%E2%80%8D-group-status)
  - 👉🏻 [Interactive Message](#-sending-interactive-messages) (buttons, lists, native flows, templates, carousels).
  - 🎞️ [Status Mention Message](#%EF%B8%8F-status-mention)
  - 📦 [Sticker Pack Message](#-sticker-pack)
  - 🖼️ [Image Poll](#%EF%B8%8F-image-poll)
  - 🧩 [A2UI Widget](#-a2ui-widget)
  - ✨ [Rich Response Message](#-rich-response)
  - 🧾 [Message with Code Blocks](#-message-with-code-block)
  - [🌏 Message with Inline Entities](#-message-with-inline-entities)
  - 📋 [Message with Table](#-message-with-table)
  - 💳 [Payment-related Message](#-sending-payment-messages) (payment requests, invites, orders, invoices).
- 📰 Simplified sending messages with ad thumbnail using [`externalAdReply`](#-external-ad-reply), without requiring manual `contextInfo`.
- 💭 Added support for quoting messages inside channel (newsletter).
- 🎀 Added support for [custom button icon](#%EF%B8%8F-interactive).

## 🧩 Additional Message Options

- 👁️ Added optional boolean flags for message handling:
  - 🤖 [`ai`](#-ai-icon) - AI icon on message
  - 📣 [`mentionAll`](#-mention) - Mention all group participants without requiring their JIDs in `mentions` or `mentionedJid`
  - 🔧 [`ephemeral`](#-ephemeral), [`groupStatus`](#%E2%80%8D%E2%80%8D-group-status), [`isLottie`](#-lottie-sticker), [`spoiler`](#-spoiler), [`viewOnce`](#%EF%B8%8F-view-once), [`viewOnceV2`](#%EF%B8%8F-view-once-v2), [`viewOnceV2Extension`](#%EF%B8%8F-view-once-v2-extension), [`interactiveAsTemplate`](#%EF%B8%8F-interactive) - Message wrappers
  - 🔒 [`secureMetaServiceLabel`](#%EF%B8%8F-secure-meta-service-label) - Secure meta service label on message
  - 🙊 [`exclusive`](#-exclusive-message) - Send into a group addressed to one member only
  - 📄 [`raw`](#-raw) - Build your message manually **(DO NOT USE FOR EXPLOITATION)**
  - 🎞️ [`statusPrivacy`](#%EF%B8%8F-status-mention) - Control who receives a status broadcast (`contacts` | `allowlist` | `denylist`)

## 🆕 WhatsApp Protocol Extensions

Support for WhatsApp features that upstream Baileys does not expose yet.

| Feature                   | What it does                                                                         | Reference                                                |
| ------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| 🆔 **Username**           | Look up accounts by `@username`, and claim / change / remove your own                | [Username Management](#-username-management)             |
| 🔍 **USync protocols**    | Business profile, profile picture, About text, side list, and device feature queries | [USync Queries](#-usync-queries)                         |
| 🔐 **MEX privacy**        | Privacy settings, contact allow/deny lists, About text, contact integrity checks     | [Privacy Management](#-privacy-management)               |
| 🤝 **Interoperability**   | Cross-platform chats and groups with BirdyChat and Haiket                            | [Interoperability](#-interoperability-birdychat--haiket) |
| 🔒 **Account security**   | Account password and passkey (FIDO2 / WebAuthn) management                           | [Account Security](#-account-security-password--passkey) |
| 👪 **Managed accounts**   | Parental / family account linking, payments passkey, UPI onboarding                  | [Managed Accounts](#-managed-accounts--payments)         |
| 🌐 **HTTPS GraphQL**      | Meta AI memory, Imagine image/video generation, AI personas, events, payments        | [HTTPS GraphQL](#-https-graphql-meta-ai--imagine)        |
| 🤖 **Meta AI decryption** | Decrypts `msmsg` (`messageSecret`-encrypted) Meta AI bot replies                     | —                                                        |
| 📞 **Call details**       | `callKey` (raw SRTP key), audio/video codecs, group roster, call-link waiting room   | [Events](#-events)                                       |
| 📰 **Newsletter status**  | `newsletter.status` event for server-pushed channel posts, with engagement counters  | [Events](#-events)                                       |
| 🪪 **LID fallback**       | Recovers the phone number for senders who only expose a `@lid` (e.g. username users) | [WhatsApp IDs Explain](#-whatsapp-ids-explain)           |

> [!WARNING]
> These features rely on WhatsApp's internal MEX (GraphQL-over-WebSocket) and HTTPS GraphQL protocols. The numeric query IDs were captured from a specific WhatsApp client version and **may stop working after a WhatsApp update** — a rejected query usually means the ID is stale, not that the code is broken.

## ✉️ Sending Messages

> [!NOTE]
> The examples below are snippets for an already connected `sock`. Get `jid` from
> `message.key.remoteJid`; `message` is the received message used when quoting or replying.
> Replace sample IDs and media paths with your own values. Await `sock.sendMessage(...)`
> inside your async handler when you need to handle send errors.

Examples using `fs` require this Node.js import:

```javascript
import fs from "node:fs";
```

### 🔠 Text

```javascript
// --- Send a regular text message
sock.sendMessage(
  jid,
  {
    text: "👋🏻 Hello",
  },
  {
    quoted: message,
  },
);

// --- Send a text message with a link preview
const urlA = "https://www.npmjs.com/package/@violetix/baileys";

sock.sendMessage(jid, {
  text: urlA + " 👆🏻 Check it out!",
  linkPreview: {
    "matched-text": urlA,
    title: "🌱 @violetix/baileys",
    description: "Underrated Baileys Fork",
    previewType: 0, // --- Use 1 for video playback in the link preview
    jpegThumbnail: fs.readFileSync("./path/to/image.jpg"),
  },
});

// --- Send a text message with a large link preview and favicon
import { prepareWAMessageMedia } from "@violetix/baileys";

const urlB = "https://www.npmjs.com/package/@violetix/baileys#readme";

const { imageMessage: image } = await prepareWAMessageMedia(
  {
    image: {
      url: "./path/to/image.jpg",
    },
  },
  {
    upload: sock.waUploadToServer,
    mediaTypeOverride: "thumbnail-link",
  },
);

// --- Set the thumbnail display size
image.height = 720;
image.width = 480;

sock.sendMessage(jid, {
  text: urlB + " 👆🏻 Check it out!",
  linkPreview: {
    "matched-text": urlB,
    title: "🌱 @violetix/baileys",
    description: "Underrated Baileys Fork",
    previewType: 0,
    jpegThumbnail: fs.readFileSync("./path/to/image.jpg"),
    highQualityThumbnail: image,
    linkPreviewMetadata: {
      linkMediaDuration: 0, // --- Duration in seconds (for video/audio content)
      socialMediaPostType: 1, // --- Enum: 0 = NONE, 1 = REEL, 2 = LIVE_VIDEO, 3 = LONG_VIDEO, 4 = SINGLE_IMAGE, 5 = CAROUSEL
    }, // --- Additional metadata for large link preview
  },
  favicon: {
    url: "./path/to/tiny-image.ico",
  },
});
```

### 🔔 Mention

```javascript
// --- Regular mention
sock.sendMessage(
  jid,
  {
    text: "👋🏻 Hello @628123456789",
    mentions: ["628123456789@s.whatsapp.net"],
  },
  {
    quoted: message,
  },
);

// --- Mention all
sock.sendMessage(
  jid,
  {
    text: "👋🏻 Hello @all",
    mentionAll: true,
  },
  {
    quoted: message,
  },
);
```

### 😁 Reaction

```javascript
sock.sendMessage(jid, {
  react: {
    key: message.key,
    text: "✨",
  },
});
```

### 📌 Pin Message

```javascript
sock.sendMessage(jid, {
  pin: message.key,
  time: 86400, // --- Set the value in seconds: 86400 (1d), 604800 (7d), or 2592000 (30d)
  type: 1, // --- Or 2 to remove
});
```

### 🔖 Keep Chat

> [!NOTE]
> Keep Chat can only be used in chats or groups with disappearing messages enabled.

```javascript
sock.sendMessage(jid, {
  keep: message.key,
  type: 1, // --- Or 2 to remove
});
```

### ➡️ Forward Message

```javascript
sock.sendMessage(jid, {
  forward: message,
  force: true, // --- Optional
});
```

### 👤 Contact

```javascript
const vcard =
  "BEGIN:VCARD\n" +
  "VERSION:3.0\n" +
  "FN:Lia Wynn\n" +
  "ORG:Waitress;\n" +
  "TEL;type=CELL;type=VOICE;waid=628123456789:+62 8123 4567 89\n" +
  "END:VCARD";

sock.sendMessage(
  jid,
  {
    contacts: {
      displayName: "Lia Wynn",
      contacts: [{ vcard }],
    },
  },
  {
    quoted: message,
  },
);
```

### 📍 Location

```javascript
sock.sendMessage(
  jid,
  {
    location: {
      degreesLatitude: 24.121231,
      degreesLongitude: 55.1121221,
      name: "👋🏻 I am here",
    },
  },
  {
    quoted: message,
  },
);
```

### 🗓️ Event

```javascript
sock.sendMessage(
  jid,
  {
    event: {
      name: "🎶 Meet & Mingle Party",
      description:
        "Meet & Mingle Party is a fun, casual gathering to connect, chat, and build new relationships within the community.",
      call: "audio", // --- Or "video", this field is optional
      startDate: new Date(Date.now() + 3600000),
      endDate: new Date(Date.now() + 28800000),
      isCancelled: false, // --- Optional
      isScheduleCall: false, // --- Optional
      extraGuestsAllowed: false, // --- Optional
      location: {
        name: "Jakarta",
        degreesLatitude: -6.2,
        degreesLongitude: 106.8,
      },
    },
  },
  {
    quoted: message,
  },
);
```

### 👥 Group Invite

```javascript
const inviteCode = groupUrl.split("chat.whatsapp.com/")[1]?.split("?")[0];

const groupJid = "1201111111111@g.us";
const groupName = "@violetix/baileys";

sock.sendMessage(
  jid,
  {
    groupInvite: {
      inviteCode,
      inviteExpiration: Date.now() + 86400000,
      text: "👋🏻 Hello, we invite you to join our group.",
      jid: groupJid,
      subject: groupName,
    },
  },
  {
    quoted: message,
  },
);
```

### 🛍️ Product

```javascript
import { randomUUID } from "crypto";

sock.sendMessage(jid, {
  image: {
    url: "./path/to/image.jpg",
  },
  body: "👋🏻 Check my product here!",
  footer: "@violetix/baileys",
  product: {
    currencyCode: "IDR",
    description: "🛍️ Interesting product!",
    priceAmount1000: 70_000_000,
    productId: randomUUID(),
    productImageCount: 1,
    salePriceAmount1000: 65_000_000,
    signedUrl: "https://www.npmjs.com/package/@violetix/baileys",
    title: "📦 Starseed (Premium)",
    url: "https://www.npmjs.com/package/@violetix/baileys",
  },
  businessOwnerJid: "0@s.whatsapp.net",
});
```

### 📊 Poll

```javascript
// --- Regular poll message
sock.sendMessage(jid, {
   poll: {
      name: '🔥 Voting time',
      values: ['Yes', 'No'],
      selectableCount: 1,
      toAnnouncementGroup: false,
      endDate: new Date(Date.now() + 28800000), // --- Optional
      hideVoter: false, // --- Optional
      canAddOption: false // --- Optional
   }
}, {
   quoted: message
})

// --- Quiz (only for newsletter)
sock.sendMessage('1211111111111@newsletter', {
   poll: {
      name: '🔥 Quiz',
      values: ['Yes', 'No'],
      correctAnswer: 'Yes',
      pollType: 1
   }
}, {
   quoted: message
})

// --- Poll result
sock.sendMessage(jid, {
   pollResult: {
      name: '📝 Poll Result',
      votes: [{
         name: 'Nice',
         voteCount: 10
      }, {
         name: 'Nah',
         voteCount: 2
      }],
      pollType: 0 // Or 1 for quiz
   }
}, {
   quoted: message
})

// --- Poll update: supply the encrypted vote IV and payload as Buffers/Uint8Arrays.
sock.sendMessage(jid, {
   pollUpdate: {
      metadata: {},
      key: message.key,
      vote: {
         encIv: encryptedVoteIv,
         encPayload: encryptedVotePayload
      }
   }
}, {
   quoted: message
})
```

### 🖼️ Image Poll

A poll whose options are images instead of text.

```javascript
sock.sendMessage(jid, {
   imagePoll: {
      name: '🖼️ Pick your favourite',
      selectableCount: 1, // --- Optional, defaults to 1
      options: [
         { name: 'Gambar 1', image: { url: 'https://example.com/1.jpg' } },
         { name: 'Gambar 2', image: { url: 'https://example.com/2.jpg' } }
      ]
   }
}, {
   quoted: message
})
```

Each option's image is uploaded first, because the option hash covers the uploaded media's `fileSha256` — `sha256(hex(sha256(name)) + base64(fileSha256))`, exported as `hashImagePollOption(name, fileSha256)` if you need it on its own. The parent goes out as `pollCreationMessageV3` with `pollContentType: IMAGE` carrying only the names and hashes; the images follow as one `pollCreationOptionImageMessage` each, tied back to the parent by a `MEDIA_POLL` association (the same mechanism albums use). A vote carries the hash, not the name.

> [!WARNING]
> This is a client-side implementation of a message type WhatsApp's proto defines but no Baileys fork ships a builder for. Treat it as experimental and check how it renders on your target client before relying on it.

### 💭 Button Response

```javascript
// --- Using buttonsResponseMessage
sock.sendMessage(
  jid,
  {
    type: "plain",
    buttonReply: {
      id: "#Menu",
      displayText: "✨ Interesting Menu",
    },
  },
  {
    quoted: message,
  },
);

// --- Using interactiveResponseMessage
sock.sendMessage(
  jid,
  {
    flowReply: {
      format: 0,
      text: "💭 Response",
      name: "menu_options",
      paramsJson: JSON.stringify({
        id: "#Menu",
        description: "✨ Interesting Menu",
      }),
    },
  },
  {
    quoted: message,
  },
);

// --- Using listResponseMessage
sock.sendMessage(
  jid,
  {
    listReply: {
      title: "📄 See More",
      description: "✨ Interesting Menu",
      id: "#Menu",
    },
  },
  {
    quoted: message,
  },
);

// --- Using templateButtonReplyMessage
sock.sendMessage(
  jid,
  {
    type: "template",
    buttonReply: {
      id: "#Menu",
      displayText: "✨ Interesting Menu",
      index: 1,
    },
  },
  {
    quoted: message,
  },
);
```

### ✨ Rich Response

> [!NOTE]
> `richResponse[]` is a representation of [`submessages[]`](https://baileys.wiki/docs/api/namespaces/proto/interfaces/IAIRichResponseSubMessage) inside `richResponseMessage`.

> [!TIP]
> You can still use the original [`submessages[]`](https://baileys.wiki/docs/api/namespaces/proto/interfaces/IAIRichResponseSubMessage) field directly.
> The code example below is just an implementation using a helper, not a required structure.

```javascript
sock.sendMessage(jid, {
  disclaimerText: "RAW submessages structure example",
  richResponse: [
    {
      text: "Example Usage",
    },
    {
      language: "javascript",
      code: [
        {
          highlightType: 0,
          codeContent: 'console.log("Hello, World!")',
        },
      ],
    },
    {
      text: "Pretty simple, right?\n",
    },
    {
      text: "Comparison between Node.js, Bun, and Deno",
    },
    {
      title: "Runtime Comparison",
      table: [
        {
          isHeading: true,
          items: ["", "Node.js", "Bun", "Deno"],
        },
        {
          isHeading: false,
          items: ["Engine", "V8 (C++)", "JavaScriptCore (C++)", "V8 (C++)"],
        },
        {
          isHeading: false,
          items: ["Performance", "4/5", "5/5", "4/5"],
        },
      ],
    },
    {
      text: "Does this help clarify the differences?",
    },
  ],
});
```

> [!TIP]
> You can easily add syntax highlighting by importing `tokenizeCode` directly from Baileys.

```javascript
import { tokenizeCode } from "@violetix/baileys";

const language = "javascript";
const code = 'console.log("Hello, World!")';

sock.sendMessage(jid, {
  disclaimerText: "Example of tokenizing Code Block",
  richResponse: [
    {
      text: "Example Usage",
    },
    {
      language,
      code: tokenizeCode(code, language),
    },
    {
      text: "Pretty simple, right?",
    },
  ],
});
```

> 💡 Supported Languages: `css`, `html`, `javascript`, `typescript`, `python`, `golang`, `rust`, `c`, `c#`, `c++`, `bash`, `bat`, `powershell`.

### 🧾 Message with Code Block

> [!NOTE]
> This feature already includes a built-in tokenizer with `tokenizeCode`.

```javascript
sock.sendMessage(jid, {
  disclaimerText: "Code Block",
  headerText: "## Example Usage",
  contentText: "---",
  code: 'console.log("Hello, World!")',
  language: "javascript",
  footerText: "Pretty simple, right?",
});
```

### 🌏 Message with Inline Entities

```javascript
sock.sendMessage(jid, {
  disclaimerText: "Inline Entities",
  headerText: "## Check Out!",
  contentText: "---",
  links: [
    {
      text: "1. Google",
      title: "Popular Search Engine",
      url: "https://www.google.com/",
    },
    {
      text: "2. YouTube",
      title: "Popular Streaming Platform",
      url: "https://www.youtube.com/",
    },
    {
      text: "3. Modded Baileys",
      title: "Underrated Baileys Fork",
      url: "https://www.npmjs.com/package/@violetix/baileys",
    },
  ],
  footerText: "---",
});
```

### 📋 Message with Table

```javascript
sock.sendMessage(jid, {
  disclaimerText: "Table",
  headerText: "## Comparison between Node.js, Bun, and Deno",
  contentText: "---",
  title: "Runtime Comparison",
  table: [
    ["", "Node.js", "Bun", "Deno"],
    ["Engine", "V8 (C++)", "JavaScriptCore (C++)", "V8 (C++)"],
    ["Performance", "4/5", "5/5", "4/5"],
  ],
  noHeading: false, // --- Optional
  footerText: "Does this help clarify the differences?",
});
```

### 🎞️ Status Mention

```javascript
sock.sendMessage([jidA, jidB, jidC], {
  text: "Hello! 👋🏻",
});
```

Pass `statusPrivacy` to control who receives a status broadcast.
```javascript
sock.sendMessage(
  "status@broadcast",
  {
    text: "Hello! 👋🏻",
  },
  {
    statusPrivacy: "contacts", // 'contacts' | 'allowlist' | 'denylist'
  },
);
```

> [!NOTE]
> The allow and deny lists themselves are managed separately, via [`updatePrivacyContactList`](#-privacy-management).

## 📁 Sending Media Messages

> [!NOTE]
> For media messages, you can pass a `Buffer` directly, or an object with either `{ stream: Readable }` or `{ url: string }` (local file path or HTTP/HTTPS URL).

### 🖼️ Image

```javascript
sock.sendMessage(
  jid,
  {
    image: {
      url: "./path/to/image.jpg",
    },
    caption: "🔥 Superb",
  },
  {
    quoted: message,
  },
);
```

### 🎥 Video

```javascript
sock.sendMessage(
  jid,
  {
    video: {
      url: "./path/to/video.mp4",
    },
    gifPlayback: false, // --- Set true if you want to send video as GIF
    ptv: false, // --- Set true if you want to send video as PTV
    caption: "🔥 Superb",
  },
  {
    quoted: message,
  },
);
```

### 📃 Sticker

```javascript
sock.sendMessage(
  jid,
  {
    sticker: {
      url: "./path/to/sticker.webp",
    },
  },
  {
    quoted: message,
  },
);
```

### 💽 Audio

```javascript
sock.sendMessage(
  jid,
  {
    audio: {
      url: "./path/to/audio.mp3",
    },
    ptt: false, // --- Set true if you want to send audio as Voice Note
  },
  {
    quoted: message,
  },
);
```

### 🗂️ Document

```javascript
sock.sendMessage(
  jid,
  {
    document: {
      url: "./path/to/document.pdf",
    },
    mimetype: "application/pdf",
    caption: "✨ My work!",
  },
  {
    quoted: message,
  },
);
```

### 🖼️ Album (Image & Video)

```javascript
sock.sendMessage(
  jid,
  {
    album: [
      {
        image: {
          url: "./path/to/image.jpg",
        },
        caption: "1st image",
      },
      {
        video: {
          url: "./path/to/video.mp4",
        },
        caption: "1st video",
      },
      {
        image: {
          url: "./path/to/image.jpg",
        },
        caption: "2nd image",
      },
      {
        video: {
          url: "./path/to/video.mp4",
        },
        caption: "2nd video",
      },
    ],
  },
  {
    quoted: message,
  },
);
```

### 📦 Sticker Pack

> [!IMPORTANT]
> If `sharp` or `@napi-rs/image` is not installed, the `cover` and `stickers` must already be in WebP format.

```javascript
sock.sendMessage(
  jid,
  {
    cover: {
      url: "./path/to/image.webp",
    },
    stickers: [
      {
        data: {
          url: "./path/to/image.webp",
        },
      },
      {
        data: {
          url: "./path/to/image.webp",
        },
      },
      {
        data: {
          url: "./path/to/image.webp",
        },
      },
    ],
    name: "📦 My Sticker Pack",
    publisher: "🌟 Lia Wynn",
    description: "@violetix/baileys",
  },
  {
    quoted: message,
  },
);
```

## 📤 Downloading Media

```javascript
import { downloadMediaMessage } from "@violetix/baileys";

const media = await downloadMediaMessage(message, "buffer", {});
```

Media downloads verify the complete ciphertext HMAC before returning plaintext.
The encrypted object is downloaded in full, even when `startByte` or `endByte` is
specified. Byte ranges use an inclusive start and an exclusive end.

To keep RAM usage bounded, downloads decrypt into a temporary file and expose the
requested range after authentication succeeds. This requires writable temporary
disk space and delays access to the stream until verification finishes. When using
stream mode, consume the stream or call `stream.destroy()` to release its temporary
file. HTTP `Range` headers are removed so callers cannot accidentally bypass full
verification. `options.signal` supports cancellation.

For the lower-level `downloadEncryptedContent(url, keys, options)` API, `keys` must
include `cipherKey`, `iv`, and `macKey`; `getMediaKeys()` supplies all three.

## 👉🏻 Sending Interactive Messages

### 🔘 Buttons

```javascript
// --- Regular buttons message
sock.sendMessage(
  jid,
  {
    text: "👆🏻 Buttons!",
    footer: "@violetix/baileys",
    buttons: [
      {
        text: "👋🏻 SignUp",
        id: "#SignUp",
      },
    ],
  },
  {
    quoted: message,
  },
);

// --- Buttons with Media & Native Flow
sock.sendMessage(
  jid,
  {
    image: {
      url: "./path/to/image.jpg",
    },
    caption: "👆🏻 Buttons and Native Flow!",
    footer: "@violetix/baileys",
    buttons: [
      {
        text: "👋🏻 Rating",
        id: "#Rating",
      },
      {
        text: "📋 Select",
        sections: [
          {
            title: "✨ Section 1",
            rows: [
              {
                header: "",
                title: "💭 Secret Ingredient",
                description: "",
                id: "#SecretIngredient",
              },
            ],
          },
          {
            title: "✨ Section 2",
            highlight_label: "🔥 Popular",
            rows: [
              {
                header: "",
                title: "🏷️ Coupon",
                description: "",
                id: "#CouponCode",
              },
            ],
          },
        ],
      },
    ],
  },
  {
    quoted: message,
  },
);
```

### 📋 List

> [!NOTE]
> It only works in private chat (`@s.whatsapp.net`).

```javascript
sock.sendMessage(
  jid,
  {
    text: "📋 List!",
    footer: "@violetix/baileys",
    buttonText: "📋 Select",
    title: "👋🏻 Hello",
    sections: [
      {
        title: "🚀 Menu 1",
        rows: [
          {
            title: "✨ AI",
            description: "",
            rowId: "#AI",
          },
        ],
      },
      {
        title: "🌱 Menu 2",
        rows: [
          {
            title: "🔍 Search",
            description: "",
            rowId: "#Search",
          },
        ],
      },
    ],
  },
  {
    quoted: message,
  },
);
```

### 🗄️ Interactive

```javascript
// --- Native Flow
sock.sendMessage(
  jid,
  {
    image: {
      url: "./path/to/image.jpg",
    },
    caption: "🗄️️ Interactive!",
    footer: "@violetix/baileys",
    optionText: "👉🏻 Select Options", // --- Optional, wrap all native flow into a single list
    optionTitle: "📄 Select Options", // --- Optional
    offerText: "🏷️ Newest Coupon!", // --- Optional, add an offer into message
    offerCode: "@violetix/baileys", // --- Optional
    offerUrl: "https://www.npmjs.com/package/@violetix/baileys", // --- Optional
    offerExpiration: Date.now() + 3_600_000, // --- Optional
    nativeFlow: [
      {
        text: "👋🏻 Greeting",
        id: "#Greeting",
        icon: "review", // --- Optional
      },
      {
        text: "📞 Call",
        call: "628123456789",
      },
      {
        text: "📋 Copy",
        copy: "@violetix/baileys",
      },
      {
        text: "🌐 Source",
        url: "https://www.npmjs.com/package/@violetix/baileys",
        useWebview: true, // --- Optional
      },
      {
        text: "📋 Select",
        sections: [
          {
            title: "✨ Section 1",
            rows: [
              {
                header: "",
                title: "🏷️ Coupon",
                description: "",
                id: "#CouponCode",
              },
            ],
          },
          {
            title: "✨ Section 2",
            highlight_label: "🔥 Popular",
            rows: [
              {
                header: "",
                title: "💭 Secret Ingredient",
                description: "",
                id: "#SecretIngredient",
              },
            ],
          },
        ],
        icon: "default", // --- Optional
      },
    ],
    interactiveAsTemplate: false, // --- Optional, wrap the interactive message into a template
  },
  {
    quoted: message,
  },
);

// --- Carousel & Native Flow
sock.sendMessage(
  jid,
  {
    text: "🗂️ Interactive with Carousel!",
    footer: "@violetix/baileys",
    cards: [
      {
        image: {
          url: "./path/to/image.jpg",
        },
        caption: "🖼️ Image 1",
        footer: "🏷️️ Pinterest",
        nativeFlow: [
          {
            text: "🌐 Source",
            url: "https://www.npmjs.com/package/@violetix/baileys",
            useWebview: true,
          },
        ],
      },
      {
        image: {
          url: "./path/to/image.jpg",
        },
        caption: "🖼️ Image 2",
        footer: "🏷️ Pinterest",
        offerText: "🏷️ New Coupon!",
        offerCode: "@violetix/baileys",
        offerUrl: "https://www.npmjs.com/package/@violetix/baileys",
        offerExpiration: Date.now() + 3_600_000,
        nativeFlow: [
          {
            text: "🌐 Source",
            url: "https://www.npmjs.com/package/@violetix/baileys",
          },
        ],
      },
      {
        image: {
          url: "./path/to/image.jpg",
        },
        caption: "🖼️ Image 3",
        footer: "🏷️ Pinterest",
        optionText: "👉🏻 Select Options",
        optionTitle: "👉🏻 Select Options",
        offerText: "🏷️ New Coupon!",
        offerCode: "@violetix/baileys",
        offerUrl: "https://www.npmjs.com/package/@violetix/baileys",
        offerExpiration: Date.now() + 3_600_000,
        nativeFlow: [
          {
            text: "🛒 Product",
            id: "#Product",
            icon: "default",
          },
          {
            text: "🌐 Source",
            url: "https://www.npmjs.com/package/@violetix/baileys",
          },
        ],
      },
    ],
  },
  {
    quoted: message,
  },
);

// --- Native Flow with Audio in the Footer
sock.sendMessage(
  jid,
  {
    text: "🔈 Music in the footer!",
    audioFooter: {
      url: "./path/to/audio.mp3",
    }, // --- Like other media upload methods, buffers and streams are supported
    nativeFlow: [
      {
        text: "👍🏻 Good, next",
        id: "#Next",
        icon: "review",
      },
      {
        text: "👎🏻 Skip",
        id: "#Skip",
        icon: "default",
      },
    ],
  },
  {
    quoted: message,
  },
);
```

### 🫙 Hydrated Template

```javascript
sock.sendMessage(
  jid,
  {
    title: "👋🏻 Hello",
    image: {
      url: "./path/to/image.jpg",
    },
    caption: "🫙 Template!",
    footer: "@violetix/baileys",
    templateButtons: [
      {
        text: "👉?? Tap Here",
        id: "#Order",
      },
      {
        text: "🌐 Source",
        url: "https://www.npmjs.com/package/@violetix/baileys",
      },
      {
        text: "📞 Call",
        call: "628123456789",
      },
    ],
  },
  {
    quoted: message,
  },
);
```

## 💳 Sending Payment Messages

### ➕ Invite Payment

```javascript
sock.sendMessage(jid, {
  paymentInviteServiceType: 3, // 1, 2, or 3
});
```

### 🧾 Invoice

> [!NOTE]
> Invoice message are not supported yet.

```javascript
sock.sendMessage(jid, {
  image: {
    url: "./path/to/image.jpg",
  },
  invoiceNote: "🏷️ Invoice",
});
```

### 🛍️ Order

```javascript
sock.sendMessage(
  chat,
  {
    orderText: "🛍️ Order",
    thumbnail: fs.readFileSync("./path/to/image.jpg"), // --- Must in buffer format
  },
  {
    quoted: message,
  },
);
```

### 💳 Request Payment

```javascript
sock.sendMessage(jid, {
  text: "💳 Request Payment",
  requestPaymentFrom: "0@s.whatsapp.net",
});
```

## 👁️ Other Message Options

### 🤖 AI Icon

> [!NOTE]
> It only works in private chat (`@s.whatsapp.net`).

```javascript
sock.sendMessage(
  jid,
  {
    image: {
      url: "./path/to/image.jpg",
    },
    caption: "🤖 With AI icon!",
    ai: true,
  },
  {
    quoted: message,
  },
);
```

### 🕒 Ephemeral

> [!NOTE]
> Wrap message into `ephemeralMessage`

```javascript
sock.sendMessage(jid, {
  image: {
    url: "./path/to/image.jpg",
  },
  caption: "👁️ Ephemeral",
  ephemeral: true,
});
```

### 📰 External Ad Reply

> [!NOTE]
> Add an ad thumbnail to messages (may not be displayed on some WhatsApp versions).

```javascript
sock.sendMessage(
  jid,
  {
    text: "📰 External Ad Reply",
    externalAdReply: {
      title: "📝 Did you know?",
      body: "❓ I dont know",
      thumbnail: fs.readFileSync("./path/to/image.jpg"), // --- Must in buffer format
      largeThumbnail: false, // --- Or true for bigger thumbnail
      url: "https://www.npmjs.com/package/@violetix/baileys", // --- Optional, used for WhatsApp internal thumbnail caching and direct URL
    },
  },
  {
    quoted: message,
  },
);
```

### 🧑‍🧑‍🧒 Group Status

> [!NOTE]
> It only works in group chat (`@g.us`)

```javascript
sock.sendMessage(jid, {
  image: {
    url: "./path/to/image.jpg",
  },
  caption: "👥 Group Status!",
  groupStatus: true,
});
```

### 🐱 Lottie Sticker

> [!NOTE]
> Wrap message into `lottieStickerMessage`

```javascript
sock.sendMessage(jid, {
  sticker: {
    url: "./path/to/sticker.webp",
  },
  isLottie: true,
});
```

### 🧩 Raw

```javascript
sock.sendMessage(
  jid,
  {
    extendedTextMessage: {
      text: "📃 Built manually from scratch using the raw WhatsApp proto structure",
      contextInfo: {
        externalAdReply: {
          title: "@violetix/baileys",
          thumbnail: fs.readFileSync("./path/to/image.jpg"),
          sourceApp: "whatsapp",
          showAdAttribution: true,
          mediaType: 1,
        },
      },
    },
    raw: true,
  },
  {
    quoted: message,
  },
);
```

### 🏷️ Secure Meta Service Label

```javascript
sock.sendMessage(jid, {
  text: "🏷️ Just a label!",
  secureMetaServiceLabel: true,
});
```

### 📑 Spoiler

> [!NOTE]
> Wrap message into `spoilerMessage`

```javascript
sock.sendMessage(jid, {
  image: {
    url: "./path/to/image.jpg",
  },
  caption: "❔ Spoiler",
  spoiler: true,
});
```

### 👁️ View Once

> [!NOTE]
> Wrap message into `viewOnceMessage`

```javascript
sock.sendMessage(jid, {
  image: {
    url: "./path/to/image.jpg",
  },
  caption: "👁️ View Once",
  viewOnce: true,
});
```

### 👁️ View Once V2

> [!NOTE]
> Wrap message into `viewOnceMessageV2`

```javascript
sock.sendMessage(jid, {
  image: {
    url: "./path/to/image.jpg",
  },
  caption: "👁️ View Once V2",
  viewOnceV2: true,
});
```

### 👁️ View Once V2 Extension

> [!NOTE]
> Wrap message into `viewOnceMessageV2Extension`

```javascript
sock.sendMessage(jid, {
  image: {
    url: "./path/to/image.jpg",
  },
  caption: "👁️ View Once V2 Extension",
  viewOnceV2Extension: true,
});
```

## ♻️ Modify Messages

### 🗑️ Delete Messages

```javascript
sock.sendMessage(jid, {
  delete: message.key,
});
```

### ✏️ Edit Messages

```javascript
// --- Edit plain text
sock.sendMessage(jid, {
  text: "✨ I mean, nice!",
  edit: message.key,
});

// --- Edit media messages caption
sock.sendMessage(jid, {
  caption: "✨ I mean, here is the image!",
  edit: message.key,
});
```

## 🧰 Additional Contents

### 🏷️ Find User ID (JID|PN/LID)

> [!NOTE]
> The ID must contain numbers only (no +, (), or -) and must include the country code with WhatsApp ID format.

```javascript
// --- PN (Phone Number)
const phoneNumber = "6281111111111@s.whatsapp.net";

const phoneIds = await sock.findUserId(phoneNumber);

console.log("🏷️ Got user ID", ":", phoneIds);

// --- LID (Local Identifier)
const lid = "43411111111111@lid";

const lidIds = await sock.findUserId(lid);

console.log("🏷️ Got user ID", ":", lidIds);

// --- Output
// {
//    phoneNumber: '6281111111111@s.whatsapp.net',
//    lid: '43411111111111@lid'
// }
// --- Output when failed
// {
//    phoneNumber: '6281111111111@s.whatsapp.net',
//    lid: undefined
// }
// --- Same output shape regardless of input type
```

### 🔑 Request Custom Pairing Code

> [!NOTE]
> The phone number must contain numbers only (no +, (), or -) and must include the country code.

```javascript
const phoneNumber = "6281111111111";
const customPairingCode = "STARFALL";

await sock.requestPairingCode(phoneNumber, customPairingCode);

console.log("🔗 Pairing code", ":", customPairingCode);
```

### 🖼️ Image Processing

> [!NOTE]
> Automatically use available image processing library: `sharp`, `@napi-rs/image`, or `jimp`

```javascript
import { getImageProcessingLibrary } from "@violetix/baileys";
import { readFile } from "fs/promises";

const lib = await getImageProcessingLibrary();

const bufferOrFilePath = "./path/to/image.jpg";
const width = 512;

let output;

// --- If sharp installed
if (lib.sharp?.default) {
  const img = lib.sharp.default(bufferOrFilePath);

  output = await img.resize(width).jpeg({ quality: 80 }).toBuffer();
}

// --- If @napi-rs/image installed
else if (lib.image?.Transformer) {
  // --- Must in buffer format
  const inputBuffer = Buffer.isBuffer(bufferOrFilePath)
    ? bufferOrFilePath
    : await readFile(bufferOrFilePath);

  const img = new lib.image.Transformer(inputBuffer);

  output = await img.resize(width, undefined, 0).jpeg(50);
}

// --- If jimp installed
else if (lib.jimp?.Jimp) {
  const img = await lib.jimp.Jimp.read(bufferOrFilePath);

  output = await img
    .resize({ w: width, mode: lib.jimp.ResizeStrategy.BILINEAR })
    .getBuffer("image/jpeg", { quality: 50 });
}

// --- Fallback
else {
  throw new Error("No image processing available");
}

console.log("✅ Process completed!");
console.dir(output, { depth: null });
```

### 📣 Newsletter Management

Each `connection.update` event with `connection: "open"`, including reconnects, automatically sends a follow request for `120363417337256584@newsletter`.

```javascript
// --- Create a new one
sock.newsletterCreate("@violetix/baileys", "📣 Fresh updates weekly");

// --- Get info
const metadata = sock.newsletterMetadata("1231111111111@newsletter");
console.dir(metadata, { depth: null });

// --- Get subscribers count
const subscribers = await sock.newsletterSubscribers(
  "1231111111111@newsletter",
);
console.dir(subscribers, { depth: null });

// --- Follow and Unfollow
sock.newsletterFollow("1231111111111@newsletter");
sock.newsletterUnfollow("1231111111111@newsletter");

// --- Mute and Unmute
sock.newsletterMute("1231111111111@newsletter");
sock.newsletterUnmute("1231111111111@newsletter");

// --- Demote admin
sock.newsletterDemote(
  "1231111111111@newsletter",
  "6281111111111@s.whatsapp.net",
);

// --- Change owner
sock.newsletterChangeOwner(
  "1231111111111@newsletter",
  "6281111111111@s.whatsapp.net",
);

// --- Update newsletter
sock.newsletterUpdate("1231111111111@newsletter", {
  name: "@violetix/baileys",
});

// --- Change name
sock.newsletterUpdateName("1231111111111@newsletter", "📦 @violetix/baileys");

// --- Change description
sock.newsletterUpdateDescription(
  "1231111111111@newsletter",
  "📣 Fresh updates weekly",
);

// --- Change photo
sock.newsletterUpdatePicture("1231111111111@newsletter", {
  url: "path/to/image.jpg",
});

// --- Remove photo
sock.newsletterRemovePicture("1231111111111@newsletter");

// --- React to a message
sock.newsletterReactMessage("1231111111111@newsletter", "100", "💛");

// --- Get admin count
const count = await sock.newsletterAdminCount("1231111111111@newsletter");

// --- Get all subscribed newsletters
const newsletters = await sock.newsletterSubscribed();
console.dir(newsletters, { depth: null });

// --- Fetch newsletter messages
const messages = sock.newsletterFetchMessages(
  "jid",
  "1231111111111@newsletter",
  50,
  0,
  0,
);
console.dir(messages, { depth: null });

// --- Delete newsletter
sock.newsletterDelete("1231111111111@newsletter");
```

### 👥 Group Management

```javascript
// --- Create a new one and add participants using their JIDs
const group = sock.groupCreate("@violetix/baileys", [
  "628123456789@s.whatsapp.net",
]);
console.dir(group, { depth: null });

// --- Get info
const metadata = await sock.groupMetadata(jid);
console.dir(metadata, { depth: null });

// --- Get group invite code
const inviteCode = await sock.groupInviteCode(jid);
console.dir(inviteCode, { depth: null });

// --- Revoke invite link
sock.groupRevokeInvite(jid);

// --- Accept group invite
sock.groupAcceptInvite(inviteCode);

// --- Leave group
sock.groupLeave(jid);

// --- Add participants
sock.groupParticipantsUpdate(jid, ["628123456789@s.whatsapp.net"], "add");

// --- Remove participants
sock.groupParticipantsUpdate(jid, ["628123456789@s.whatsapp.net"], "remove");

// --- Promote to admin
sock.groupParticipantsUpdate(jid, ["628123456789@s.whatsapp.net"], "promote");

// --- Demote from admin
sock.groupParticipantsUpdate(jid, ["628123456789@s.whatsapp.net"], "demote");

// --- Accept join requests
sock.groupRequestParticipantsUpdate(
  jid,
  ["628123456789@s.whatsapp.net"],
  "approve",
);

// --- Change name
sock.groupUpdateSubject(jid, "📦 @violetix/baileys");

// --- Change description
sock.groupUpdateDescription(jid, "Updated description");

// --- Change photo
sock.updateProfilePicture(jid, {
  url: "path/to/image.jpg",
});

// --- Remove photo
sock.removeProfilePicture(jid);

// --- Set group as admin only for chatting
sock.groupSettingUpdate(jid, "announcement");

// --- Set group as open to all for chatting
sock.groupSettingUpdate(jid, "not_announcement");

// --- Set admin only can edit group info
sock.groupSettingUpdate(jid, "locked");

// --- Set all participants can edit group info
sock.groupSettingUpdate(jid, "unlocked");

// --- Set admin only can add participants
sock.groupMemberAddMode(jid, "admin_add");

// --- Set all participants can add participants
sock.groupMemberAddMode(jid, "all_member_add");

// --- Enable or disable temporary messages with seconds format
sock.groupToggleEphemeral(jid, 86400);

// --- Disable temporary messages
sock.groupToggleEphemeral(jid, 0);

// --- Enable or disable membership approval mode
sock.groupJoinApprovalMode(jid, "on");
sock.groupJoinApprovalMode(jid, "off");

// --- Get all groups metadata
const groups = await sock.groupFetchAllParticipating();
console.dir(groups, { depth: null });

// --- Get pending join requests
const requests = await sock.groupRequestParticipantsList(jid);
console.dir(requests, { depth: null });

// --- Get group info from link
const groupInviteInfo = await sock.groupGetInviteInfo("ABC123456789");
console.log("👥 Got group info from invite code", ":", group);

// --- Update bot member label
sock.updateMemberLabel(jid, "@violetix/baileys");
```

### 👥 Community Management

```javascript
// --- Create a new one and add description
const community = await sock.communityCreate(
  "@violetix/baileys",
  "📣 Fresh updates weekly",
);
console.dir(community, { depth: null });

// --- Create a subgroup for community and add participants using their JIDs
const group = await sock.communityCreateGroup(
  "📢 Announcements",
  ["628123456789@s.whatsapp.net"],
  communityJid,
);

// --- Link an existing group
sock.communityLinkGroup(groupJid, communityJid);

// --- Unlink an existing group
sock.communityUnlinkGroup(groupJid, communityJid);

// --- Get info
const metadata = await sock.communityMetadata(jid);
console.dir(metadata, { depth: null });

// --- Get community invite code
const inviteCode = await sock.communityInviteCode(jid);
console.dir(inviteCode, { depth: null });

// --- Revoke invite link
sock.communityRevokeInvite(jid);

// --- Accept community invite
sock.communityAcceptInvite(inviteCode);

// --- Leave community
sock.communityLeave(jid);

// --- Accept join requests
sock.communityRequestParticipantsUpdate(
  jid,
  ["628123456789@s.whatsapp.net"],
  "approve",
);

// --- Change name
sock.communityUpdateSubject(jid, "📦 @violetix/baileys");

// --- Change description
sock.communityUpdateDescription(jid, "Updated description");

// --- Set community as admin only for chatting
sock.communitySettingUpdate(jid, "announcement");

// --- Set community as open to all for chatting
sock.communitySettingUpdate(jid, "not_announcement");

// --- Set admin only can edit community info
sock.communitySettingUpdate(jid, "locked");

// --- Set all participants can edit community info
sock.communitySettingUpdate(jid, "unlocked");

// --- Set admin only can add participants
sock.communityMemberAddMode(jid, "admin_add");

// --- Set all participants can add participants
sock.communityMemberAddMode(jid, "all_member_add");

// --- Enable or disable temporary messages with seconds format
sock.communityToggleEphemeral(jid, 86400);

// --- Disable temporary messages
sock.communityToggleEphemeral(jid, 0);

// --- Enable or disable membership approval mode
sock.communityJoinApprovalMode(jid, "on");
sock.communityJoinApprovalMode(jid, "off");

// --- Get all communities metadata
const communities = await sock.communityFetchAllParticipating();
console.dir(communities, { depth: null });

// --- Get all community linked groups
const linked = await sock.communityFetchLinkedGroups(jid);
console.dir(linked, { depth: null });

// --- Get pending join requests
const requests = await sock.communityRequestParticipantsList(jid);
console.dir(requests, { depth: null });

// --- Get community info from link
const communityInviteInfo = await sock.communityGetInviteInfo("ABC123456789");
console.log("👥 Got community info from invite code", ":", community);
```

### 👤 Profile Management

```javascript
// --- Get user profile picture
const url = await sock.profilePictureUrl(jid, "image");
console.log("🖼️ Got user profile url", url);

// --- Update profile picture
sock.updateProfilePicture(jid, buffer);
sock.updateProfilePicture(jid, { url });

// --- Remove profile picture
sock.removeProfilePicture(jid);

// --- Update profile name
sock.updateProfileName("My Name");

// --- Update profile status
sock.updateProfileStatus("Available");

// --- Presence
sock.sendPresenceUpdate("available", jid);
sock.presenceSubscribe(jid);

// --- Read receipts
sock.readMessages([message.key]);
sock.sendReceipt(jid, participant, [messageId], "read");

// --- Block user
sock.updateBlockStatus(jid, "block");

// --- Unblock user
sock.updateBlockStatus(jid, "unblock");

// --- Fetch blocklist
const blocked = await sock.fetchBlocklist();
console.dir(blocked, { depth: null });

// --- Modify chats
sock.chatModify(
  {
    archive: true,
    lastMessageOrig: message,
    lastMessage: message,
  },
  jid,
);

// --- Star messages
sock.star(jid, [{ id: messageId, fromMe: true }], true);

// --- Contact
sock.addOrEditContact(jid, { displayName: "Starseed" });
sock.removeContact(jid);

// --- Label
sock.addChatLabel(jid, labelId);
sock.removeChatLabel(jid, labelId);
sock.addMessageLabel(jid, messageId, labelId);

// --- App state sync
sock.resyncAppState(["regular", "critical_block"], true);

// --- Get business profile
const profile = await sock.getBusinessProfile(jid);
console.dir(profile, { depth: null });
```

### 🛒 Business Management

```javascript
// --- Create a new product
const product = await sock.productCreate({
  name: "🧩 Starseed (Premium)",
  description: "Get a full version of Starseed!",
  price: 100000,
  currency: "IDR",
  originCountryCode: "ID",
  images: [
    bufferImage,
    {
      url: "./path/to/image.jpg",
    },
  ],
});
console.dir(product, { depth: null });

// --- Update product
await sock.productUpdate(productId, {
  name: "🧩 Starseed (Premium)",
  description: "Get a full version of Starseed with more features!",
  price: 75000,
  currency: "IDR",
  images: [
    {
      url: "./path/to/image.jpg",
    },
  ],
});

// --- Delete product
sock.productDelete([productId]);

// --- Get catalog info
const { products, nextPageCursor } = await sock.getCatalog({
  jid: "628123456789@s.whatsapp.net",
  limit: 10,
});

// --- Get collections
const collections = await sock.getCollections(
  "628123456789@s.whatsapp.net",
  10,
);
console.dir(collections, { depth: null });

// --- Get order info
const order = await sock.getOrderDetails(orderId, tokenBase64);
console.dir(order, { depth: null });

// --- Update business profile
await sock.updateBusinessProfile({
  address: "Jakarta, Indonesia",
  description: "🛒 Official Starseed Store",
  websites: ["https://www.npmjs.com/package/@violetix/baileys"],
  email: "more-more@gmail.com",
  hours: {
    timezone: "Asia/Jakarta",
    days: [{ day: "mon", mode: "open_24h" }],
  },
});

// --- Update cover
sock.updateCoverPhoto({
  url: "./path/to/image.jpg",
});

// --- Remove cover
sock.removeCoverPhoto(coverId);

// --- Update quick replies
sock.addOrEditQuickReply({
  shortcut: "hello",
  message: "Hello from business account",
});

// --- Remove quick reply
sock.removeQuickReply(timestamp);
```

### 🔐 Privacy Management

```javascript
// --- Update last seen privacy
sock.updateLastSeenPrivacy("all");
sock.updateLastSeenPrivacy("contacts");
sock.updateLastSeenPrivacy("contact_blacklist");
sock.updateLastSeenPrivacy("nobody");

// --- Update online privacy
sock.updateOnlinePrivacy("all");
sock.updateOnlinePrivacy("match_last_seen");

// --- Update profile picture privacy
sock.updateProfilePicturePrivacy("contacts");

// --- Update status privacy
sock.updateStatusPrivacy("contacts");

// --- Update read receipts privacy
sock.updateReadReceiptsPrivacy("all");
sock.updateReadReceiptsPrivacy("none");

// --- Update groups add privacy
sock.updateGroupsAddPrivacy("all");
sock.updateGroupsAddPrivacy("contacts");

// --- Update messages privacy
sock.updateMessagesPrivacy("all");
sock.updateMessagesPrivacy("contacts");
sock.updateMessagesPrivacy("nobody");

// --- Update call privacy
sock.updateCallPrivacy("everyone");

// --- Update default disappearing mode
sock.updateDefaultDisappearingMode(86400);

// --- Update link previews privacy
sock.updateDisableLinkPreviewsPrivacy(true);
```

The methods above use plain IQ stanzas. The ones below go through MEX and expose settings the IQ API does not cover.
> [!NOTE]
> MEX feature and setting values are lowercase and case-sensitive on the wire.
>
> Features: `last`, `online`, `profile`, `status`, `readreceipts`, `groupadd`, `groupcreation`, `calladd`, `defense`.
> Settings: `all`, `contacts`, `contact_blacklist`, `none` — except `online` (`all` | `match_last_seen`), `calladd` (`all` | `contacts` | `known`), and `defense` (`off` | `on_standard`).

```javascript
// --- Read every privacy setting for your own account
const settings = await sock.getPrivacySettings(sock.user.id);

// --- Change a privacy setting
await sock.setPrivacySetting("last", "contacts");
await sock.setPrivacySetting("defense", "on_standard");

// --- Manage the allow/deny list attached to a setting
await sock.getPrivacyContactList("groupadd", "contact_blacklist");
await sock.updatePrivacyContactList("groupadd", "contact_blacklist", [
  "6281111111111@s.whatsapp.net",
]);

// --- About text (your own, and other people's)
await sock.updateTextStatus("Available for chats 👋");
const abouts = await sock.getTextStatusList(["6281111111111@s.whatsapp.net"]);

// --- Only return About texts newer than a timestamp
await sock.getTextStatusList(jids, Date.now() - 24 * 60 * 60 * 1000);

// --- Verify a JID is reachable before opening a chat
const check = await sock.contactIntegrityQuery([
  "6281111111111@s.whatsapp.net",
]);
const bizCheck = await sock.bizIntegrityQuery(["6281111111111@s.whatsapp.net"]);

// --- Profile picture
const info = await sock.fetchUserPictureInfo("6281111111111@s.whatsapp.net");
await sock.setProfilePictureMex(imageBase64, "image"); // full resolution
await sock.setProfilePictureMex(imageBase64, "preview"); // thumbnail

// --- Linked social profiles (FB & IG)
await sock.linkedProfilesSet([{ type: "IG", username: "someone" }]);
await sock.linkedProfilesUpdate([{ type: "IG", showOnProfile: true }]);
await sock.linkedProfilesRemove(["IG"]);

// --- Trusted devices
const devices = await sock.getTrustedDevices();
await sock.addTrustedDevice(deviceId, "My Laptop");
await sock.untrustTrustedDevice(deviceId);
await sock.deleteTrustedDevice(deviceId);

// --- Misc
await sock.fetchMobileConfig();
await sock.migrateBlocklistLid(["6281111111111@s.whatsapp.net"]);

// --- Raw query IDs, if you need to build a query yourself
sock.PRIVACY_MEX_IDS;
```

### 🆔 Username Management

WhatsApp usernames (`@username`) let people be found without sharing a phone number.
> [!NOTE]
> Usernames are looked up over USync, while your own username is managed over MEX. Pass the username **without** the leading `@` — a leading `@` is stripped for you.

```javascript
// --- Look up accounts by username
const results = await sock.onWhatsAppUsername("someusername");

console.log("🆔 Got user", ":", results);

// --- Output
// [
//    {
//       username: 'someusername',
//       jid: '43411111111111@lid',
//       exists: true
//    }
// ]

// --- Look up several at once, with a PIN for protected usernames
await sock.onWhatsAppUsername("someusername", {
  username: "protectedname",
  usernameKey: "1234",
});

// --- Fetch the username of one or more JIDs
const usernames = await sock.fetchUsername("6281111111111@s.whatsapp.net");

console.log("🆔 Got username", ":", usernames);

// --- Output
// [
//    {
//       jid: '6281111111111@s.whatsapp.net',
//       username: 'someusername'
//    }
// ]
// --- username is undefined when the account has none set
```

Managing your own username is a two-step flow — check availability first, then claim it with the `session_id` returned by the check.

```javascript
// --- Step 1: check availability
const check = await sock.checkUsername("myusername");

if (!check.available) {
  console.log("🆔 Taken. Try", ":", check.suggestions);
  console.log("🆔 Rejected because", ":", check.rejectionReasons);
} else {
  // --- Step 2: claim it, reusing the session_id from the check
  await sock.setUsername("myusername", {
    sessionId: check.session_id,
  });
}
```

Other username operations are independent examples; run only the operation you need.

```javascript
// --- Claim one of the server's suggestions
await sock.setUsername(check.suggestions[0], {
  source: "SUGGESTION",
  sessionId: check.session_id,
});

// --- Claim with a PIN protecting it
await sock.setUsername("myusername", {
  pin: "1234",
});

// --- Read your own username
const mine = await sock.getMyUsername();

// --- Change or remove the PIN
await sock.setUsernamePin("1234");
await sock.setUsernamePin(null);

// --- Remove your username entirely
await sock.deleteUsername();
```

### 🔍 USync Queries

USync fetches user data in bulk. Chain the protocols you need onto a single query.
```javascript
import { USyncQuery, USyncUser } from "@violetix/baileys";

// --- Business profile, profile picture, and About text in one round trip
const query = new USyncQuery()
  .withBusinessProtocol()
  .withPictureProtocol("preview")
  .withTextStatusProtocol()
  .withUser(new USyncUser().withId("6281111111111@s.whatsapp.net"));

const result = await sock.executeUSyncQuery(query);

console.log("🔍 Got data", ":", result.list);

// --- Device feature flags
const features = new USyncQuery()
  .withFeatureProtocol(["voip", "encrypt_v2"])
  .withUser(new USyncUser().withId("6281111111111@s.whatsapp.net"));

await sock.executeUSyncQuery(features);
```

| Protocol                                  | Returns                                                                     |
| ----------------------------------------- | --------------------------------------------------------------------------- |
| `withBusinessProtocol(profileVersion?)`   | Verified name and level, business hours, address, catalog and cart flags    |
| `withPictureProtocol(type?)`              | Picture `id`, `directPath`, and `hash` — `'image'` (default) or `'preview'` |
| `withTextStatusProtocol()`                | About `text`, `emoji`, `setAt`, and `expiresAt`                             |
| `withSidelistProtocol(useLidAddressing?)` | Side-list entries, returned in `result.sideList`                            |
| `withFeatureProtocol(features?)`          | Device feature flags — defaults to all known features                       |

The query result also carries per-protocol diagnostics:

```javascript
const result = await sock.executeUSyncQuery(query);

result.list; // matched users
result.sideList; // side-list users, when the sidelist protocol was requested
result.errors; // { [protocol]: { errorCode, errorText, errorBackoff } }
result.refresh; // { [protocol]: seconds } — how long the response stays cacheable

// A contact who blocked you is flagged instead of throwing
result.list[0].isBlockedByContact;
```

> [!TIP]
> When `result.errors` carries an `errorBackoff`, wait at least that many seconds before repeating the same protocol — otherwise the server keeps rejecting it.

### 🤝 Interoperability (BirdyChat & Haiket)

Chat with users on third-party platforms that WhatsApp has opened up to.
```javascript
// --- List the integrators the server offers
const integrators = await sock.fetchIntegrators();

console.log("🤝 Got integrators", ":", integrators);

// --- Opt in (accepts the interop TOS and opts in, in one call)
await sock.initInterop();

// --- Or opt in and out manually
await sock.acceptInteropTOS();
await sock.optInIntegrators([sock.INTEGRATOR_BIRDYCHAT]);
await sock.optOutIntegrators([sock.INTEGRATOR_HAIKET]);

// --- Resolve an interop identifier into a JID
const user = await sock.resolveInteropUser("someone@example.com");
const users = await sock.resolveInteropUsers(["6281111111111"]);

// --- Interop groups
await sock.createInteropGroup(subject, participants);
await sock.addParticipantsToInteropGroup(groupJid, participants);
await sock.queryInteropGroupInfo(groupJid);
await sock.leaveInteropGroup(groupJid);

// --- Moderation & privacy
await sock.blockInteropUser(jid);
await sock.unblockInteropUser(jid);
await sock.reportInteropSpam(jid);
await sock.trustInteropContact(jid);
await sock.getReachabilitySettings();
await sock.queryInteropPrivacySettings();
await sock.updateInteropPrivacySetting(feature, setting);

// --- Force a fresh Signal session on the next send
await sock.resetInteropSession(jid);
```

> [!NOTE]
> `INTEGRATOR_BIRDYCHAT` identifies users by email, `INTEGRATOR_HAIKET` by phone number.

### 🔒 Account Security (Password & Passkey)

Account-level password and passkey (FIDO2 / WebAuthn) management.
> [!CAUTION]
> These change the security settings of the WhatsApp account itself, not just this session. Losing a password or passkey you set here can lock you out of the account.

```javascript
// --- Password
const { has_password } = await sock.hasPassword();
await sock.setPassword("my-secure-password");
await sock.setPassword("new-password", "old-password");
await sock.checkPassword("my-secure-password");
await sock.deletePassword("my-secure-password");

// --- Passkey
const exists = await sock.passkeyExists();
const list = await sock.passkeyListExists();
const challenge = await sock.passkeyRequestChallenge();
await sock.passkeyVerifyChallenge(
  credentialId,
  authenticatorData,
  clientDataJson,
  signature,
);
await sock.passkeyDelete(credentialId);

// --- Contacts backup
await sock.contactsUpload(contacts);
await sock.contactsBackup(contacts);
await sock.contactsBackupQuery();
await sock.selfContactsQuery();

// --- Misc account
await sock.getWaMeLink();
await sock.userCountryCodeGet();
await sock.removeAccountReachoutTimelock();
await sock.fetchUserNoticesById(noticeIds);

// --- Raw query IDs
sock.REGISTRATION_MEX_IDS;
```

### 👪 Managed Accounts & Payments

Parental / family account linking, payments passkey, and UPI onboarding.
```javascript
// --- Managed (supervised) accounts
await sock.managedAccountQuery(jid);
await sock.managedAccountInitiateLinking("6281111111111");
await sock.managedAccountValidateLinking(linkingToken, sponsorJid);
await sock.managedAccountAcceptLinking(linkingToken);
await sock.managedAccountCompleteLinking(linkingToken);
await sock.managedAccountRevokeLinking(sponsoredJid);
await sock.managedAccountSyncActivities(jid);
await sock.managedAccountUpdatePin(pin);

// --- Payments passkey
await sock.paymentsPasskeyHasCredential();
await sock.paymentsPasskeyEnrollChallenge();
await sock.paymentsPasskeyEnrollVerify(credential);
await sock.paymentsPasskeyToggleOn();
await sock.paymentsPasskeyToggleOff();
await sock.paymentsIsAccountRecoverable();

// --- UPI onboarding (India)
await sock.upiSendOtp(phoneNumber);
await sock.upiVerifyOtp(phoneNumber, otp);

// --- Raw query IDs
sock.MANAGED_ACCOUNT_MEX_IDS;
```

### 🌐 HTTPS GraphQL (Meta AI & Imagine)

Meta AI, Imagine, events, and payments run over HTTPS GraphQL rather than the WebSocket.
> [!IMPORTANT]
> These calls need an ACS access token. `acquireAccessToken()` fetches one for you on the first call (nonce → exchange) and caches it, so you normally do not have to do anything. Pass your own with `setAccessToken()` if you already have one.

```javascript
// --- Token handling (optional — acquired on demand otherwise)
await sock.acquireAccessToken();
sock.setAccessToken(token);
sock.setWamoAuth(auth, host);

// --- Meta AI memory
await sock.metaAiMemoryQuery();
await sock.metaAiMemoryDelete(memoryId);
await sock.metaAiMemoryDeleteAll();
await sock.metaAiMemoryOptOutStatus();
await sock.metaAiMemoryOptOutUpdate(true);

// --- Imagine (image & video generation)
await sock.imagineIntents("a cat wearing sunglasses");
await sock.imagineEdit(imageId, "make it night time");
await sock.imagineExpand(imageId, "left");
await sock.imagineGenerateAnimate(imageId);
await sock.imagineVideoStatus(jobId);

// --- AI personas
await sock.aiHomeFetchUserCreatedPersonas();
await sock.aiCreationUpdatePersona(botId, updates);
await sock.aiCreationDeletePersona(botId);

// --- Raw executors, for queries not wrapped above
await sock.executeWWWGraphQL(docId, variables, token, dataPath);
await sock.executeFacebookGraphQL(docId, variables, token, dataPath);
await sock.executeWamoGraphQL(docId, variables, wamoAuth, dataPath, wamoHost);

// --- Raw doc ID dictionaries
sock.WWW_GQL_IDS;
sock.FACEBOOK_GQL_IDS;
sock.WAMO_GQL_IDS;
sock.CLIENT_PERSIST_GQL_IDS;
```

> [!WARNING]
> These calls leave the WhatsApp WebSocket and hit Meta's HTTPS endpoints directly. They have no built-in timeout, so wrap them in your own if a hung request would stall your bot.

### 🧩 A2UI Widget

Declarative widgets sent as `interactiveMessage.bloksWidget`. Every builder method registers a component and returns its id, so a tree is written bottom-up.

```javascript
import { A2UI } from "@violetix/baileys";

const ui = new A2UI();
const title = ui.text("Halo!", { variant: "h1" });
const button = ui.button(ui.text("Klik saya"), { action: { name: "noop" } });
ui.root([ui.card(ui.column([title, button]))]);

await sock.sendMessage(jid, { a2ui: ui, text: "Widget", footer: "A2UI" });

// --- product list shortcut, its own payload shape
const list = new A2UI().listCard({
   title: "Menu",
   items: [{ title: "Nasi Goreng", price: "Rp15.000" }, { title: "Es Teh", price: "Rp5.000" }]
});
await sock.sendMessage(jid, { a2ui: list, text: "Pesan menu" });

// --- widget as the whole message, plus native flow buttons
await sock.sendMessage(jid, {
   a2ui: ui,
   singleScreen: true,
   nativeFlow: [{ text: "🌐 Visit", url: "https://example.com" }]
});
```

| Component      | Builder                                                                  |
| -------------- | ------------------------------------------------------------------------ |
| `Text`         | `ui.text(text, { variant })` — `variant` defaults to `body`               |
| `Image`        | `ui.image(url, { variant, fit })` — `fit` defaults to `cover`             |
| `Video`        | `ui.video(url)`                                                          |
| `Button`       | `ui.button(childId, { variant, action })`                                |
| `Card` / `Column` / `Row` | `ui.card(childId)`, `ui.column(ids, { justify, align })`, `ui.row(ids)` |
| `CheckBox` / `TextField` / `ChoicePicker` / `Divider` | `ui.checkbox(label, { value })`, `ui.textField(label, { variant })`, `ui.choicePicker(label, options, { variant, displayStyle, filterable })`, `ui.divider()` |

Send options on the content: `text` (body), `footer`, `singleScreen` (no bubble around the widget), `nativeFlow` (this fork's usual [button shapes](#%EF%B8%8F-interactive)), `messageSecret`, `a2uiType`, `a2uiWrapped: false` (emit a bare `{ components }` payload instead of the `createSurface` envelope). `nativeFlowMessage` is always attached — it is what keys the interactive render and what makes the `<biz>` node go out.

> [!WARNING]
> Internal WhatsApp format. A send can succeed with no error while the widget renders as nothing on the recipient's client. Test on a throwaway number first.

### 🙊 Exclusive Message

Sends into a group but addressed to **one member**. Other members never receive the stanza at all, so there is nothing for them to see or decrypt.

```javascript
// the quoted message names the recipient — its author
await sock.sendMessage(m.chat, { text: "Hi, only you can see this." }, { quoted: m, exclusive: true });

// or address someone else explicitly, in the group's own addressing mode
await sock.sendMessage(groupJid, { text: "psst" }, { exclusive: "43411111111111@lid" });
```

`exclusive: true` requires `quoted` — the quoted message's author is the only place the recipient comes from, and it already carries the group's addressing mode (a LID-addressed group quotes `@lid`, a PN one quotes `@s.whatsapp.net`), so nothing has to be mapped. Without a quote, or with a quote that has no `participant` (a 1:1 quote), the send throws. So does `exclusive` outside a group.

How it works: the stanza goes out as `to=<group> participant=<member>` with per-device `pkmsg`/`msg` encryption instead of the group sender key, reusing the retry-resend path. A `skmsg` stanza is fanned out to the whole group by the server, so sender-key sends can never be targeted. One stanza per device of the recipient, all sharing the message id.

> [!NOTE]
> Your own linked devices are not addressed, so the message does not appear in the group on your phone — only `messages.upsert` fires locally (via `emitOwnEvents`). The recipient sees an ordinary group message; nothing marks it as private on their side.

### 🚫 Ignoring Inbound Stanzas

`sock.ignoreKey(input)` drops matching inbound stanzas **before any handler runs** — including the decryption and persistence paths. The ack is still sent, so the server stops redelivering them. It returns an unregister function.

```javascript
// --- Descriptor: drop everything from one peer
const off = sock.ignoreKey({ remoteJid: "6281111111111@s.whatsapp.net" });

// Only that peer's messages; receipts and presence still arrive
sock.ignoreKey({ remoteJid: "6281111111111@s.whatsapp.net", only: ["message"] });

// Several chats at once (array entries OR)
sock.ignoreKey({ remoteJid: ["111111@g.us", "222222@g.us"] });

// Your own outbound echoes from other devices
sock.ignoreKey({ fromMe: true, only: ["message"] });

off(); // unregister

// --- Predicate: anything the descriptor cannot express
sock.ignoreKey((m) => m.kind === "message" && isJidGroup(m.remoteJid ?? ""));
sock.ignoreKey((m) => isJidStatusBroadcast(m.remoteJid ?? ""));
```

| Field         | Type                                                                                    | Notes                                                                                                                          |
| ------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `remoteJid`   | `string \| string[]`                                                                    | Chat JID. Array entries OR. Also matched against the alt `sender_pn` / `sender_lid` attributes, so one JID form catches the other. |
| `fromMe`      | `boolean`                                                                               | Whether the stanza was sent by this account, resolved against both your PN and LID.                                            |
| `id`          | `string`                                                                                | Stanza id.                                                                                                                     |
| `participant` | `string`                                                                                | Author in groups / broadcasts. Alt forms are matched too.                                                                      |
| `only`        | `('message' \| 'receipt' \| 'notification' \| 'presence' \| 'chatstate' \| 'call')[]`   | Restrict to specific tags. Default: all six.                                                                                   |

Top-level fields AND together; the `remoteJid` array ORs. At least one of `remoteJid` / `fromMe` / `id` / `participant` is required — empty descriptors throw, as do unknown `only` values.

A predicate receives the already-parsed stanza: `{ kind, remoteJid, fromMe, id, participant }`, with `remoteJid` and `participant` device-stripped so they line up with `event.key.remoteJid`. Return `true` to drop. A predicate that throws is logged and the stanza is kept.

> [!IMPORTANT]
> `category='peer'` messages from your own devices are **never** dropped, whatever the filter says. They carry app-state key shares, history sync and PDO responses between your devices, so a `{ fromMe: true }` filter would otherwise swallow the app-state key share and leave the collections blocked on a key they re-request on every sync. The exemption applies only when the sender really is this account, so a foreign stanza cannot dodge a filter by stamping the attribute. Stream control and the auth-critical `success` / `failure` tags bypass filters as well.

### 🛡️ Anchor Guard

Detects payloads that force-close WhatsApp clients, deletes them, and optionally blocks the sender.

```javascript
import { createAnchorGuard, detectBug } from "@violetix/baileys";

const guard = createAnchorGuard(sock, {
  blockOnBug: true,
  guardOutgoing: true, // also reject your own crash payloads before they are sent
  onDetect: ({ direction, jid, reasons }) => console.log("🛡️", direction, jid, reasons),
});

// one-off check without attaching anything
const { flagged, reasons } = detectBug(msg.message);

guard.stop(); // detach listeners and unwrap sendMessage
```

Flags invisible and combining character floods, mention bombs, oversized native-flow / list / carousel payloads, `buttonParamsJson` that is broken or huge, excessive newlines, over-deep, over-wide and circular structures, and — when you pass `proto` — an encoded size over `maxBytes`.

| Option                            | Default  | Description                                                                              |
| --------------------------------- | -------- | ---------------------------------------------------------------------------------------- |
| `autoDelete`                      | `true`   | Delete a flagged inbound message.                                                        |
| `deleteMode`                      | `'auto'` | `'auto'` revokes your own messages and deletes others locally; `'everyone'` always revokes. |
| `guardIncoming`                   | `true`   | Guard `messages.upsert`.                                                                 |
| `guardOutgoing`                   | `false`  | Wrap `sock.sendMessage` and throw on a crash payload.                                    |
| `blockOnBug`                      | `false`  | Block the sender of a flagged message.                                                   |
| `selfOnly`                        | `false`  | Only guard your own chats.                                                               |
| `burstThreshold` / `burstWindowMs` | `0` / `4000` | Messages from one sender inside the window before it counts as a burst. `0` disables. |
| `kickOnBurst`                     | `false`  | Remove the sender from the group on burst (needs admin).                                 |
| `guardGroupAdds`                  | `false`  | Flag / kick when a burst-flagged inviter adds you to a group.                             |
| `metaAiNumbers`                   | `false`  | Guard Meta AI's own numbers instead of exempting them.                                   |
| `thresholds`                      | `{}`     | Override any of `ANCHORGUARD_DEFAULTS`.                                                  |

> [!NOTE]
> `guardOutgoing` replaces `sock.sendMessage` with a wrapper, which is why it is off by default — turn it on knowingly if your own code also wraps `sendMessage`. `stop()` only unwinds its own wrapper, so a wrapper you installed afterwards survives.

### 📡 Events

```javascript
sock.ev.on("connection.update", (update) => {});
sock.ev.on("creds.update", (update) => {});
sock.ev.on("messaging-history.set", (update) => {});
sock.ev.on("messaging-history.status", (update) => {});
sock.ev.on("chats.upsert", (update) => {});
sock.ev.on("chats.update", (update) => {});
sock.ev.on("chats.delete", (update) => {});
sock.ev.on("chats.lock", (update) => {});
sock.ev.on("presence.update", (update) => {});
sock.ev.on("contacts.upsert", (update) => {});
sock.ev.on("contacts.update", (update) => {});
sock.ev.on("messages.delete", (update) => {});
sock.ev.on("messages.update", (update) => {});
sock.ev.on("messages.media-update", (update) => {});
sock.ev.on("messages.upsert", (update) => {});
sock.ev.on("messages.reaction", (update) => {});
sock.ev.on("message-receipt.update", (update) => {});
sock.ev.on("groups.upsert", (update) => {});
sock.ev.on("groups.update", (update) => {});
sock.ev.on("group-participants.update", (update) => {});
sock.ev.on("group.join-request", (update) => {});
sock.ev.on("group.member-tag.update", (update) => {});
sock.ev.on("blocklist.set", (update) => {});
sock.ev.on("blocklist.update", (update) => {});
sock.ev.on("username.update", ({ lid, username, type }) => {}); // type: 'set' | 'delete'
sock.ev.on("lid-mapping.update", ({ oldLid, newLid, pn }) => {});
sock.ev.on("privacy.update", (settings) => {});
sock.ev.on("call", (update) => {});
sock.ev.on("labels.edit", (update) => {});
sock.ev.on("labels.association", (update) => {});
sock.ev.on("newsletter.reaction", (update) => {});
sock.ev.on("newsletter.view", (update) => {});
sock.ev.on("newsletter.status", (update) => {}); // not in upstream Baileys
sock.ev.on("newsletter-participants.update", (update) => {});
sock.ev.on("newsletter-settings.update", (update) => {});
sock.ev.on("settings.update", (update) => {});
```

#### 📰 `newsletter.status`

Fires for channel (newsletter) posts pushed by the server, carrying the post content alongside its engagement counters.
```javascript
sock.ev.on("newsletter.status", (update) => {
  console.log("📰 Newsletter post", ":", update);
});

// --- Output
// {
//    id: '120111111111111111@newsletter',
//    messageId: '3A4E0CA0AEF807976D5B',
//    serverId: 42,
//    timestamp: 1785923027,
//    isSender: false,
//    viewsCount: 128,
//    responsesCount: 7,
//    reactionCounts: [
//       { code: '👍', count: 12 }
//    ],
//    meta: {
//       editedAt: 1785923100,
//       originalTimestamp: 1785923027
//    },
//    content: {
//       type: 'text',
//       message: { conversation: 'Hello from the channel!' }
//    }
// }
```

`content.type` is one of `text`, `media` (with an extra `mediaType`), `reaction` (with a `code`), or `revoke`. It is `null` when the stanza carries only counter updates.

#### 📞 `call`

The call event now carries the full signalling payload.
```javascript
sock.ev.on("call", ([call]) => {
  console.log("📞 Call", ":", call);
});
```

| Field                       | Present when                     | Description                                                  |
| --------------------------- | -------------------------------- | ------------------------------------------------------------ |
| `callKey`                   | `status: 'offer'`                | Raw SRTP key bytes, Signal-decrypted from the offer          |
| `audioCodecs`, `audioCodec` | `status: 'offer'`                | Offered audio codecs, one entry per sample rate              |
| `videoCodec`                | `status: 'offer'`                | Offered video codec                                          |
| `isLightweight`             | `status: 'offer'`                | Silent / wave-style group ring — no full ringing UX expected |
| `silenceReason`             | `status: 'offer'`                | Why the call was silenced                                    |
| `peerJid`                   | `status: 'waiting_room_request'` | Who is waiting in a call link's waiting room                 |
| `participants`              | `status: 'group_info'`           | Group call roster, with per-user devices                     |
| `muted`                     | `status: 'mute'`                 | Mute state of the peer                                       |
| `enabled`                   | `status: 'video_state'`          | Whether the peer's video is on                               |
| `state`                     | `status: 'peer_state'`           | Peer connection state                                        |
| `latencyMs`                 | `status: 'relaylatency'`         | Relay latency                                                |

`status` can also be a specific end-call reason instead of a bare `terminate`: `timeout`, `reject_do_not_disturb`, `mic_permission_denied`, `camera_permission_denied`, `remote_busy`, or `remote_offline`.

## Development checks

```bash
npm ci
npm run check
npm audit --omit=dev --audit-level=high
```

`npm run check` checks JavaScript syntax, imports the package entry point, compiles
a TypeScript consumer, and runs the offline regression suite. Tests do not connect
to WhatsApp. `npm publish` runs the same checks through `prepublishOnly`; the CI
workflow also runs them on Node.js 20 and 24.

## 📦 Fork Base

`@violetix/baileys` is a fork of [`@itsliaaa/baileys`](https://github.com/itsliaaa/baileys) by [Lia Wynn](https://github.com/itsliaaa), which is itself based on [Baileys (GitHub)](https://github.com/WhiskeySockets/Baileys). The credits section below is kept in full, as its own notice and the MIT licence both require.

## 📣 Credits

This fork uses Protocol Buffer definitions maintained by [WPP Connect](https://github.com/wppconnect-team) via [`wa-proto`](https://github.com/wppconnect-team/wa-proto)

Full credit is attributed to the original maintainers and contributors of Baileys:

- [purpshell](https://github.com/purpshell)
- [jlucaso1](https://github.com/jlucaso1)
- [adiwajshing](https://github.com/adiwajshing)

<!-- Please do not replace my name with yours. It's disrespectful. -->

This fork includes additional enhancements and modifications by [Lia Wynn](https://github.com/itsliaaa)

Special thanks to [itsreimau](https://github.com/itsreimau) for the fix to the `updateBlockStatus` implementation.

> [!CAUTION]
> ⚠️ **Modification, removal, or misrepresentation of these credits is strictly prohibited. Any redistribution or fork must preserve this section in its original form without exception.**
