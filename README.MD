

<img  src="https://i.pinimg.com/originals/f7/8a/03/f78a0369ac804cd9276d73ec37b6b3e8.gif"  width="100%"  />

# Powered by Oblivinx
<div align="center">

  [![NPM Version](https://img.shields.io/npm/v/@Natzsixn/MeBaileys?color=success&logo=npm)](https://www.npmjs.com/package/@Natzsixn/MeBaileys)
  [![Downloads](https://img.shields.io/npm/dt/@Natzsixn/MeBaileys?color=blue&logo=npm)](https://www.npmjs.com/package/@Natzsixn/MeBaileys)
  [![License](https://img.shields.io/github/license/Natzsixn/MeBaileys?color=yellow)](./LICENSE)
  [![Node Version](https://img.shields.io/node/v/@Natzsixn/MeBaileys)](https://nodejs.org)
  
  *Modern, feature-rich, and developer-friendly WhatsApp automation library*

</div>

---

## 📋 Table of Contents

- [✨ Features](#-features)
- [📦 Installation](#-installation)
- [🔌 Quick Start](#-quick-start)
- [🔐 Authentication](#-authentication)
- [💡 Socket Configuration](#-socket-configuration)
- [💾 Session Management](#-session-management)
- [📡 Event Handling](#-event-handling)
- [🛠️ Data Store](#️-data-store)
- [🔑 WhatsApp IDs](#-whatsapp-ids)
- [💬 Sending Messages](#-sending-messages)
  - [Non-Media Messages](#non-media-messages)
  - [Media Messages](#media-messages)
  - [Interactive Messages (Unified via sendMessage)](#interactive-messages-unified-via-sendmessage)
    - [Button Messages](#button-messages)
    - [List Messages](#list-messages)
    - [Carousel / Card Messages](#carousel--card-messages)
    - [Button Types Reference](#button-types-reference)
- [🧩 MessageService (High-Level API)](#-messageservice-high-level-api)
- [✏️ Message Modifications](#️-message-modifications)
- [📥 Media Operations](#-media-operations)
- [👥 Group Management](#-group-management)
- [📱 User Operations](#-user-operations)
- [🔒 Privacy Controls](#-privacy-controls)
- [💬 Chat Operations](#-chat-operations)
- [📢 Broadcast & Stories](#-broadcast--stories)
- [🧪 Advanced Features](#-advanced-features)

---

## ✨ Features

<table>
<tr>
<td>

### Core Features
- 🔥 **Multi-Device Support** — Connect without phone always online
- ⚡ **WebSocket Based** — Fast and efficient communication
- 💾 **Session Management** — Save and restore authentication
- 🎯 **Event-Driven** — Reactive message handling
- 📦 **TypeScript Ready** — Full type definitions included
- 🚀 **Built on WhiskeySockets** — Latest Baileys implementation

</td>
<td>

### Extended Features
- 🎨 **Unified Interactive Messages** — Buttons, lists, cards **all via `sendMessage`**
- 📸 **Media Handling** — Images, videos, audio, documents, stickers
- 🤖 **Poll & Event Support** — Create polls and event invitations
- 📍 **Location Sharing** — Share locations with metadata
- 🔔 **Newsletter Support** — Manage WhatsApp channels
- 🎪 **Carousel Messages** — Multi-card interactive displays
- 📦 **MessageService** — Centralized high-level message sending API

</td>
</tr>
</table>

---

## 📦 Installation

### NPM
```bash
npm install @oblivinx/baileys
```

### Yarn
```bash
yarn add @oblivinx/baileys
```

### Using Different Package Name
Add to your `package.json`:
```json
{
  "dependencies": {
    "@whiskeysockets/baileys": "npm:@oblivinx/baileys"
  }
}
```

### Import
```javascript
// ESM
import makeWASocket from '@oblivinx/baileys'

// CommonJS
const { default: makeWASocket } = require('@oblivinx/baileys')
```

---

## 🔌 Quick Start

```javascript
import makeWASocket, { DisconnectReason, useMultiFileAuthState } from '@oblivinx/baileys'

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_session')
    
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true,
        browser: ['oblivinx', 'Chrome', '1.0.0']
    })

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut
            if (shouldReconnect) connectToWhatsApp()
        } else if (connection === 'open') {
            console.log('✅ Connected to WhatsApp!')
        }
    })

    sock.ev.on('messages.upsert', async ({ messages }) => {
        for (const msg of messages) {
            if (!msg.key.fromMe && msg.message) {
                await sock.sendMessage(msg.key.remoteJid, { 
                    text: 'Hello from oblivinx Baileys!' 
                })
            }
        }
    })

    sock.ev.on('creds.update', saveCreds)
}

connectToWhatsApp()
```

---

## 🔐 Authentication

### QR Code Authentication
```javascript
const sock = makeWASocket({
    auth: state,
    printQRInTerminal: true,
    browser: ['Oblivinx', 'Chrome', '1.0.0']
})
```

### Pairing Code Authentication
```javascript
const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false
})

if (!sock.authState.creds.registered) {
    const phoneNumber = '1234567890' // without + or spaces
    const code = await sock.requestPairingCode(phoneNumber)
    console.log(`Pairing code: ${code}`)
}
```

### Custom Pairing Code
```javascript
const phoneNumber = "628XXXXX"
const code = await sock.requestPairingCode(phoneNumber.trim(), "NEXUS01")
console.log("Your pairing code: " + code)
```

---

## 💡 Socket Configuration

### Cache Group Metadata (Recommended)
```javascript
const groupCache = new NodeCache({ stdTTL: 5 * 60, useClones: false })

const sock = makeWASocket({
    cachedGroupMetadata: async (jid) => groupCache.get(jid)
})

sock.ev.on('groups.update', async ([event]) => {
    const metadata = await sock.groupMetadata(event.id)
    groupCache.set(event.id, metadata)
})
```

### Improve Retry & Poll Decryption
```javascript
const sock = makeWASocket({
    getMessage: async (key) => await getMessageFromStore(key)
})
```

### Receive Notifications in WhatsApp App
```javascript
const sock = makeWASocket({
    markOnlineOnConnect: false
})
```

---

## 💾 Session Management

Avoid scanning QR every time:
```javascript
import makeWASocket, { useMultiFileAuthState } from '@oblivinx/baileys'

const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys')
const sock = makeWASocket({ auth: state })

sock.ev.on('creds.update', saveCreds)
```

> 💡 **Tip:** For production, store auth in a database instead of files.

---

## 📡 Event Handling

### Connection Updates
```javascript
sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update
    if (connection === 'close') {
        const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut
        console.log('Connection closed, reconnecting:', shouldReconnect)
        if (shouldReconnect) connectToWhatsApp()
    } else if (connection === 'open') {
        console.log('Connection opened')
    }
})
```

### New Messages
```javascript
sock.ev.on('messages.upsert', async ({ messages }) => {
    for (const msg of messages) {
        console.log('New message:', msg)
    }
})
```

### Message Updates
```javascript
sock.ev.on('messages.update', async (updates) => {
    for (const update of updates) {
        console.log('Message updated:', update)
    }
})
```

### Decrypt Poll Votes
```javascript
sock.ev.on('messages.update', async (event) => {
    for (const { key, update } of event) {
        if (update.pollUpdates) {
            const pollCreation = await getMessage(key)
            if (pollCreation) {
                console.log('Poll update:', getAggregateVotesInPollMessage({
                    message: pollCreation,
                    pollUpdates: update.pollUpdates,
                }))
            }
        }
    }
})
```

---

## 🛠️ Data Store

```javascript
import makeWASocket, { makeInMemoryStore } from '@oblivinx/baileys'

const store = makeInMemoryStore({})
store.readFromFile('./baileys_store.json')

setInterval(() => {
    store.writeToFile('./baileys_store.json')
}, 10_000)

const sock = makeWASocket({})
store.bind(sock.ev)

sock.ev.on('chats.upsert', () => {
    console.log('Got chats:', store.chats.all())
})

sock.ev.on('contacts.upsert', () => {
    console.log('Got contacts:', Object.values(store.contacts))
})
```

> ⚠️ **Important:** Build your own data store for production. In-memory storage wastes RAM.

---

## 🔑 WhatsApp IDs

| Type | Format | Example |
|------|--------|---------|
| Personal | `[country_code][phone]@s.whatsapp.net` | `1234567890@s.whatsapp.net` |
| Group | `[group_id]@g.us` | `123456789-987654321@g.us` |
| Broadcast | `[timestamp]@broadcast` | `1234567890@broadcast` |
| Status | `status@broadcast` | `status@broadcast` |
| Newsletter | `[newsletter_id]@newsletter` | `120363xxx@newsletter` |

---

## 💬 Sending Messages

> **Architecture Note:** In oblivinx, **all message types** — including interactive messages (buttons, lists, cards) — are sent through the unified `sendMessage` method. There are no separate `sendButton`/`sendCard`/`sendList` socket methods. Interactive messages use `interactiveMessage: { }` content.

### Non-Media Messages

#### Text Message
```javascript
await sock.sendMessage(jid, { text: 'Hello World!' })
```

#### Quote / Reply (works with all types)
```javascript
await sock.sendMessage(jid, { text: 'This is a reply' }, { quoted: message })
```

#### Mention User (works with most types)
```javascript
await sock.sendMessage(jid, {
    text: '@12345678901',
    mentions: ['12345678901@s.whatsapp.net']
})
```

#### Mention Status
```javascript
await sock.sendStatusMentions(
    {
        text: "Hello", // or image / video / audio (url or buffer)
    },
    [
        "123456789123456789@g.us",
        "123456789@s.whatsapp.net"
    ] 
)
```

#### Forward Messages
```javascript
const msg = getMessageFromStore() // implement on your end
await sock.sendMessage(jid, { forward: msg })
```

#### Location Message
```javascript
await sock.sendMessage(jid, {
    location: {
        degreesLatitude: 24.121231,
        degreesLongitude: 55.1121221,
        name: "Location Name",
        address: "Location Address"
    }
})
```

#### Contact Message
```javascript
const vcard = 'BEGIN:VCARD\n'
    + 'VERSION:3.0\n'
    + 'FN:John Doe\n'
    + 'ORG:oblivinx;\n'
    + 'TEL;type=CELL;type=VOICE;waid=1234567890:+1 234 567 890\n'
    + 'END:VCARD'

await sock.sendMessage(jid, {
    contacts: {
        displayName: 'John Doe',
        contacts: [{ vcard }]
    }
})
```

#### Reaction Message
```javascript
await sock.sendMessage(jid, {
    react: {
        text: '💖', // use empty string to remove reaction
        key: message.key
    }
})
```

#### Poll Message
```javascript
await sock.sendMessage(jid, {
    poll: {
        name: 'Favorite Color?',
        values: ['Red', 'Blue', 'Green', 'Yellow'],
        selectableCount: 1,
        toAnnouncementGroup: false
    }
})
```

#### Poll Result from Newsletter
```javascript
await sock.sendMessage(jid, {
    pollResult: {
        name: "Text poll",
        votes: [["Options 1", 10], ["Options 2", 10]],
    }
}, { quoted: message })
```

#### Pin Message
```javascript
await sock.sendMessage(jid, {
    pin: {
        type: 1, // 0 to remove
        time: 86400, // 24h | 604800 = 7d | 2592000 = 30d
        key: message.key
    }
})
```

#### Keep Message
```javascript
await sock.sendMessage(jid, {
    keep: message.key,
    type: 1, // 2 to unpin
    time: 86400
})
```

#### Event Message
```javascript
await sock.sendMessage(jid, { 
    event: {
        isCanceled: false,
        name: "Event Name", 
        description: "Event Description",
        location: { 
            degreesLatitude: -6.2, 
            degreesLongitude: 106.8 
        },
        link: "https://call-link.example.com",
        startTime: m.messageTimestamp.low,
        endTime: m.messageTimestamp.low + 86400,
        extraGuestsAllowed: true
    }
}, { quoted: message })
```

#### Album Message
```javascript
await sock.sendAlbumMessage(
    jid,
    [
        {
            image: { url: "https://example.jpg" },
            caption: "Hello World",
        },
        {
            video: { url: "https://example.mp4" },
            caption: "Hello World",
        },
    ],
    { 
        quoted: message, 
        delay: 2000
    }
)
```

Or via `sendMessage`:
```javascript
await sock.sendMessage(jid, {
    album: [
        { image: { url: './photo1.jpg' }, caption: 'First photo' },
        { video: { url: './clip.mp4' }, caption: 'A clip' }
    ],
    caption: 'My album'
})
```

#### Link Preview
```javascript
await sock.sendMessage(jid, {
    text: 'Check out https://github.com/oblivinx/baileys'
})
```

#### Disappearing Messages
```javascript
// Enable (86400 = 24h, 604800 = 7d, 7776000 = 90d)
await sock.sendMessage(jid, { disappearingMessagesInChat: 86400 })

// Disable
await sock.sendMessage(jid, { disappearingMessagesInChat: false })
```

---

### Media Messages

> 📝 **Note:** You can pass `{ stream: Stream }`, `{ url: Url }`, or `Buffer` directly

#### Image Message
```javascript
// From URL
await sock.sendMessage(jid, {
    image: { url: 'https://example.com/image.jpg' },
    caption: 'Beautiful image!'
})

// From Buffer
await sock.sendMessage(jid, {
    image: buffer,
    caption: 'Image from buffer'
})

// From File
await sock.sendMessage(jid, {
    image: fs.readFileSync('./image.jpg'),
    caption: 'Local image'
})
```

#### Video Message
```javascript
await sock.sendMessage(jid, {
    video: { url: './video.mp4' },
    caption: 'Check this out!',
    gifPlayback: false, // set true for GIF
    ptv: false // set true for video note (round video)
})
```

#### GIF Message
```javascript
await sock.sendMessage(jid, {
    video: fs.readFileSync('Media/gif.mp4'),
    caption: 'Funny GIF',
    gifPlayback: true
})
```

#### Audio Message
```javascript
await sock.sendMessage(jid, {
    audio: { url: './audio.mp3' },
    mimetype: 'audio/mp4',
    ptt: true // voice message
})
```

> 💡 **Audio Conversion Tip:**
> ```bash
> ffmpeg -i input.mp4 -avoid_negative_ts make_zero -ac 1 output.ogg
> ```

#### Document
```javascript
await sock.sendMessage(jid, {
    document: { url: './document.pdf' },
    fileName: 'document.pdf',
    mimetype: 'application/pdf'
})
```

#### Sticker
```javascript
await sock.sendMessage(jid, {
    sticker: { url: './sticker.webp' }
})
```

#### Sticker Pack
```javascript
// Direct socket method
await sock.stickerPackMessage(jid, {
    name: 'My Stickers',
    publisher: 'Your Bot',
    description: 'Collection of stickers',
    stickers: [
        { data: buffer, emojis: ['😊'] },
        { data: './sticker.png', emojis: ['😂'] },
        { data: 'https://example.com/sticker.jpg', emojis: ['❤️'] }
    ],
    cover: buffer
}, { quoted: message })

// Via sendMessage
await sock.sendMessage(jid, {
    stickerPack: {
        name: 'My Stickers',
        publisher: 'Your Bot',
        stickers: [
            { data: buffer, emojis: ['😊'] },
            { data: './sticker.png', emojis: ['😂'] }
        ],
        cover: buffer
    }
}, { quoted: message })
```

**Supported sticker formats:**

| Format | Support | Notes |
|--------|---------|-------|
| WebP | ✅ Full | Used as-is |
| PNG | ✅ Full | Auto-converts to WebP |
| JPG/JPEG | ✅ Full | Auto-converts to WebP |
| GIF | ✅ Limited | Converts to static WebP |
| BMP | ✅ Full | Auto-converts to WebP |
| Video | ❌ | Only static images |

#### View Once Message
```javascript
await sock.sendMessage(jid, {
    image: { url: './secret.jpg' },
    viewOnce: true,
    caption: 'View once only!'
})
```

---

### Interactive Messages (Unified via sendMessage)

> 🎯 **Unified API:** All interactive messages — **buttons**, **lists**, and **cards/carousels** — are sent through `sendMessage` using the `interactiveMessage: { }` content key. There are **no separate socket methods** like `sendButton` or `sendList`.

The `interactiveMessage` content object supports three dispatch modes based on what fields you provide:

| Fields Present | Message Type |
|---|---|
| `sections` | **List message** |
| `cards` | **Carousel / Card message** |
| `buttons` (or just text/media) | **Button / Interactive message** |

---

#### Button Messages

Send interactive buttons with optional media headers:

```javascript
// ── Text-only buttons ──
await sock.sendMessage(jid, {
    interactiveMessage: {
        text: 'Choose an option:',
        footer: 'Powered by oblivinx',
        buttons: [
            { id: 'btn1', text: 'Option 1' },
            { id: 'btn2', text: 'Option 2' }
        ]
    }
})

// ── Buttons with title header ──
await sock.sendMessage(jid, {
    interactiveMessage: {
        title: 'Welcome!',
        text: 'What would you like to do?',
        footer: 'oblivinx Bot',
        buttons: [
            { id: 'help', text: 'Help' },
            { id: 'menu', text: 'Menu' },
            { id: 'info', text: 'Info' }
        ]
    }
})

// ── Buttons with image header ──
await sock.sendMessage(jid, {
    interactiveMessage: {
        image: { url: 'https://example.com/banner.jpg' }, // or Buffer
        caption: 'Check out our latest offers!',
        title: 'Special Offers',
        footer: 'Limited time only',
        buttons: [
            { id: 'buy', text: 'Buy Now' },
            { id: 'details', text: 'View Details' }
        ]
    }
})

// ── Buttons with video header ──
await sock.sendMessage(jid, {
    interactiveMessage: {
        video: { url: './promo.mp4' },
        caption: 'Watch our promo!',
        footer: '© oblivinx',
        buttons: [
            { id: 'subscribe', text: 'Subscribe' }
        ]
    }
})

// ── Buttons with document header ──
await sock.sendMessage(jid, {
    interactiveMessage: {
        document: { url: './catalog.pdf' },
        fileName: 'catalog.pdf',
        mimetype: 'application/pdf',
        caption: 'Download our catalog',
        buttons: [
            { id: 'order', text: 'Order Now' }
        ]
    }
})

// ── Buttons with location header ──
await sock.sendMessage(jid, {
    interactiveMessage: {
        location: {
            degreesLatitude: -6.2088,
            degreesLongitude: 106.8456,
            name: 'Our Store',
            address: 'Jakarta, Indonesia'
        },
        text: 'Visit our store!',
        buttons: [
            { id: 'navigate', text: 'Get Directions' }
        ]
    }
})

// ── Native flow button format (advanced) ──
await sock.sendMessage(jid, {
    interactiveMessage: {
        text: 'Advanced buttons:',
        footer: 'oblivinx',
        buttons: [
            {
                name: 'quick_reply',
                buttonParamsJson: JSON.stringify({
                    display_text: 'Quick Reply',
                    id: 'qr_1'
                })
            },
            {
                name: 'cta_url',
                buttonParamsJson: JSON.stringify({
                    display_text: 'Visit Website',
                    url: 'https://oblivinx.com'
                })
            },
            {
                name: 'cta_call',
                buttonParamsJson: JSON.stringify({
                    display_text: 'Call Us',
                    phone_number: '+1234567890'
                })
            },
            {
                name: 'cta_copy',
                buttonParamsJson: JSON.stringify({
                    display_text: 'Copy Code',
                    id: 'copy_1',
                    copy_code: 'PROMO2025'
                })
            }
        ]
    }
})

// ── Buttons with external ad reply ──
await sock.sendMessage(jid, {
    interactiveMessage: {
        text: 'Check this out!',
        buttons: [{ id: 'ok', text: 'OK' }],
        externalAdReply: {
            title: 'oblivinx',
            body: 'Modern WhatsApp Library',
            sourceUrl: 'https://oblivinx.com',
            thumbnailUrl: 'https://example.com/thumb.jpg',
            mediaType: 1,
            renderLargerThumbnail: true
        }
    }
})

// ── Buttons with product header ──
await sock.sendMessage(jid, {
    interactiveMessage: {
        product: {
            productImage: { url: 'https://example.com/product.jpg' },
            productId: 'SKU-001',
            title: 'Premium Widget',
            description: 'High quality widget',
            currencyCode: 'USD',
            priceAmount1000: 29990,
            retailerId: 'STORE-001',
            url: 'https://example.com/product',
            productImageCount: 1
        },
        caption: 'Our best seller!',
        footer: 'Free shipping',
        buttons: [{ id: 'buy', text: 'Buy Now' }]
    }
})

// ── Buttons with mentions ──
await sock.sendMessage(jid, {
    interactiveMessage: {
        text: 'Hey @user, pick one:',
        buttons: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }],
        mentionedJid: ['628xxx@s.whatsapp.net']
    }
})

// ── Buttons with quoted message ──
await sock.sendMessage(jid, {
    interactiveMessage: {
        text: 'Replying with buttons:',
        buttons: [{ id: 'yes', text: 'Yes' }, { id: 'no', text: 'No' }]
    }
}, { quoted: message })
```

**Supported button input formats:**

All three formats are automatically normalized:

```javascript
// Format 1: Simple { id, text }
{ id: 'btn1', text: 'Click Me' }

// Format 2: Legacy { buttonId, buttonText }
{ buttonId: 'btn1', buttonText: { displayText: 'Click Me' } }

// Format 3: Native flow { name, buttonParamsJson }
{ name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: 'Click Me', id: 'btn1' }) }
```

---

#### List Messages

Send list messages with selectable sections:

```javascript
await sock.sendMessage(jid, {
    interactiveMessage: {
        title: 'Our Menu',
        text: 'Browse our selection:',
        footer: 'Tap the button to view',
        buttonText: 'Open Menu',
        sections: [
            {
                title: 'Main Courses',
                rows: [
                    { id: 'pizza', title: 'Pizza', description: 'Classic Italian, from $8' },
                    { id: 'burger', title: 'Burger', description: 'Juicy beef, from $6' },
                    { id: 'pasta', title: 'Pasta', description: 'Fresh homemade, from $7' }
                ]
            },
            {
                title: 'Drinks',
                rows: [
                    { id: 'coffee', title: 'Coffee', description: 'Freshly brewed' },
                    { id: 'juice', title: 'Fresh Juice', description: 'Orange, Apple, Mango' }
                ]
            },
            {
                title: 'Desserts',
                rows: [
                    { id: 'cake', title: 'Cake', description: 'Chocolate / Vanilla' },
                    { id: 'ice_cream', title: 'Ice Cream', description: '3 scoops' }
                ]
            }
        ]
    }
})

// With quoted message
await sock.sendMessage(jid, {
    interactiveMessage: {
        text: 'Select a service:',
        buttonText: 'View Services',
        sections: [{
            title: 'Services',
            rows: [
                { id: 'support', title: 'Support', description: '24/7 customer support' },
                { id: 'sales', title: 'Sales', description: 'Talk to our sales team' }
            ]
        }]
    }
}, { quoted: message })
```

---

#### Carousel / Card Messages

Send swipeable card carousels with images and buttons:

```javascript
await sock.sendMessage(jid, {
    interactiveMessage: {
        text: 'Check out our products:',
        footer: 'Swipe ← → to browse',
        cards: [
            {
                image: { url: 'https://example.com/product1.jpg' },
                caption: 'Premium Widget',
                buttons: [
                    {
                        name: 'quick_reply',
                        buttonParamsJson: JSON.stringify({
                            display_text: 'Buy $29.99',
                            id: 'buy_widget'
                        })
                    },
                    {
                        name: 'cta_url',
                        buttonParamsJson: JSON.stringify({
                            display_text: 'View Details',
                            url: 'https://example.com/widget'
                        })
                    }
                ]
            },
            {
                image: { url: 'https://example.com/product2.jpg' },
                caption: 'Deluxe Gadget',
                buttons: [
                    {
                        name: 'quick_reply',
                        buttonParamsJson: JSON.stringify({
                            display_text: 'Buy $49.99',
                            id: 'buy_gadget'
                        })
                    }
                ]
            },
            {
                image: fs.readFileSync('./product3.jpg'), // Buffer also works
                caption: 'Ultra Device',
                buttons: [
                    {
                        name: 'cta_call',
                        buttonParamsJson: JSON.stringify({
                            display_text: 'Call to Order',
                            phone_number: '+1234567890'
                        })
                    }
                ]
            }
        ]
    }
})
```

---

#### Button Types Reference

All button types usable in `interactiveMessage.buttons` and carousel card buttons:

| Button Type | `name` | Parameters |
|---|---|---|
| **Quick Reply** | `quick_reply` | `display_text`, `id` |
| **URL** | `cta_url` | `display_text`, `url`, `merchant_url` (optional) |
| **Call** | `cta_call` | `display_text`, `phone_number` |
| **Copy** | `cta_copy` | `display_text`, `id`, `copy_code` |
| **Single Select** | `single_select` | `title`, `sections[]` with `rows[]` |
| **Call Permission** | `call_permission_request` | `has_multiple_buttons` |

**Example of each:**

```javascript
// Quick Reply
{ name: "quick_reply", buttonParamsJson: JSON.stringify({ display_text: "Reply", id: "qr_1" }) }

// URL
{ name: "cta_url", buttonParamsJson: JSON.stringify({ display_text: "Visit", url: "https://example.com" }) }

// Call
{ name: "cta_call", buttonParamsJson: JSON.stringify({ display_text: "Call Us", phone_number: "+1234567890" }) }

// Copy
{ name: "cta_copy", buttonParamsJson: JSON.stringify({ display_text: "Copy Code", id: "cp1", copy_code: "PROMO2025" }) }

// Single Select (inline list)
{
    name: "single_select",
    buttonParamsJson: JSON.stringify({
        title: "Select Option",
        sections: [{
            title: "Section 1",
            highlight_label: "Popular",
            rows: [
                { title: "Option 1", description: "Desc 1", id: "opt1" },
                { title: "Option 2", description: "Desc 2", id: "opt2" }
            ]
        }]
    })
}
```

---

### `interactiveMessage` Full Type Reference

```typescript
type InteractiveMessageContent = {
    // Body / text
    text?: string           // body text (used when no media)
    caption?: string        // body text (used when media is present)
    title?: string          // header title
    footer?: string         // footer text

    // Buttons (native flow)
    buttons?: InteractiveButton[]

    // Carousel cards
    cards?: InteractiveCard[]

    // List sections
    sections?: InteractiveListSection[]
    buttonText?: string     // button label for list messages (default: 'Menu')

    // Media attachments (mutually exclusive)
    image?: WAMediaUpload | string | null
    video?: WAMediaUpload | string | null
    document?: WAMediaUpload | string | null
    fileName?: string | null
    mimetype?: string | null
    jpegThumbnail?: Buffer | string | null
    hasMediaAttachment?: boolean

    // Location header
    location?: {
        degreesLatitude: number
        degreesLongitude: number
        name?: string
        address?: string
    } | null

    // Product header
    product?: {
        productImage?: WAMediaUpload | string | null
        productId?: string
        title?: string
        description?: string
        currencyCode?: string
        priceAmount1000?: number
        retailerId?: string
        url?: string
        productImageCount?: number
        businessOwnerJid?: string
    } | null

    // Context
    businessOwnerJid?: string | null
    externalAdReply?: { ... } | null
    mentionedJid?: string[]
}
```

---

## 🧩 MessageService (High-Level API)

Oblivinx provides a **`MessageService`** class that wraps all message-sending into clean, type-safe helper methods. It uses `sendMessage` under the hood.

### Setup

```typescript
import makeWASocket, { MessageService } from '@oblivinx/baileys'

const sock = makeWASocket({ auth: state })
const msg = new MessageService(sock)

// After reconnection, update the socket reference:
msg.updateSocket(newSock)
```

### Available Methods

#### Text & Basic
```typescript
// Plain text
await msg.sendText(jid, 'Hello!')
await msg.sendText(jid, 'Hey @user!', { mentions: ['628xxx@s.whatsapp.net'] })

// Reply / quote
await msg.sendQuoted(jid, { text: 'This is a reply' }, quotedMsg)

// Mentions
await msg.sendMention(groupJid, `Hello @${jid1}!`, [jid1])

// Forward
await msg.sendForward(targetJid, originalMsg, { force: true })
```

#### Media
```typescript
// Image
await msg.sendImage(jid, { url: './photo.jpg' }, { caption: 'Photo!' })
await msg.sendImage(jid, buffer, { viewOnce: true })

// Video
await msg.sendVideo(jid, { url: './video.mp4' }, { caption: 'Watch!' })
await msg.sendVideo(jid, buffer, { gifPlayback: true })
await msg.sendVideo(jid, buffer, { ptv: true })  // video note

// Audio
await msg.sendAudio(jid, { url: './song.mp3' })
await msg.sendAudio(jid, oggBuffer, { ptt: true })  // voice note

// Document
await msg.sendDocument(jid, { url: './report.pdf' }, {
    mimetype: 'application/pdf',
    fileName: 'report.pdf'
})

// Sticker
await msg.sendSticker(jid, { url: './sticker.webp' })

// View Once
await msg.sendViewOnce(jid, { image: { url: './secret.jpg' }, caption: 'Peek!' })

// Album
await msg.sendAlbum(jid, [
    { image: { url: './photo1.jpg' }, caption: 'First' },
    { video: { url: './clip.mp4' } }
], { caption: 'My album' })
```

#### Interactive (Buttons, Lists, Cards)

All of these use `sendMessage` with `interactiveMessage` under the hood:

```typescript
// Buttons
await msg.sendButton(jid, {
    text: 'Choose:',
    footer: 'oblivinx',
    buttons: [
        { id: 'yes', text: 'Yes' },
        { id: 'no', text: 'No' }
    ],
    image: { url: './banner.jpg' }  // optional media header
})

// List
await msg.sendList(jid, {
    text: 'Our menu:',
    buttonText: 'View Menu',
    footer: 'Tap below',
    sections: [{
        title: 'Food',
        rows: [
            { id: 'pizza', title: 'Pizza', description: 'Classic Italian' },
            { id: 'burger', title: 'Burger', description: 'Juicy beef' }
        ]
    }]
})

// Card / Carousel
await msg.sendCard(jid, {
    text: 'Our products:',
    footer: 'Swipe to browse',
    cards: [
        {
            image: { url: './product1.jpg' },
            caption: 'Product 1',
            buttons: [{
                name: 'quick_reply',
                buttonParamsJson: JSON.stringify({ display_text: 'Buy', id: 'buy_1' })
            }]
        }
    ]
})

// Raw Interactive (advanced, direct proto access)
await msg.sendInteractive(jid, {
    body: 'Choose wisely',
    footer: 'oblivinx',
    nativeFlowButtons: [
        { name: 'cta_url', buttonParamsJson: JSON.stringify({ display_text: 'Visit', url: 'https://example.com' }) }
    ]
})
```

#### Location, Contact, Poll
```typescript
// Location
await msg.sendLocation(jid, -6.2, 106.8, { name: 'Jakarta', address: 'Indonesia' })

// Contact
await msg.sendContact(jid, [{
    displayName: 'John Doe',
    vcard: 'BEGIN:VCARD\nVERSION:3.0\nFN:John Doe\nTEL:+628xxx\nEND:VCARD'
}])

// Poll
await msg.sendPoll(jid, 'What do you prefer?', ['A', 'B', 'C'], {
    selectableCount: 1
})
```

#### Reactions, Edit, Delete
```typescript
// React
await msg.sendReaction(jid, targetMsg.key, '👍')
await msg.sendReaction(jid, targetMsg.key, '')  // remove

// Edit
await msg.editMessage(jid, originalMsg.key, 'Updated text')

// Delete (for everyone)
await msg.deleteMessage(jid, targetMsg.key)
```

### MessageService Methods Reference

| Method | Description |
|---|---|
| `sendText(jid, text, opts?)` | Plain text with optional mentions/context |
| `sendImage(jid, source, opts?)` | Image with caption, viewOnce support |
| `sendVideo(jid, source, opts?)` | Video with caption, GIF, PTV support |
| `sendAudio(jid, source, opts?)` | Audio with PTT (voice note) support |
| `sendDocument(jid, source, opts)` | Document with fileName & mimetype |
| `sendSticker(jid, source, opts?)` | Sticker with animated support |
| `sendButton(jid, opts)` | Interactive buttons (native flow) |
| `sendList(jid, opts)` | List message with sections |
| `sendCard(jid, opts)` | Carousel/card message |
| `sendInteractive(jid, opts)` | Raw interactive (proto-level) |
| `sendAlbum(jid, media[], opts?)` | Media group (album) |
| `sendForward(jid, msg, opts?)` | Forward a message |
| `sendQuoted(jid, content, quotedMsg)` | Reply to a message |
| `sendViewOnce(jid, content, opts?)` | View-once media |
| `sendMention(jid, text, mentions[], opts?)` | Text with @mentions |
| `sendReaction(jid, key, emoji)` | React / unreact to a message |
| `sendLocation(jid, lat, lng, extra?, opts?)` | Location with name/address |
| `sendContact(jid, contacts[], opts?)` | Contact card(s) |
| `sendPoll(jid, name, values[], extra?, opts?)` | Poll creation |
| `deleteMessage(jid, key)` | Delete for everyone |
| `editMessage(jid, key, newText)` | Edit a sent message |
| `updateSocket(sock)` | Update socket after reconnection |

---

## ✏️ Message Modifications

### Delete Message (for everyone)
```javascript
const msg = await sock.sendMessage(jid, { text: 'hello' })
await sock.sendMessage(jid, { delete: msg.key })
```

### Edit Message
```javascript
await sock.sendMessage(jid, {
    text: 'Updated message text',
    edit: originalMessage.key
})
```

---

## 📥 Media Operations

### Download Media
```javascript
import { downloadMediaMessage, getContentType } from '@oblivinx/baileys'

sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0]
    if (!msg.message) return
    
    const messageType = getContentType(msg.message)
    
    if (messageType === 'imageMessage') {
        const buffer = await downloadMediaMessage(
            msg,
            'buffer',
            {},
            {
                logger: console,
                reuploadRequest: sock.updateMediaMessage
            }
        )
        fs.writeFileSync('./download.jpeg', buffer)
    }
})
```

### Re-upload Media
```javascript
await sock.updateMediaMessage(msg)
```

---

## 👥 Group Management

### Create Group
```javascript
const group = await sock.groupCreate('Group Name', [
    '1234567890@s.whatsapp.net',
    '0987654321@s.whatsapp.net'
])
console.log('Group created:', group.id)
```

### Add/Remove Participants
```javascript
await sock.groupParticipantsUpdate(groupJid, ['1234567890@s.whatsapp.net'], 'add')
await sock.groupParticipantsUpdate(groupJid, ['1234567890@s.whatsapp.net'], 'remove')
await sock.groupParticipantsUpdate(groupJid, ['1234567890@s.whatsapp.net'], 'promote')
await sock.groupParticipantsUpdate(groupJid, ['1234567890@s.whatsapp.net'], 'demote')
```

### Update Group Info
```javascript
await sock.groupUpdateSubject(groupJid, 'New Group Name')
await sock.groupUpdateDescription(groupJid, 'New group description')
```

### Group Settings
```javascript
await sock.groupSettingUpdate(groupJid, 'announcement')     // only admins send
await sock.groupSettingUpdate(groupJid, 'not_announcement')  // everyone sends
await sock.groupSettingUpdate(groupJid, 'locked')            // only admins edit info
await sock.groupSettingUpdate(groupJid, 'unlocked')          // everyone edits info
```

### Get Group Metadata
```javascript
const metadata = await sock.groupMetadata(groupJid)
console.log('Group:', metadata.subject)
console.log('Participants:', metadata.participants.length)
```

### Invite Code
```javascript
const code = await sock.groupInviteCode(groupJid)
console.log('Invite link:', `https://chat.whatsapp.com/${code}`)

// Revoke
const newCode = await sock.groupRevokeInvite(groupJid)

// Join via code
await sock.groupAcceptInvite('INVITE_CODE_HERE')

// Get invite info
const info = await sock.groupGetInviteInfo('INVITE_CODE')
```

### Leave Group
```javascript
await sock.groupLeave(groupJid)
```

---

## 📱 User Operations

### Check if Number Exists
```javascript
const [result] = await sock.onWhatsApp('1234567890')
if (result?.exists) console.log('Exists:', result.jid)
```

### Profile Picture
```javascript
const ppUrl = await sock.profilePictureUrl(jid)           // low res
const ppUrlHD = await sock.profilePictureUrl(jid, 'image') // high res

await sock.updateProfilePicture(jid, { url: './profile.jpg' })
await sock.removeProfilePicture(jid)
```

### Status & Profile
```javascript
const status = await sock.fetchStatus(jid)
await sock.updateProfileStatus('Available 24/7')
await sock.updateProfileName('NexusTech Bot')
```

### Business Profile
```javascript
const profile = await sock.getBusinessProfile(jid)
```

### Presence Updates
```javascript
await sock.presenceSubscribe(jid)
await sock.sendPresenceUpdate('composing', jid) // available, unavailable, composing, recording, paused
```

### Read Messages
```javascript
await sock.readMessages([message.key])
```

---

## 🔒 Privacy Controls

### Block/Unblock
```javascript
await sock.updateBlockStatus(jid, 'block')
await sock.updateBlockStatus(jid, 'unblock')
```

### Privacy Settings
```javascript
const settings = await sock.fetchPrivacySettings()

// Last seen: 'all', 'contacts', 'contact_blacklist', 'none'
await sock.updateLastSeenPrivacy('contacts')

// Online: 'all', 'match_last_seen'
await sock.updateOnlinePrivacy('all')

// Profile picture: 'all', 'contacts', 'contact_blacklist', 'none'
await sock.updateProfilePicturePrivacy('contacts')

// Status: 'all', 'contacts', 'contact_blacklist', 'none'
await sock.updateStatusPrivacy('contacts')

// Read receipts: 'all', 'none'
await sock.updateReadReceiptsPrivacy('all')

// Groups add: 'all', 'contacts', 'contact_blacklist'
await sock.updateGroupsAddPrivacy('contacts')
```

### Block List
```javascript
const blocklist = await sock.fetchBlocklist()
```

---

## 💬 Chat Operations

### Archive/Unarchive
```javascript
const lastMsg = await getLastMessageInChat(jid)
await sock.chatModify({ archive: true, lastMessages: [lastMsg] }, jid)
```

### Mute/Unmute
```javascript
await sock.chatModify({ mute: 8 * 60 * 60 * 1000 }, jid)  // mute 8h
await sock.chatModify({ mute: null }, jid)                  // unmute
```

### Pin/Unpin
```javascript
await sock.chatModify({ pin: true }, jid)
await sock.chatModify({ pin: false }, jid)
```

### Delete Chat
```javascript
const lastMsg = await getLastMessageInChat(jid)
await sock.chatModify({
    delete: true,
    lastMessages: [{
        key: lastMsg.key,
        messageTimestamp: lastMsg.messageTimestamp
    }]
}, jid)
```

### Mark Read/Unread
```javascript
await sock.chatModify({ markRead: true }, jid)
await sock.chatModify({ markRead: false }, jid)
```

---

## 📢 Broadcast & Stories

### Send Story/Status
```javascript
await sock.sendMessage('status@broadcast', {
    image: { url: './story.jpg' },
    caption: 'My story update!'
})
```

### Newsletter/Channel Management
```javascript
// Create
await sock.newsletterCreate('Newsletter Name', {
    description: 'Newsletter description',
    picture: buffer
})

// Update
await sock.newsletterUpdateMetadata(newsletterJid, {
    name: 'New Name',
    description: 'New description'
})

// Picture
await sock.newsletterUpdatePicture(newsletterJid, buffer)

// React
await sock.newsletterReactMessage(newsletterJid, messageId, '👍')

// Follow / Unfollow / Mute / Unmute
await sock.newsletterFollow(newsletterJid)
await sock.newsletterUnfollow(newsletterJid)
await sock.newsletterMute(newsletterJid)
await sock.newsletterUnmute(newsletterJid)
```

---

## 🧪 Advanced Features

### Query Message
```javascript
const msg = await sock.loadMessage(jid, messageId)
```

### Get Message Info
```javascript
const info = await sock.messageInfo(jid, messageId)
console.log('Read by:', info.readBy.length)
```

### App State Sync
```javascript
await sock.appPatch(['regular', 'critical_block', 'critical_unblock_low'])
```

---

## 🎯 Best Practices

### 1. Session Management
```javascript
const { state, saveCreds } = await useMultiFileAuthState('auth_folder')
const sock = makeWASocket({ auth: state })
sock.ev.on('creds.update', saveCreds)
```

### 2. Error Handling
```javascript
try {
    await sock.sendMessage(jid, { text: 'Hello' })
} catch (error) {
    if (error.output?.statusCode === 401) {
        console.log('Not authorized')
    } else {
        console.error('Send failed:', error)
    }
}
```

### 3. Reconnection Logic
```javascript
sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update
    if (connection === 'close') {
        const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut
        if (shouldReconnect) await connectToWhatsApp()
        else console.log('Logged out')
    }
})
```

### 4. Rate Limiting
```javascript
const queue = []
let sending = false

async function queueMessage(jid, message) {
    queue.push({ jid, message })
    if (!sending) processQueue()
}

async function processQueue() {
    sending = true
    while (queue.length > 0) {
        const { jid, message } = queue.shift()
        await sock.sendMessage(jid, message)
        await delay(1000)
    }
    sending = false
}
```

---

## 📝 Events Reference

```javascript
// Connection
'connection.update'
'creds.update'

// Messages
'messages.upsert'
'messages.update'
'messages.delete'
'message-receipt.update'

// Chats
'chats.set'
'chats.upsert'
'chats.update'
'chats.delete'

// Contacts
'contacts.set'
'contacts.upsert'
'contacts.update'

// Groups
'groups.upsert'
'groups.update'
'group-participants.update'

// Presence
'presence.update'

// Calls
'call'

// Blocklist
'blocklist.set'
'blocklist.update'
```

---

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

---

## ⚠️ Disclaimer

This project is **NOT** officially affiliated with WhatsApp or Meta. This is an independent project and should be used responsibly.

**Important**: 
- Follow WhatsApp's Terms of Service
- Don't spam or send unsolicited messages
- Respect user privacy
- Use for legitimate purposes only
- Be aware of WhatsApp's rate limits

---

## 🙏 Acknowledgments

- [WhiskeySockets](https://github.com/WhiskeySockets) for the original Baileys library
- All contributors who have helped improve this project
- The open-source community for their continuous support

---

## 📞 Support

- **Issues**: [WhatsApp Channel](https://whatsapp.com/channel/0029VaqiYrGA89MnsJJFnt43)
- **Discussions**: [WhatsApp Group](https://chat.whatsapp.com/D6ppdURh1v8He8mfxlzGjO)