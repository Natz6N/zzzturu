import NodeCache from '@cacheable/node-cache'
import { Boom } from '@hapi/boom'
import P from 'pino'
import readline from 'readline'
import makeWASocket, {
	CacheStore,
	DisconnectReason,
	fetchLatestBaileysVersion,
	makeCacheableSignalKeyStore,
	proto,
	useMultiFileAuthState,
	WAMessageKey
} from '../src'

const logger = P({ level: 'info' })
const msgRetryCounterCache = new NodeCache() as CacheStore
const rl = readline.createInterface({ input: process.stdin, output: process.stdout })

const question = (text: string) => new Promise<string>(resolve => rl.question(text, resolve))

// Parse command line arguments
const args = process.argv.slice(2)
const useQR = args.includes('--qr')
const usePairingCode = args.includes('--pairing-code')

const startSock = async () => {
	const { state, saveCreds } = await useMultiFileAuthState('baileys_auth_info')
	const { version, isLatest } = await fetchLatestBaileysVersion()
	console.log(`using WA v${version.join('.')}, isLatest: ${isLatest}`)

	const sock = makeWASocket({
		version,
		logger,
		printQRInTerminal: useQR,
		auth: {
			creds: state.creds,
			keys: makeCacheableSignalKeyStore(state.keys, logger)
		},
		msgRetryCounterCache
	})

	let hasPrompted = false
	let lastSentKey: WAMessageKey | undefined

	sock.ev.process(async events => {
		if (events['connection.update']) {
			const { connection, lastDisconnect, qr } = events['connection.update']
			
			// Handle QR code display
			if (qr && useQR) {
				console.log('QR Code received, scan with WhatsApp app')
                // qrcode.generate(qr, { small: true })
			}

			// Handle pairing code
			if (connection === 'open' && usePairingCode && !state.creds.registered) {
				const phoneNumber = await question('Enter your phone number (with country code, e.g., 628xxx): ')
				const code = await sock.requestPairingCode(phoneNumber.trim())
				console.log(`Pairing code: ${code}`)
			}

			if (connection === 'close') {
				if ((lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut) {
					startSock()
				} else {
					console.log('Connection closed. You are logged out.')
				}
			}
			
			if (connection === 'open' && !hasPrompted) {
				hasPrompted = true
				console.log('Connected successfully!')
				await runExample(sock, key => {
					lastSentKey = key
				}, () => lastSentKey)
			}
		}

		if (events['creds.update']) {
			await saveCreds()
		}
	})

	// Request pairing code after socket is ready
	if (usePairingCode && !state.creds.registered) {
		setTimeout(async () => {
			if (!sock.authState.creds.registered) {
				const phoneNumber = await question('Enter your phone number (with country code, e.g., 628xxx): ')
				const code = await sock.requestPairingCode(phoneNumber.trim())
				console.log(`Pairing code: ${code}`)
			}
		}, 3000)
	}
}

const runExample = async (
	sock: ReturnType<typeof makeWASocket>,
	setLastKey: (key: WAMessageKey) => void,
	getLastKey: () => WAMessageKey | undefined
) => {
	const jid = (await question('Target JID (ex: 628xxx@s.whatsapp.net): ')).trim()
	const mode = (await question(
		'Choose test: text | button | card | album | ai | keep | pin | edit | delete | poll\n> '
	)).trim().toLowerCase()

	switch (mode) {
		case 'text': {
			const msg = await sock.sendMessage(jid, { text: 'Hello from example index.ts' })
			setLastKey(msg.key)
			break
		}
		case 'button': {
			const msg = await sock.sendButton(jid, {
				text: 'Pilih tombol di bawah',
				footer: 'Baileys Switch Test',
				buttons: [
					{
						id: 'btn_1',
						text: 'Tombol 1'
					},
					{
						id: 'btn_2',
						text: 'Tombol 2'
					}
				]
			})
			setLastKey(msg.key)
			break
		}
		case 'card': {
			const msg = await sock.sendCard(jid, {
				text: 'Carousel test',
				footer: 'Baileys Switch Test',
				cards: [
					{
						caption: 'Card 1',
						image: 'https://picsum.photos/400/300?random=1',
						buttons: [
							{
								name: 'quick_reply',
								buttonParamsJson: JSON.stringify({ display_text: 'Card 1', id: 'card_1' })
							}
						]
					},
					{
						caption: 'Card 2',
						image: 'https://picsum.photos/400/300?random=2',
						buttons: [
							{
								name: 'quick_reply',
								buttonParamsJson: JSON.stringify({ display_text: 'Card 2', id: 'card_2' })
							}
						]
					}
				]
			})
			setLastKey(msg.key)
			break
		}
		case 'album': {
			const msg = await sock.sendMessage(jid, {
				caption: 'Album test',
				album: [
					{
						image: { url: 'https://picsum.photos/400/300?random=3' },
						caption: 'Image 1'
					},
					{
						image: { url: 'https://picsum.photos/400/300?random=4' },
						caption: 'Image 2'
					}
				]
			})
			setLastKey(msg.key)
			break
		}
		case 'ai': {
			const msg = await sock.sendMessage(jid, { text: 'AI flagged message', ai: true })
			setLastKey(msg.key)
			break
		}
		case 'keep': {
			const msg = await sock.sendMessage(jid, { text: 'Keep flagged message', keep: true })
			setLastKey(msg.key)
			break
		}
		case 'pin': {
			const key = getLastKey()
			if (!key) {
				console.log('Send a message first to have a key for pin.')
				break
			}
			const msg = await sock.sendMessage(jid, {
				pin: key,
				type: proto.PinInChat.Type.PIN_FOR_ALL,
				time: 86400
			})
			setLastKey(msg.key)
			break
		}
		case 'edit': {
			const key = getLastKey()
			if (!key) {
				console.log('Send a message first to have a key for edit.')
				break
			}
			const msg = await sock.sendMessage(jid, { text: 'Edited message text', edit: key })
			setLastKey(msg.key)
			break
		}
		case 'delete': {
			const key = getLastKey()
			if (!key) {
				console.log('Send a message first to have a key for delete.')
				break
			}
			const msg = await sock.sendMessage(jid, { delete: key })
			setLastKey(msg.key)
			break
		}
		case 'poll': {
			const msg = await sock.sendMessage(jid, {
				poll: {
					name: 'Pilih opsi',
					values: ['Option A', 'Option B'],
					selectableCount: 1
				}
			})
			setLastKey(msg.key)
			break
		}
		default:
			console.log('Unknown option. Please rerun and choose a valid test.')
			break
	}

	rl.close()
}

// Display usage info
if (!useQR && !usePairingCode) {
	console.log('Usage:')
	console.log('  npm start -- --qr              (use QR code authentication)')
	console.log('  npm start -- --pairing-code    (use pairing code authentication)')
	console.log('\nDefaulting to QR code mode...\n')
}

startSock()