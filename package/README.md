### Haruka Library
<p align="center">
<img src="https://api.ryuu-dev.offc.my.id/src/assest/bot/Haruka.jpg" width="400" alt="Haruka-Lib">


<b>Powerful & Lightweight WhatsApp Bot Library Extension</b>
</p>

# How to use
``` bash
npm install @ryuu-reinzz/haruka-lib@1.0.15
```

*how to use it in JavaScript:*
``` javascript 
import haruka from "@ryuu-reinzz/haruka-lib";
import makeWASocket, {
  proto,
  generateWAMessageFromContent,
  jidDecode,
  downloadContentFromMessage,
  prepareWAMessageMedia,
  generateMessageID,
  generateWAMessage
} from '@ryuu-reinzz/baileys';

const property =  {
  proto,
  generateWAMessageFromContent,
  jidDecode,
  downloadContentFromMessage,
  prepareWAMessageMedia,
  generateMessageID,
  generateWAMessage
};

const conn = makeWASocket({});
haruka.addProperty(conn, store, smsg, property);
```

## 1. Send Button
*Digunakan untuk mengirim button message ke WhatsApp jika baileys bawaan tidak mendukung*

``` javascript 
conn.sendButton(m.chat, { 
  caption: "Haruka here!",
  image: { url: global.thumbnail }, 
  footer: global.ownername,
  buttons: [
{ 
  name: "cta_url",
  buttonParamsJson: JSON.stringify({
     display_text: "View Link",
     url: global.thumbnail
  })
 }
]
});
```
Hasil Output:
<img src="https://api.ryuu-dev.offc.my.id/src/assest/Haruhime/sendButton.jpg" width="300" />

## 2. Send Order
*Digunakan untuk membuat tampilan pesanan profesional atau sekedar prank orderan.*

``` javascript 
conn.sendOrder(m.chat, {
  orderId: "ORDER-" + Date.now(),
  thumbnail: global.thumbnail,
  itemCount: 15,
  status: 1,
  surface: 1,
  orderTitle: "Premium Subscription",
  message: "Zahlea botz",
  sellerJid: conn.user.jid,
  totalAmount1000: 500000000,
  totalCurrencyCode: "IDR"
}, { quoted: m, mentions: [m.sender] });
```
Hasil Output:
<img src="https://api.ryuu-dev.offc.my.id/src/assest/Haruhime/sendOrder.jpg" width="300" />

## 3. Send Album
*Cocok untuk mengirim katalog produk atau galeri foto tanpa memenuhi chat.*

``` javascript 
conn.sendAlbum(m.chat, [
  { image: { url: global.thumbnail }, caption: "Gambar 1" },
  { image: { url: global.thumbnail }, caption: "Gambar 2" },
  { image: fs.readFileSync("./image.jpg"), caption: "Stiker lucu" }
], { quoted: m }); 
``` 
Hasil Output:
<img src="https://api.ryuu-dev.offc.my.id/src/assest/Haruhime/sendAlbum.jpg" width="300" />

## 4. Send Card (Carousel)
*Fitur tercanggih untuk membuat menu bot yang bisa digeser (slide) ke samping.*

``` javascript 
conn.sendCard(m.chat, {
  text: "Bot Thumbnail",
  footer: "© Ryuu Reinzz",
  quoted: m,
  sender: m.sender,
  cards: [
    {
      image: global.thumbnail,
      caption: "Thumbnail 1",
      buttons: [{ name: "cta_url", buttonParamsJson: JSON.stringify({ display_text: "Visit", url: "https://google.com" }) }]
    }
  ]
});
```
## Hasil Output:
<img src="https://api.ryuu-dev.offc.my.id/src/assest/Haruhime/sendCard.jpg" width="300" />

## 5. Custom Sticker
*Buat stiker langsung dengan identitas bot kamu sendiri.*

``` javascript 
conn.sendSticker(m.chat, {
  sticker: "./stiker/apa-woi.webp",
  packname: "Haruka Bot",
  author: "@ryuu-reinzz"
});
```
## Hasil Output:
<img src="https://api.ryuu-dev.offc.my.id/src/assest/Haruhime/sendSticker.jpg" width="200" />

## 6. ID Mapping (LID to PN and PN to LID)
*Mencari LID atau Phone Number*

``` javascript
// Mencari LID dari nomor HP
await conn.getLidFromPN(m, "6288246552068@s.whatsapp.net");

// Mencari nomor HP dari LID
await conn.getPNFromLid(m, "129459441135829@lid");
```
### Hasil Output:
<img src="https://api.ryuu-dev.offc.my.id/src/assest/Haruhime/mapping.jpg" width="300" />
