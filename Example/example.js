const {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  proto,
  generateMessageIDV2,
  getContentType,
  normalizeMessageContent
} = require("../lib")

const TEST_JID = process.env.TEST_JID
const TEST_GROUP_JID = process.env.TEST_GROUP_JID
const TEST_NEWSLETTER_JID = process.env.TEST_NEWSLETTER_JID
const RUN_TESTS = process.env.RUN_TESTS === "1"
const AUTO_ECHO = process.env.AUTO_ECHO === "1"

const SAMPLE_IMAGE = process.env.TEST_IMAGE || "https://picsum.photos/300/200"
const SAMPLE_VIDEO = process.env.TEST_VIDEO || "https://sample-videos.com/video321/mp4/720/big_buck_bunny_720p_1mb.mp4"
const SAMPLE_AUDIO = process.env.TEST_AUDIO || "https://sample-videos.com/audio/mp3/crowd-cheering.mp3"
const SAMPLE_DOC = process.env.TEST_DOC || "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf"
const SAMPLE_STICKER = process.env.TEST_STICKER || "https://i.imgur.com/0KFBHTB.webp"

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

let restartTimer
let restarting = false

const getTextFromMessage = (msg) => {
  const content = normalizeMessageContent(msg?.message)
  if (!content) return ""
  const type = getContentType(content)
  if (!type) return ""

  if (type === "conversation") return content.conversation || ""
  if (type === "extendedTextMessage") return content.extendedTextMessage?.text || ""
  if (type === "imageMessage") return content.imageMessage?.caption || ""
  if (type === "videoMessage") return content.videoMessage?.caption || ""
  if (type === "buttonsResponseMessage") return content.buttonsResponseMessage?.selectedButtonId || ""
  if (type === "listResponseMessage") {
    return (
      content.listResponseMessage?.singleSelectReply?.selectedRowId ||
      content.listResponseMessage?.title ||
      ""
    )
  }
  if (type === "templateButtonReplyMessage") return content.templateButtonReplyMessage?.selectedId || ""
  return ""
}

const runSendMessageTests = async (sock, targetJid) => {
  const jid = targetJid || TEST_JID
  if (!jid) {
    console.warn("Set TEST_JID or run .run in a chat to run sendMessage tests")
    return
  }

  const tests = []

  tests.push(async () => {
    const msg = await sock.sendMessage(jid, { text: "[TEST] Text message" })
    await delay(700)
    await sock.sendMessage(jid, { text: "[TEST] Reply message" }, { quoted: msg })
    await delay(700)
    await sock.sendMessage(jid, { react: { text: "🔥", key: msg.key } })
    await delay(700)
    await sock.sendMessage(jid, { edit: msg.key, text: "[TEST] Edited text" })
    await delay(700)
    await sock.sendMessage(jid, { delete: msg.key })
  })

  tests.push(async () => {
    await sock.sendMessage(jid, { text: "[TEST] AI message", ai: true })
  })

  tests.push(async () => {
    await sock.sendMessage(jid, { text: "[TEST] Mention", mentions: [jid] })
  })

  tests.push(async () => {
    await sock.sendMessage(jid, {
      image: { url: SAMPLE_IMAGE },
      caption: "[TEST] Image"
    })
  })

  tests.push(async () => {
    await sock.sendMessage(jid, {
      video: { url: SAMPLE_VIDEO },
      caption: "[TEST] Video"
    })
  })

  tests.push(async () => {
    await sock.sendMessage(jid, {
      audio: { url: SAMPLE_AUDIO },
      mimetype: "audio/mpeg"
    })
  })

  tests.push(async () => {
    await sock.sendMessage(jid, {
      document: { url: SAMPLE_DOC },
      mimetype: "application/pdf",
      fileName: "mebaileys-test.pdf"
    })
  })

  tests.push(async () => {
    await sock.sendMessage(jid, {
      sticker: { url: SAMPLE_STICKER }
    })
  })

  tests.push(async () => {
    await sock.sendMessage(jid, {
      location: {
        degreesLatitude: 37.422,
        degreesLongitude: -122.084,
        name: "Googleplex",
        address: "1600 Amphitheatre Pkwy, Mountain View"
      }
    })
  })

  tests.push(async () => {
    await sock.sendMessage(jid, {
      contacts: {
        displayName: "MeBaileys Test",
        contacts: [
          {
            vcard: "BEGIN:VCARD\nVERSION:3.0\nFN:MeBaileys Test\nTEL;type=CELL;type=VOICE;waid=628123456789:+62 812-3456-789\nEND:VCARD"
          }
        ]
      }
    })
  })

  tests.push(async () => {
    await sock.sendMessage(jid, {
      poll: {
        name: "[TEST] Poll",
        values: ["Red", "Blue", "Green"],
        selectableCount: 1
      }
    })
  })

  tests.push(async () => {
    const buttons = [
      { buttonId: "btn1", buttonText: { displayText: "Click Me" }, type: 1 },
      { buttonId: "btn2", buttonText: { displayText: "Visit Site" }, type: 1 }
    ]
    await sock.sendMessage(jid, {
      text: "[TEST] Buttons",
      footer: "MeBaileys",
      buttons,
      headerType: 1
    })
  })

  tests.push(async () => {
    const album = [
      { image: { url: SAMPLE_IMAGE }, caption: "[TEST] Album image" },
      { video: { url: SAMPLE_VIDEO } }
    ]
    await sock.sendMessage(jid, { album, caption: "[TEST] Album" })
  })

  tests.push(async () => {
    await sock.sendMessage(jid, {
      image: { url: SAMPLE_IMAGE },
      caption: "[TEST] View once",
      viewOnce: true
    })
  })

  tests.push(async () => {
    await sock.sendMessage(
      jid,
      { text: "[TEST] Ephemeral 1 hour" },
      { ephemeralExpiration: 60 * 60 }
    )
  })

  tests.push(async () => {
    const message = proto.Message.fromObject({
      conversation: "[TEST] Raw proto message"
    })
    const messageId = generateMessageIDV2(sock.user?.id)
    await sock.relayMessage(jid, message, { messageId })
  })

  tests.push(async () => {
    const message = proto.Message.fromObject({
      extendedTextMessage: {
        text: "[TEST] Raw proto extendedTextMessage",
        canonicalUrl: "https://example.com"
      }
    })
    const messageId = generateMessageIDV2(sock.user?.id)
    await sock.relayMessage(jid, message, { messageId })
  })

  tests.push(async () => {
    const base = await sock.sendMessage(jid, { text: "[TEST] Pin/Keep base" })
    await delay(700)

    // pin for 24h
    await sock.sendMessage(jid, { pin: base.key, type: 1, time: 24 * 60 * 60 })
    await delay(700)

    // keep message
    await sock.sendMessage(jid, { keep: base.key, type: 1 })
  })

  if (TEST_GROUP_JID) {
    tests.push(async () => {
      await sock.sendMessage(TEST_GROUP_JID, { text: "[TEST] Group message" })
    })
  }

  if (TEST_NEWSLETTER_JID) {
    tests.push(async () => {
      await sock.newsletterReactMessage(TEST_NEWSLETTER_JID, "1", "🔥")
    })
  }

  for (const [index, run] of tests.entries()) {
    try {
      console.log(`Running test ${index + 1}/${tests.length}`)
      await run()
      await delay(1200)
    } catch (error) {
      console.error(`Test ${index + 1} failed:`, error?.message || error)
    }
  }
}

