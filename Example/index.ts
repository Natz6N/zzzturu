/**
 * Example — Baileys oblivinx 
 *
 * End-to-end runnable example demonstrating EVERY supported message type
 * through the centralized MessageService abstraction.
 *
 * Run with QR Code (default): npx tsx ./Example/index.ts
 * Run with Pairing Code: npx tsx ./Example/index.ts --use-pairing-code
 */

import { Boom } from '@hapi/boom'
import NodeCache from '@cacheable/node-cache'
import readline from 'readline'
import P from 'pino'
import fs from 'fs'
import qrcode from 'qrcode-terminal' // Import QR code terminal

import makeWASocket, {
	type AnyMessageContent,
	type CacheStore,
	delay,
	DisconnectReason,
	fetchLatestBaileysVersion,
	isJidNewsletter,
	makeCacheableSignalKeyStore,
	proto,
	useMultiFileAuthState,
	type WAMessageContent,
	type WAMessageKey,
	generateWAMessageFromContent
} from '../src'

// ─── Logger Setup ────────────────────────────────────────────────

const logger = P({
	level: 'debug',
	transport: {
		targets: [
			{
				target: 'pino-pretty',
				options: { colorize: true },
				level: 'debug'
			}
		]
	}
})

// ─── CLI Flags ───────────────────────────────────────────────────

const usePairingCode = process.argv.includes('--use-pairing-code')
const useQRCode = !usePairingCode // Default to QR code if pairing code not specified
const msgRetryCounterCache = new NodeCache() as CacheStore

const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
const question = (text: string) => new Promise<string>((resolve) => rl.question(text, resolve))

// ─── Main ────────────────────────────────────────────────────────

