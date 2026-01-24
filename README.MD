

<img  src="https://i.pinimg.com/originals/f7/8a/03/f78a0369ac804cd9276d73ec37b6b3e8.gif"  width="100%"  />

  

<div  align="center">

  

# Powered by Oblivinx

  

<em>

A custom-built WhatsApp library engineered on top of Baileys —

redesigned with a strong focus on scalability, modular architecture,

performance optimization, and long-term maintainability.

  

Crafted to deliver a clean developer experience while remaining flexible

enough for complex, real-world automation and bot systems.

</em>

  

<br  /><br  />

  

<em>

Custom WhatsApp library built upon Baileys — enhanced, modernized, and elegant.

</em>

  

<br  /><br  />

  

<img  src="https://img.shields.io/badge/Username-Natz6N-blueviolet?logo=github&logoColor=white"  />

<img  src="https://img.shields.io/badge/Role-Software%20Engineer-success"  />

<img  src="https://img.shields.io/badge/Specialty-Bot%20Architect-orange"  />

<img  src="https://img.shields.io/badge/Focus-Scalable%20Systems-informational"  />

  

</div>

  

---

  

> [!CAUTION]

>  **Natz/Baileys**

> The previous channel was banned due to an administrative error.

> All updates and announcements have been moved to the new channel.

  

---

  

## 📌 Overview

  

>  **Natz/Baileys** is a refined extension of the Baileys library, offering a cleaner API and exclusive features such as:

>  - Album messaging

>  - Newsletter (Channel) control

>  - Full-size profile uploads

>

> Built specifically for modern WhatsApp automation needs.

  

### 🔔 Updates

All update announcements and changelogs are published exclusively on the **official WhatsApp channel** (see links below).

  

---

  

## 📦 Installation

  

### Option 1 — Via `package.json` (Fork Replacement)

  

Fork from:

-  `@whiskeysockets/baileys`

-  `@adiwajshing/baileys`

  

```json

{

"dependencies": {

"@whiskeysockets/baileys": "github:Natz6N/zzzturu"

}

}

````

  

```json

{

"dependencies": {

"@adiwajshing/baileys": "github:Natz6N/zzzturu"

}

}

```

  

---

  

### Option 2 — Direct Install (No Fork)

  

```bash

npm  install  @whiskeysockets/baileys@github:Natz6N/zzzturu

```

  

```bash

npm  install  @adiwajshing/baileys@github:Natz6N/zzzturu

```

  

---

  

## 📥 Importing

  

### ESM

  

```js

import  makeWASocket  from  '@whiskeysockets/baileys'

```

  

### CommonJS

  

```js

const { default: makeWASocket } = require('@whiskeysockets/baileys')

```

  

---

  

## 🌟 Key Features

  

| Category | Description |

| ------------------- | ------------------------------------------------- |

| 📢 Channels | Send and manage WhatsApp Channel messages |

| 🖱️ Buttons | Interactive messages with buttons & quick replies |

| 🖼️ Albums | Send grouped images/videos as album messages |

| 👤 LID Grouping | Support latest `@lid` addressing style |

| 🤖 AI Message Style | Optional AI-style message indicator |

| 📷 HD Profile Pics | Upload uncropped, full-size profile photos |

| 🔐 Pairing Code | Custom alphanumeric pairing codes |

| 🛠️ Dev Experience | Reduced log noise & optimized output |

  

---

  

## 🚀 Features & Usage

  

### 📬 Newsletter Control

  

Manage WhatsApp Channels from creation to message interaction.

  

<details>

<summary><strong>View Example</strong></summary>

  

```js

await  sock.newsletterCreate("Oblivinx Updates")

  

await  sock.newsletterUpdateDescription(

"Oblivinx@newsletter",

"Fresh updates weekly"

)

  

await  sock.newsletterReactMessage(

"Oblivinx@newsletter",

"175",

"🔥"

)

```

  

</details>

  

---

  

### 📌 Interactive Messaging

  

Send interactive messages using buttons.

  

<details>

<summary><strong>View Example</strong></summary>

  

```js

const  buttons = [

{ buttonId:  "btn1", buttonText: { displayText:  "Click Me" }, type:  1 },

{ buttonId:  "btn2", buttonText: { displayText:  "Visit Site" }, type:  1 }

]

  

await  sock.sendMessage(id, {

text:  "Choose one:",

footer:  "Powered by Natz6N",

buttons,

headerType:  1

})

```

  

</details>

  

---

  

### 🖼️ Send Album

  

Send multiple media items as a single album message.

  

<details>

<summary><strong>View Example</strong></summary>

  

```js

const  media = [

{ image: { url:  "https://example.com/pic1.jpg" } },

{ video: { url:  "https://example.com/clip.mp4" } }

]

  

await  sock.sendMessage(id, {

album:  media,

caption:  "Memories 💫"

})

```

  

</details>

  

---

  

### 🔐 Custom Pairing Code

  

Pair devices using custom pairing codes.

  

<details>

<summary><strong>View Example</strong></summary>

  

```js

const  code = await  sock.requestPairingCode(

"62xxxxxxxxxx",

"NATZ01"

)

  

console.log("Pairing Code:", code)

```

  

</details>

  

---

  

### 📊 Poll Creation

  

Create polls inside chats or groups.

  

<details>

<summary><strong>View Example</strong></summary>

  

```js

await  sock.sendMessage(id, {

poll: {

name:  "Favorite Color?",

values: ["Red", "Blue", "Green"],

selectableCount:  1

}

})

```

  

</details>

  

---

  

### 📍 Location Sharing

  

Share detailed location data.

  

<details>

<summary><strong>View Example</strong></summary>

  

```js

await  sock.sendMessage(id, {

location: {

degreesLatitude:  37.422,

degreesLongitude: -122.084,

name:  "Googleplex",

address:  "1600 Amphitheatre Pkwy, Mountain View"

}

})

```

  

</details>

  

---

  

### 👥 Group Management

  

Manage WhatsApp groups programmatically.

  

```js

const  group = await  sock.groupCreate(

"My New Group",

[number1, number2]

)

  

await  sock.groupAdd(group.id, [number3])

await  sock.groupUpdateDescription(

group.id,

"This is our awesome group!"

)

```

  

---

  

## 🐞 Found a Bug?

  

If you encounter any issues:

  

* 📌 Open an Issue (coming soon)

* 💬 Contact the maintainer via WhatsApp

  

---

  

> [!CAUTION]

> Built on top of **WhiskeySockets/Baileys**.

> All original core logic credits go to their team.

>  **Natz/Baileys** extends it with UX & DX improvements.

  

---

  

## 🙌 Contributors

  

Thanks to all contributors who help improve this project 💖

Community-driven, maintained with care.