const start = async () => {
  const { state, saveCreds } = await useMultiFileAuthState("./auth_info")
  const { version } = await fetchLatestBaileysVersion()

  const sock = await makeWASocket({
    version,
    printQRInTerminal: true,
    auth: state
  }, "example")

  sock.ev.on("creds.update", saveCreds)

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    try {
      if (type !== "notify") return
      const msg = messages?.[0]
      if (!msg?.message) return
      if (msg.key?.fromMe) return

      const remoteJid = msg.key.remoteJid
      const text = (getTextFromMessage(msg) || "").trim()
      if (!remoteJid || !text) return

      const cmd = text.toLowerCase()

      if (cmd === ".ping") {
        await sock.sendMessage(remoteJid, { text: "pong" }, { quoted: msg })
        return
      }

      if (cmd === ".menu" || cmd === ".help") {
        await sock.sendMessage(
          remoteJid,
          {
            text:
              "Commands:\n" +
              ".ping\n" +
              ".run (run sendMessage tests)\n" +
              ".proto (send raw proto message)\n" +
              ".id (show jid info)"
          },
          { quoted: msg }
        )
        return
      }

      if (cmd === ".id") {
        await sock.sendMessage(
          remoteJid,
          { text: `remoteJid: ${remoteJid}\nfromMe: ${msg.key?.fromMe}\nid: ${msg.key?.id}` },
          { quoted: msg }
        )
        return
      }

      if (cmd === ".proto") {
        const message = proto.Message.fromObject({
          conversation: "[TEST] Raw proto message (from command)"
        })
        const messageId = generateMessageIDV2(sock.user?.id)
        await sock.relayMessage(remoteJid, message, { messageId })
        return
      }

      if (cmd === ".run") {
        await sock.sendMessage(remoteJid, { text: "Running tests..." }, { quoted: msg })
        runSendMessageTests(sock, remoteJid).catch((err) => {
          console.error("SendMessage tests failed:", err)
        })
        return
      }

      if (AUTO_ECHO) {
        await sock.sendMessage(remoteJid, { text: `You said: ${text}` }, { quoted: msg })
      }
    } catch (err) {
      console.error("messages.upsert handler error:", err)
    }
  })

  let testsStarted = false

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update

    if (qr) {
      console.log("QR ready, scan it with WhatsApp")
    }

    if (connection === "close") {
      const statusCode = lastDisconnect?.error?.output?.statusCode
      const isRestartRequired = statusCode === DisconnectReason.restartRequired || statusCode === 515
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut

      console.log("Connection closed:", statusCode, "reconnect:", shouldReconnect)
      if (shouldReconnect) {
        if (restartTimer) clearTimeout(restartTimer)
        if (!restarting) {
          restarting = true
          const delayMs = isRestartRequired ? 3000 : 0
          restartTimer = setTimeout(() => {
            restarting = false
            start().catch((err) => console.error("Restart failed:", err))
          }, delayMs)
        }
      }
    } else if (connection === "open") {
      console.log("Connected")
      restarting = false
      if (restartTimer) {
        clearTimeout(restartTimer)
        restartTimer = undefined
      }
      if (RUN_TESTS && !testsStarted) {
        testsStarted = true
        runSendMessageTests(sock).catch((err) => {
          console.error("SendMessage tests failed:", err)
        })
      }
    }
  })
}

start().catch((err) => {
  console.error("Failed to start:", err)
})