const startSock = async () => {
	const { state, saveCreds } = await useMultiFileAuthState('baileys_auth_info')
	const { version, isLatest } = await fetchLatestBaileysVersion()
	console.log(`using WA v${version.join('.')}, isLatest: ${isLatest}`)

	const sock = makeWASocket({
		version,
		logger,
		printQRInTerminal: useQRCode, // Enable QR code printing in terminal
		auth: {
			creds: state.creds,
			keys: makeCacheableSignalKeyStore(state.keys, logger)
		},
		msgRetryCounterCache,
		generateHighQualityLinkPreview: true,
		getMessage
	})

	// Pairing code flow
	if (usePairingCode && !sock.authState.creds.registered) {
		const phoneNumber = await question('Please enter your phone number:\n')
		const code = await sock.requestPairingCode(phoneNumber)
		console.log(`Pairing code: ${code}`)
	}

	// ─── Event Handlers ──────────────────────────────────────────

	sock.ev.process(async (events) => {
		// Connection management with auto-reconnect
		if (events['connection.update']) {
			const { connection, lastDisconnect, qr } = events['connection.update']

			// Display QR Code
			if (qr && useQRCode) {
				console.log('\n📱 Scan this QR code with your WhatsApp:')
				qrcode.generate(qr, { small: true })
				console.log('\nOr run with --use-pairing-code flag to use pairing code instead\n')
			}

			if (connection === 'close') {
				const shouldReconnect =
					(lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut
				if (shouldReconnect) {
					console.log('Connection closed, reconnecting...')
					startSock()
				} else {
					console.log('Connection closed. You are logged out.')
				}
			}

			if (connection === 'open') {
				console.log('✅ Connected successfully!')
				console.log('Send "help" to this number to see all message type demos.')
			}
		}

		// Save credentials on update
		if (events['creds.update']) {
			await saveCreds()
		}

		// ─── Message Handler ─────────────────────────────────────
		if (events['messages.upsert']) {
			const { messages, type } = events['messages.upsert']
			if (type !== 'notify') return

			for (const m of messages) {
				const text =
					m.message?.conversation ||
					m.message?.extendedTextMessage?.text ||
					''
				const jid = m.key.remoteJid!

				// Skip messages from self, newsletters, and empty text
				if (m.key.fromMe || isJidNewsletter(jid) || !text) continue

				const command = text.trim().toLowerCase()

				try {
					switch (command) {
						// ──────────────────────────────────────────
						// 1. TEXT MESSAGE
						// ──────────────────────────────────────────
						case 'test-text': {
							await sock.sendMessage(jid, { text: '📝 This is a plain text message sent via sock.sendMessage!' })
							break
						}

						// ──────────────────────────────────────────
						// 2. TEXT WITH MENTIONS
						// ──────────────────────────────────────────
						case 'test-mention': {
							const senderJid = m.key.participant || jid
							await sock.sendMessage(jid, {
								text: `👋 Hello @${senderJid.split('@')[0]}! You've been mentioned.`,
								mentions: [senderJid]
							})
							break
						}

						// ──────────────────────────────────────────
						// 3. QUOTED / REPLY MESSAGE
						// ──────────────────────────────────────────
						case 'test-reply': {
							await sock.sendMessage(
								jid,
								{ text: '↩️ This is a reply to your message!' },
								{ quoted: m }
							)
							break
						}

						// ──────────────────────────────────────────
						// 4. IMAGE MESSAGE
						// ──────────────────────────────────────────
						case 'test-image': {
							// Using a URL as the image source
							await sock.sendMessage(
								jid,
								{
									image: { url: 'https://picsum.photos/400/300' },
									caption: '🖼️ Image sent via sock.sendMessage!'
								},
								{ quoted: m }
							)
							break
						}

						// ──────────────────────────────────────────
						// 5. VIDEO MESSAGE
						// ──────────────────────────────────────────
						case 'test-video': {
							await sock.sendMessage(jid, { text: '🎬 To test video, place a video.mp4 in the Example folder and uncomment the code.' })
							// Uncomment the lines below when you have a video file:
							// await sock.sendMessage(
							//   jid,
							//   {
							//     video: { url: './Example/video.mp4' },
							//     caption: '🎬 Video sent via sock.sendMessage!'
							//   }
							// )
							break
						}

						// ──────────────────────────────────────────
						// 6. AUDIO / VOICE NOTE
						// ──────────────────────────────────────────
						case 'test-audio': {
							await sock.sendMessage(jid, { text: '🎵 To test audio, place an audio.ogg in the Example folder and uncomment the code.' })
							// Uncomment the lines below when you have an audio file:
							// await sock.sendMessage(
							//   jid,
							//   {
							//     audio: { url: './Example/audio.ogg' },
							//     ptt: true,
							//     mimetype: 'audio/mp4'
							//   }
							// )
							break
						}

						// ──────────────────────────────────────────
						// 7. DOCUMENT MESSAGE
						// ──────────────────────────────────────────
						case 'test-document': {
							await sock.sendMessage(jid, { text: '📄 To test document, place a file.pdf in the Example folder and uncomment the code.' })
							// Uncomment the lines below when you have a document:
							// await sock.sendMessage(
							//   jid,
							//   {
							//     document: { url: './Example/file.pdf' },
							//     mimetype: 'application/pdf',
							//     fileName: 'sample-document.pdf',
							//     caption: '📄 Document sent via sock.sendMessage!'
							//   }
							// )
							break
						}

						// ──────────────────────────────────────────
						// 8. STICKER MESSAGE
						// ──────────────────────────────────────────
						case 'test-sticker': {
							await sock.sendMessage(jid, { text: '🏷️ To test sticker, place a sticker.webp in the Example folder and uncomment the code.' })
							// Uncomment the lines below when you have a sticker:
							// await sock.sendMessage(jid, { sticker: { url: './Example/sticker.webp' } })
							break
						}

						// ──────────────────────────────────────────
						// 9. BUTTON MESSAGE (Interactive Native Flow)
						// ──────────────────────────────────────────
						case 'test-button': {
							await sock.sendMessage(jid, {
								interactiveMessage: {
									text: '🔘 Choose an option below:',
									footer: 'Powered by sock.sendMessage',
									buttons: [
										{
											name: 'quick_reply',
											buttonParamsJson: JSON.stringify({
												display_text: '👍 Option A',
												id: 'option_a'
											})
										},
										{
											name: 'quick_reply',
											buttonParamsJson: JSON.stringify({
												display_text: '👎 Option B',
												id: 'option_b'
											})
										},
										{
											name: 'cta_url',
											buttonParamsJson: JSON.stringify({
												display_text: '🌐 Visit Website',
												url: 'https://github.com'
											})
										}
									]
								}
							}, { quoted: m })
							break
						}

						// ──────────────────────────────────────────
						// 10. BUTTON WITH IMAGE HEADER
						// ──────────────────────────────────────────
						case 'test-button-image': {
							await sock.sendMessage(jid, {
								interactiveMessage: {
									title: 'Product Showcase',
									caption: '🖼️ Check out this item!',
									footer: 'oblivinx Store',
									image: { url: 'https://picsum.photos/400/300' },
									buttons: [
										{
											name: 'quick_reply',
											buttonParamsJson: JSON.stringify({
												display_text: '🛒 Add to Cart',
												id: 'add_cart'
											})
										},
										{
											name: 'quick_reply',
											buttonParamsJson: JSON.stringify({
												display_text: '❤️ Wishlist',
												id: 'wishlist'
											})
										}
									]
								}
							})
							break
						}

						// ──────────────────────────────────────────
						// 11. LIST MESSAGE
						// ──────────────────────────────────────────
						case 'test-list': {
							await sock.sendMessage(jid, {
								interactiveMessage: {
									title: '📋 Restaurant Menu',
									text: 'Browse our delicious selections below!',
									footer: 'Tap the button to see the menu',
									buttonText: '🍽️ View Menu',
									sections: [
										{
											title: '🍕 Main Course',
											rows: [
												{
													id: 'pizza_margherita',
													title: 'Pizza Margherita',
													description: 'Classic Italian with fresh mozzarella - $12'
												},
												{
													id: 'pasta_carbonara',
													title: 'Pasta Carbonara',
													description: 'Creamy egg-based sauce with pancetta - $14'
												},
												{
													id: 'grilled_salmon',
													title: 'Grilled Salmon',
													description: 'Fresh Atlantic salmon with herbs - $18'
												}
											]
										},
										{
											title: '🥤 Beverages',
											rows: [
												{
													id: 'espresso',
													title: 'Espresso',
													description: 'Strong Italian coffee - $4'
												},
												{
													id: 'fresh_juice',
													title: 'Fresh Orange Juice',
													description: 'Freshly squeezed - $5'
												}
											]
										},
										{
											title: '🍰 Desserts',
											rows: [
												{
													id: 'tiramisu',
													title: 'Tiramisu',
													description: 'Classic coffee-flavored Italian dessert - $8'
												}
											]
										}
									]
								}
							}, { quoted: m })
							break
						}

						// ──────────────────────────────────────────
						// 12. ALBUM / MEDIA GROUP
						// ──────────────────────────────────────────
						case 'test-album': {
							await sock.sendMessage(jid, {
								album: [
									{
										image: { url: 'https://picsum.photos/seed/album1/400/300' },
										caption: '📸 Photo 1 of the album'
									},
									{
										image: { url: 'https://picsum.photos/seed/album2/400/300' },
										caption: '📸 Photo 2 of the album'
									},
									{
										image: { url: 'https://picsum.photos/seed/album3/400/300' }
									}
								] as any, // Cast to any if AlbumMedia type mismatch
								caption: '🖼️ My Photo Album'
							})
							break
						}

						// ──────────────────────────────────────────
						// 13. FORWARD MESSAGE
						// ──────────────────────────────────────────
						case 'test-forward': {
							// Forward the user's own message back to them
							await sock.sendMessage(jid, { forward: m }, { force: true } as any) // Type might be strict
							break
						}

						// ──────────────────────────────────────────
						// 14. VIEW-ONCE MESSAGE
						// ──────────────────────────────────────────
						case 'test-viewonce': {
							await sock.sendMessage(jid, {
								image: { url: 'https://picsum.photos/400/300' },
								caption: '👁️ This is a view-once image!',
								viewOnce: true
							})
							break
						}

						// ──────────────────────────────────────────
						// 15. LOCATION MESSAGE
						// ──────────────────────────────────────────
						case 'test-location': {
							await sock.sendMessage(
								jid,
								{
									location: {
										degreesLatitude: -6.2088,
										degreesLongitude: 106.8456,
										name: 'Jakarta City Center',
										address: 'Jakarta, Indonesia'
									}
								}
							)
							break
						}

						// ──────────────────────────────────────────
						// 16. CONTACT CARD
						// ──────────────────────────────────────────
						case 'test-contact': {
							await sock.sendMessage(jid, {
								contacts: {
									displayName: 'John Doe',
									contacts: [
										{
											vcard:
												'BEGIN:VCARD\n' +
												'VERSION:3.0\n' +
												'FN:John Doe\n' +
												'TEL;type=CELL;type=VOICE;waid=628123456789:+628123456789\n' +
												'END:VCARD'
										}
									]
								}
							})
							break
						}

						// ──────────────────────────────────────────
						// 17. POLL MESSAGE
						// ──────────────────────────────────────────
						case 'test-poll': {
							await sock.sendMessage(
								jid,
								{
									poll: {
										name: '📊 What is your favorite programming language?',
										values: ['TypeScript', 'Python', 'Rust', 'Go', 'Java'],
										selectableCount: 2
									}
								}
							)
							break
						}

						// ──────────────────────────────────────────
						// 18. REACTION
						// ──────────────────────────────────────────
						case 'test-reaction': {
							// React to the user's message
							await sock.sendMessage(jid, { react: { text: '🚀', key: m.key } })
							await delay(2000)
							// Then change the reaction
							await sock.sendMessage(jid, { react: { text: '❤️', key: m.key } })
							break
						}

						// ──────────────────────────────────────────
						// 19. EDIT MESSAGE
						// ──────────────────────────────────────────
						case 'test-edit': {
							const sent = await sock.sendMessage(jid, { text: '✏️ This message will be edited in 3 seconds...' })
							await delay(3000)
							if (sent) await sock.sendMessage(jid, { edit: sent.key, text: '✅ Message has been edited successfully!' })
							break
						}

						// ──────────────────────────────────────────
						// 20. CARD / CAROUSEL MESSAGE
						// ──────────────────────────────────────────
						case 'test-card': {
							await sock.sendMessage(jid, {
								interactiveMessage: {
									text: '🎠 Swipe through our featured items:',
									footer: 'oblivinx Carousel Demo',
									cards: [
										{
											image: { url: 'https://picsum.photos/seed/card1/400/300' },
											caption: '🌟 Featured Item 1',
											buttons: [
												{
													name: 'quick_reply',
													buttonParamsJson: JSON.stringify({
														display_text: 'Select Item 1',
														id: 'card_select_1'
													})
												}
											]
										},
										{
											image: { url: 'https://picsum.photos/seed/card2/400/300' },
											caption: '🌟 Featured Item 2',
											buttons: [
												{
													name: 'quick_reply',
													buttonParamsJson: JSON.stringify({
														display_text: 'Select Item 2',
														id: 'card_select_2'
													})
												}
											]
										},
										{
											image: { url: 'https://picsum.photos/seed/card3/400/300' },
											caption: '🌟 Featured Item 3',
											buttons: [
												{
													name: 'quick_reply',
													buttonParamsJson: JSON.stringify({
														display_text: 'Select Item 3',
														id: 'card_select_3'
													})
												}
											]
										}
									]
								}
							}, { quoted: m })
							break
						}

						// ──────────────────────────────────────────
						// 21. INTERACTIVE MESSAGE (Raw)
						// ──────────────────────────────────────────
						case 'test-interactive': {
							// Using relayMessage to bypass messages-send.ts helper logic and send raw interactive message
							// generateWAMessageContent validation fails for top-level viewOnceMessage/interactiveMessage
							// so we manually construct the message and relay it.

							const msg = generateWAMessageFromContent(
								jid,
								{
									viewOnceMessage: {
										message: {
											interactiveMessage: {
												body: { text: '🔧 Raw Interactive Message via NativeFlow' },
												footer: { text: 'Advanced sock.sendMessage Demo' },
												nativeFlowMessage: {
													buttons: [
														{
															name: 'cta_url',
															buttonParamsJson: JSON.stringify({
																display_text: '📖 Documentation',
																url: 'https://github.com/WhiskeySockets/Baileys'
															})
														},
														{
															name: 'cta_copy',
															buttonParamsJson: JSON.stringify({
																display_text: '📋 Copy Code',
																copy_code: 'npm install @natz/baileys'
															})
														},
														{
															name: 'quick_reply',
															buttonParamsJson: JSON.stringify({
																display_text: '✅ Got it!',
																id: 'dismiss'
															})
														}
													]
												}
											}
										}
									}
								},
								{ userJid: sock.user?.id! }
							)

							await sock.relayMessage(jid, msg.message!, { messageId: msg.key.id! })
							break
						}

						// ──────────────────────────────────────────
						// HELP
						// ──────────────────────────────────────────
						case 'help': {
							await sock.sendMessage(jid, {
								text: [
									'╔════════════════════════════════════╗',
									'║  🤖 *oblivinx MessageService Demo*  ║',
									'╚════════════════════════════════════╝',
									'',
									'Send any of these commands:',
									'',
									'📝 *test-text* — Plain text message',
									'👋 *test-mention* — Text with @mention',
									'↩️ *test-reply* — Quoted reply message',
									'🖼️ *test-image* — Image with caption',
									'🎬 *test-video* — Video message (needs file)',
									'🎵 *test-audio* — Audio / voice note (needs file)',
									'📄 *test-document* — Document (needs file)',
									'🏷️ *test-sticker* — Sticker (needs file)',
									'🔘 *test-button* — Interactive buttons',
									'🖼️ *test-button-image* — Buttons with image',
									'📋 *test-list* — List / menu message',
									'📸 *test-album* — Album / media group',
									'↗️ *test-forward* — Forward message',
									'👁️ *test-viewonce* — View-once media',
									'📍 *test-location* — Location message',
									'👤 *test-contact* — Contact card',
									'📊 *test-poll* — Poll message',
									'🚀 *test-reaction* — React to message',
									'✏️ *test-edit* — Edit a sent message',
									'🎠 *test-card* — Carousel card message',
									'🔧 *test-interactive* — Raw interactive msg',
								].join('\n')
							})
							break
						}

						default: {
							// Only respond to known commands
							break
						}
					}
				} catch (err: any) {
					console.error(`Error handling command "${command}":`, err)
					await sock.sendMessage(jid, { text: `❌ Error: ${err.message}` }).catch(() => { })
				}
			}
		}
	})

	return sock

	async function getMessage(key: WAMessageKey): Promise<WAMessageContent | undefined> {
		return proto.Message.create({ conversation: 'retry-placeholder' })
	}
}

// ─── Start ───────────────────────────────────────────────────────
startSock().catch(console.error)