import NodeCache from '@cacheable/node-cache'
import { Boom } from '@hapi/boom'
import { randomBytes } from 'crypto'
import { proto } from '../../WAProto/index.js'
import { DEFAULT_CACHE_TTLS, WA_DEFAULT_EPHEMERAL } from '../Defaults/index.js'
import type {
	AnyMessageContent,
	AlbumMedia,
	MediaConnInfo,
	MessageReceiptType,
	MessageRelayOptions,
	MiscMessageGenerationOptions,
	SocketConfig,
	WAMessage,
	WAMessageKey
} from '../Types/index.js'
import {
	aggregateMessageKeysNotFromMe,
	assertMediaContent,
	bindWaitForEvent,
	decryptMediaRetryData,
	encodeNewsletterMessage,
	encodeSignedDeviceIdentity,
	encodeWAMessage,
	encryptMediaRetryRequest,
	extractDeviceJids,
	generateMessageIDV2,
	generateParticipantHashV2,
	generateWAMessageFromContent,
	generateWAMessage,
	getStatusCodeForMediaRetry,
	getUrlFromDirectPath,
	getWAUploadToServer,
	MessageRetryManager,
	normalizeMessageContent,
	parseAndInjectE2ESessions,
	prepareWAMessageMedia,
	unixTimestampSeconds
} from '../Utils/index.js'
import { getUrlInfo } from '../Utils/link-preview.js'
import { makeKeyedMutex } from '../Utils/make-mutex.js'
import {
	areJidsSameUser,
	type BinaryNode,
	type BinaryNodeAttributes,
	type FullJid,
	getBinaryNodeChild,
	getBinaryNodeChildren,
	isHostedLidUser,
	isHostedPnUser,
	isJidGroup,
	isJidNewsletter,
	isLidUser,
	isPnUser,
	jidDecode,
	jidEncode,
	jidNormalizedUser,
	type JidWithDevice,
	S_WHATSAPP_NET
} from '../WABinary/index.js'
import { USyncQuery, USyncUser } from '../WAUSync/index.js'
import { makeNewsletterSocket } from './newsletter.js'

export const makeMessagesSocket = (config: SocketConfig) => {
	const {
		logger,
		linkPreviewImageThumbnailWidth,
		generateHighQualityLinkPreview,
		options: httpRequestOptions,
		patchMessageBeforeSending,
		cachedGroupMetadata,
		enableRecentMessageCache,
		maxMsgRetryCount
	} = config
	const sock = makeNewsletterSocket(config)
	const {
		ev,
		authState,
		processingMutex,
		signalRepository,
		upsertMessage,
		query,
		fetchPrivacySettings,
		sendNode,
		groupMetadata,
		groupToggleEphemeral
	} = sock

	const userDevicesCache =
		config.userDevicesCache ||
		new NodeCache<JidWithDevice[]>({
			stdTTL: DEFAULT_CACHE_TTLS.USER_DEVICES, // 5 minutes
			useClones: false
		})

	const peerSessionsCache = new NodeCache<boolean>({
		stdTTL: DEFAULT_CACHE_TTLS.USER_DEVICES,
		useClones: false
	})

	// Initialize message retry manager if enabled
	const messageRetryManager = enableRecentMessageCache ? new MessageRetryManager(logger, maxMsgRetryCount) : null

	// Prevent race conditions in Signal session encryption by user
	const encryptionMutex = makeKeyedMutex()

	let mediaConn: Promise<MediaConnInfo>
	const refreshMediaConn = async (forceGet = false) => {
		const media = await mediaConn
		if (!media || forceGet || new Date().getTime() - media.fetchDate.getTime() > media.ttl * 1000) {
			mediaConn = (async () => {
				const result = await query({
					tag: 'iq',
					attrs: {
						type: 'set',
						xmlns: 'w:m',
						to: S_WHATSAPP_NET
					},
					content: [{ tag: 'media_conn', attrs: {} }]
				})
				const mediaConnNode = getBinaryNodeChild(result, 'media_conn')!
				// TODO: explore full length of data that whatsapp provides
				const node: MediaConnInfo = {
					hosts: getBinaryNodeChildren(mediaConnNode, 'host').map(({ attrs }) => ({
						hostname: attrs.hostname!,
						maxContentLengthBytes: +attrs.maxContentLengthBytes!
					})),
					auth: mediaConnNode.attrs.auth!,
					ttl: +mediaConnNode.attrs.ttl!,
					fetchDate: new Date()
				}
				logger.debug('fetched media conn')
				return node
			})()
		}

		return mediaConn
	}

	/**
	 * generic send receipt function
	 * used for receipts of phone call, read, delivery etc.
	 * */
	const sendReceipt = async (
		jid: string,
		participant: string | undefined,
		messageIds: string[],
		type: MessageReceiptType
	) => {
		if (!messageIds || messageIds.length === 0) {
			throw new Boom('missing ids in receipt')
		}

		const node: BinaryNode = {
			tag: 'receipt',
			attrs: {
				id: messageIds[0]!
			}
		}
		const isReadReceipt = type === 'read' || type === 'read-self'
		if (isReadReceipt) {
			node.attrs.t = unixTimestampSeconds().toString()
		}

		if (type === 'sender' && (isPnUser(jid) || isLidUser(jid))) {
			node.attrs.recipient = jid
			node.attrs.to = participant!
		} else {
			node.attrs.to = jid
			if (participant) {
				node.attrs.participant = participant
			}
		}

		if (type) {
			node.attrs.type = type
		}

		const remainingMessageIds = messageIds.slice(1)
		if (remainingMessageIds.length) {
			node.content = [
				{
					tag: 'list',
					attrs: {},
					content: remainingMessageIds.map(id => ({
						tag: 'item',
						attrs: { id }
					}))
				}
			]
		}

		logger.debug({ attrs: node.attrs, messageIds }, 'sending receipt for messages')
		await sendNode(node)
	}

	/** Correctly bulk send receipts to multiple chats, participants */
	const sendReceipts = async (keys: WAMessageKey[], type: MessageReceiptType) => {
		const recps = aggregateMessageKeysNotFromMe(keys)
		for (const { jid, participant, messageIds } of recps) {
			await sendReceipt(jid, participant, messageIds, type)
		}
	}

	/** Bulk read messages. Keys can be from different chats & participants */
	const readMessages = async (keys: WAMessageKey[]) => {
		const privacySettings = await fetchPrivacySettings()
		// based on privacy settings, we have to change the read type
		const readType = privacySettings.readreceipts === 'all' ? 'read' : 'read-self'
		await sendReceipts(keys, readType)
	}

	/** Device info with wire JID */
	type DeviceWithJid = JidWithDevice & {
		jid: string
	}

	/** Fetch all the devices we've to send a message to */
	const getUSyncDevices = async (
		jids: string[],
		useCache: boolean,
		ignoreZeroDevices: boolean
	): Promise<DeviceWithJid[]> => {
		const deviceResults: DeviceWithJid[] = []

		if (!useCache) {
			logger.debug('not using cache for devices')
		}

		const toFetch: string[] = []

		const jidsWithUser = jids
			.map(jid => {
				const decoded = jidDecode(jid)
				const user = decoded?.user
				const device = decoded?.device
				const isExplicitDevice = typeof device === 'number' && device >= 0

				if (isExplicitDevice && user) {
					deviceResults.push({
						user,
						device,
						jid
					})
					return null
				}

				jid = jidNormalizedUser(jid)
				return { jid, user }
			})
			.filter(jid => jid !== null)

		let mgetDevices: undefined | Record<string, FullJid[] | undefined>

		if (useCache && userDevicesCache.mget) {
			const usersToFetch = jidsWithUser.map(j => j?.user).filter(Boolean) as string[]
			mgetDevices = await userDevicesCache.mget(usersToFetch)
		}

		for (const { jid, user } of jidsWithUser) {
			if (useCache) {
				const devices =
					mgetDevices?.[user!] ||
					(userDevicesCache.mget ? undefined : ((await userDevicesCache.get(user!)) as FullJid[]))
				if (devices) {
					const devicesWithJid = devices.map(d => ({
						...d,
						jid: jidEncode(d.user, d.server, d.device)
					}))
					deviceResults.push(...devicesWithJid)

					logger.trace({ user }, 'using cache for devices')
				} else {
					toFetch.push(jid)
				}
			} else {
				toFetch.push(jid)
			}
		}

		if (!toFetch.length) {
			return deviceResults
		}

		const requestedLidUsers = new Set<string>()
		for (const jid of toFetch) {
			if (isLidUser(jid) || isHostedLidUser(jid)) {
				const user = jidDecode(jid)?.user
				if (user) requestedLidUsers.add(user)
			}
		}

		const query = new USyncQuery().withContext('message').withDeviceProtocol().withLIDProtocol()

		for (const jid of toFetch) {
			query.withUser(new USyncUser().withId(jid)) // todo: investigate - the idea here is that <user> should have an inline lid field with the lid being the pn equivalent
		}

		const result = await sock.executeUSyncQuery(query)

		if (result) {
			// TODO: LID MAP this stuff (lid protocol will now return lid with devices)
			const lidResults = result.list.filter(a => !!a.lid)
			if (lidResults.length > 0) {
				logger.trace('Storing LID maps from device call')
				await signalRepository.lidMapping.storeLIDPNMappings(lidResults.map(a => ({ lid: a.lid as string, pn: a.id })))

				// Force-refresh sessions for newly mapped LIDs to align identity addressing
				try {
					const lids = lidResults.map(a => a.lid as string)
					if (lids.length) {
						await assertSessions(lids, true)
					}
				} catch (e) {
					logger.warn({ e, count: lidResults.length }, 'failed to assert sessions for newly mapped LIDs')
				}
			}

			const extracted = extractDeviceJids(
				result?.list,
				authState.creds.me!.id,
				authState.creds.me!.lid!,
				ignoreZeroDevices
			)
			const deviceMap: { [_: string]: FullJid[] } = {}

			for (const item of extracted) {
				deviceMap[item.user] = deviceMap[item.user] || []
				deviceMap[item.user]?.push(item)
			}

			// Process each user's devices as a group for bulk LID migration
			for (const [user, userDevices] of Object.entries(deviceMap)) {
				const isLidUser = requestedLidUsers.has(user)

				// Process all devices for this user
				for (const item of userDevices) {
					const finalJid = isLidUser
						? jidEncode(user, item.server, item.device)
						: jidEncode(item.user, item.server, item.device)

					deviceResults.push({
						...item,
						jid: finalJid
					})

					logger.debug(
						{
							user: item.user,
							device: item.device,
							finalJid,
							usedLid: isLidUser
						},
						'Processed device with LID priority'
					)
				}
			}

			if (userDevicesCache.mset) {
				// if the cache supports mset, we can set all devices in one go
				await userDevicesCache.mset(Object.entries(deviceMap).map(([key, value]) => ({ key, value })))
			} else {
				for (const key in deviceMap) {
					if (deviceMap[key]) await userDevicesCache.set(key, deviceMap[key])
				}
			}

			const userDeviceUpdates: { [userId: string]: string[] } = {}
			for (const [userId, devices] of Object.entries(deviceMap)) {
				if (devices && devices.length > 0) {
					userDeviceUpdates[userId] = devices.map(d => d.device?.toString() || '0')
				}
			}

			if (Object.keys(userDeviceUpdates).length > 0) {
				try {
					await authState.keys.set({ 'device-list': userDeviceUpdates })
					logger.debug(
						{ userCount: Object.keys(userDeviceUpdates).length },
						'stored user device lists for bulk migration'
					)
				} catch (error) {
					logger.warn({ error }, 'failed to store user device lists')
				}
			}
		}

		return deviceResults
	}

	const assertSessions = async (jids: string[], force?: boolean) => {
		let didFetchNewSession = false
		const uniqueJids = [...new Set(jids)] // Deduplicate JIDs
		const jidsRequiringFetch: string[] = []

		logger.debug({ jids }, 'assertSessions call with jids')

		// Check peerSessionsCache and validate sessions using libsignal loadSession
		for (const jid of uniqueJids) {
			const signalId = signalRepository.jidToSignalProtocolAddress(jid)
			const cachedSession = peerSessionsCache.get(signalId)
			if (cachedSession !== undefined) {
				if (cachedSession && !force) {
					continue // Session exists in cache
				}
			} else {
				const sessionValidation = await signalRepository.validateSession(jid)
				const hasSession = sessionValidation.exists
				peerSessionsCache.set(signalId, hasSession)
				if (hasSession && !force) {
					continue
				}
			}

			jidsRequiringFetch.push(jid)
		}

		if (jidsRequiringFetch.length) {
			// LID if mapped, otherwise original
			const wireJids = [
				...jidsRequiringFetch.filter(jid => !!isLidUser(jid) || !!isHostedLidUser(jid)),
				...(
					(await signalRepository.lidMapping.getLIDsForPNs(
						jidsRequiringFetch.filter(jid => !!isPnUser(jid) || !!isHostedPnUser(jid))
					)) || []
				).map(a => a.lid)
			]

			logger.debug({ jidsRequiringFetch, wireJids }, 'fetching sessions')
			const result = await query({
				tag: 'iq',
				attrs: {
					xmlns: 'encrypt',
					type: 'get',
					to: S_WHATSAPP_NET
				},
				content: [
					{
						tag: 'key',
						attrs: {},
						content: wireJids.map(jid => {
							const attrs: { [key: string]: string } = { jid }
							if (force) attrs.reason = 'identity'
							return { tag: 'user', attrs }
						})
					}
				]
			})
			await parseAndInjectE2ESessions(result, signalRepository)
			didFetchNewSession = true

			// Cache fetched sessions using wire JIDs
			for (const wireJid of wireJids) {
				const signalId = signalRepository.jidToSignalProtocolAddress(wireJid)
				peerSessionsCache.set(signalId, true)
			}
		}

		return didFetchNewSession
	}

	const sendPeerDataOperationMessage = async (
		pdoMessage: proto.Message.IPeerDataOperationRequestMessage
	): Promise<string> => {
		//TODO: for later, abstract the logic to send a Peer Message instead of just PDO - useful for App State Key Resync with phone
		if (!authState.creds.me?.id) {
			throw new Boom('Not authenticated')
		}

		const protocolMessage: proto.IMessage = {
			protocolMessage: {
				peerDataOperationRequestMessage: pdoMessage,
				type: proto.Message.ProtocolMessage.Type.PEER_DATA_OPERATION_REQUEST_MESSAGE
			}
		}

		const meJid = jidNormalizedUser(authState.creds.me.id)

		const msgId = await relayMessage(meJid, protocolMessage, {
			additionalAttributes: {
				category: 'peer',

				push_priority: 'high_force'
			},
			additionalNodes: [
				{
					tag: 'meta',
					attrs: { appdata: 'default' }
				}
			]
		})

		return msgId
	}

	const createParticipantNodes = async (
		recipientJids: string[],
		message: proto.IMessage,
		extraAttrs?: BinaryNode['attrs'],
		dsmMessage?: proto.IMessage
	) => {
		if (!recipientJids.length) {
			return { nodes: [] as BinaryNode[], shouldIncludeDeviceIdentity: false }
		}

		const patched = await patchMessageBeforeSending(message, recipientJids)
		const patchedMessages = Array.isArray(patched)
			? patched
			: recipientJids.map(jid => ({ recipientJid: jid, message: patched }))

		let shouldIncludeDeviceIdentity = false
		const meId = authState.creds.me!.id
		const meLid = authState.creds.me?.lid
		const meLidUser = meLid ? jidDecode(meLid)?.user : null

		const encryptionPromises = (patchedMessages as any).map(
			async ({ recipientJid: jid, message: patchedMessage }: any) => {
				if (!jid) return null
				let msgToEncrypt = patchedMessage
				if (dsmMessage) {
					const { user: targetUser } = jidDecode(jid)!
					const { user: ownPnUser } = jidDecode(meId)!
					const ownLidUser = meLidUser
					const isOwnUser = targetUser === ownPnUser || (ownLidUser && targetUser === ownLidUser)
					const isExactSenderDevice = jid === meId || (meLid && jid === meLid)
					if (isOwnUser && !isExactSenderDevice) {
						msgToEncrypt = dsmMessage
						logger.debug({ jid, targetUser }, 'Using DSM for own device')
					}
				}

				const bytes = encodeWAMessage(msgToEncrypt)
				const mutexKey = jid
				const node = await encryptionMutex.mutex(mutexKey, async () => {
					const { type, ciphertext } = await signalRepository.encryptMessage({
						jid,
						data: bytes
					})
					if (type === 'pkmsg') {
						shouldIncludeDeviceIdentity = true
					}

					return {
						tag: 'to',
						attrs: { jid },
						content: [
							{
								tag: 'enc',
								attrs: {
									v: '2',
									type,
									...(extraAttrs || {})
								},
								content: ciphertext
							}
						]
					}
				})
				return node
			}
		)

		const nodes = (await Promise.all(encryptionPromises)).filter(node => node !== null) as BinaryNode[]
		return { nodes, shouldIncludeDeviceIdentity }
	}

	const relayMessage = async (
		jid: string,
		message: proto.IMessage,
		{
			messageId: msgId,
			participant,
			additionalAttributes,
			additionalNodes,
			useUserDevicesCache,
			useCachedGroupMetadata,
			statusJidList
		}: MessageRelayOptions
	) => {
		const meId = authState.creds.me!.id
		const meLid = authState.creds.me?.lid
		const isRetryResend = Boolean(participant?.jid)
		let shouldIncludeDeviceIdentity = isRetryResend
		const statusJid = 'status@broadcast'

		const { user, server } = jidDecode(jid)!
		const isGroup = server === 'g.us'
		const isStatus = jid === statusJid
		const isLid = server === 'lid'
		const isNewsletter = server === 'newsletter'
		const isGroupOrStatus = isGroup || isStatus
		const finalJid = jid

		msgId = msgId || generateMessageIDV2(meId)
		useUserDevicesCache = useUserDevicesCache !== false
		useCachedGroupMetadata = useCachedGroupMetadata !== false && !isStatus

		const participants: BinaryNode[] = []
		const destinationJid = !isStatus ? finalJid : statusJid
		const binaryNodeContent: BinaryNode[] = []
		const devices: DeviceWithJid[] = []

		const meMsg: proto.IMessage = {
			deviceSentMessage: {
				destinationJid,
				message
			},
			messageContextInfo: message.messageContextInfo
		}

		const extraAttrs: BinaryNodeAttributes = {}

		if (participant) {
			if (!isGroup && !isStatus) {
				additionalAttributes = { ...additionalAttributes, device_fanout: 'false' }
			}

			const { user, device } = jidDecode(participant.jid)!
			devices.push({
				user,
				device,
				jid: participant.jid
			})
		}

		await authState.keys.transaction(async () => {
			const mediaType = getMediaType(message)
			if (mediaType) {
				extraAttrs['mediatype'] = mediaType
			}

			if (isNewsletter) {
				const patched = patchMessageBeforeSending ? await patchMessageBeforeSending(message, []) : message
				const bytes = encodeNewsletterMessage(patched as proto.IMessage)
				binaryNodeContent.push({
					tag: 'plaintext',
					attrs: {},
					content: bytes
				})
				const stanza: BinaryNode = {
					tag: 'message',
					attrs: {
						to: jid,
						id: msgId,
						type: getMessageType(message),
						...(additionalAttributes || {})
					},
					content: binaryNodeContent
				}
				logger.debug({ msgId }, `sending newsletter message to ${jid}`)
				await sendNode(stanza)
				return
			}

			if (normalizeMessageContent(message)?.pinInChatMessage) {
				extraAttrs['decrypt-fail'] = 'hide' // todo: expand for reactions and other types
			}

			if (isGroupOrStatus && !isRetryResend) {
				const [groupData, senderKeyMap] = await Promise.all([
					(async () => {
						let groupData = useCachedGroupMetadata && cachedGroupMetadata ? await cachedGroupMetadata(jid) : undefined // todo: should we rely on the cache specially if the cache is outdated and the metadata has new fields?
						if (groupData && Array.isArray(groupData?.participants)) {
							logger.trace({ jid, participants: groupData.participants.length }, 'using cached group metadata')
						} else if (!isStatus) {
							groupData = await groupMetadata(jid) // TODO: start storing group participant list + addr mode in Signal & stop relying on this
						}

						return groupData
					})(),
					(async () => {
						if (!participant && !isStatus) {
							// what if sender memory is less accurate than the cached metadata
							// on participant change in group, we should do sender memory manipulation
							const result = await authState.keys.get('sender-key-memory', [jid]) // TODO: check out what if the sender key memory doesn't include the LID stuff now?
							return result[jid] || {}
						}

						return {}
					})()
				])

				const participantsList = groupData ? groupData.participants.map(p => p.id) : []

				if (groupData?.ephemeralDuration && groupData.ephemeralDuration > 0) {
					additionalAttributes = {
						...additionalAttributes,
						expiration: groupData.ephemeralDuration.toString()
					}
				}

				if (isStatus && statusJidList) {
					participantsList.push(...statusJidList)
				}

				const additionalDevices = await getUSyncDevices(participantsList, !!useUserDevicesCache, false)
				devices.push(...additionalDevices)

				if (isGroup) {
					additionalAttributes = {
						...additionalAttributes,
						addressing_mode: groupData?.addressingMode || 'lid'
					}
				}

				const patched = await patchMessageBeforeSending(message)
				if (Array.isArray(patched)) {
					throw new Boom('Per-jid patching is not supported in groups')
				}

				const bytes = encodeWAMessage(patched)
				const groupAddressingMode = additionalAttributes?.['addressing_mode'] || groupData?.addressingMode || 'lid'
				const groupSenderIdentity = groupAddressingMode === 'lid' && meLid ? meLid : meId

				const { ciphertext, senderKeyDistributionMessage } = await signalRepository.encryptGroupMessage({
					group: destinationJid,
					data: bytes,
					meId: groupSenderIdentity
				})

				const senderKeyRecipients: string[] = []
				for (const device of devices) {
					const deviceJid = device.jid
					const hasKey = !!senderKeyMap[deviceJid]
					if (
						(!hasKey || !!participant) &&
						!isHostedLidUser(deviceJid) &&
						!isHostedPnUser(deviceJid) &&
						device.device !== 99
					) {
						//todo: revamp all this logic
						// the goal is to follow with what I said above for each group, and instead of a true false map of ids, we can set an array full of those the app has already sent pkmsgs
						senderKeyRecipients.push(deviceJid)
						senderKeyMap[deviceJid] = true
					}
				}

				if (senderKeyRecipients.length) {
					logger.debug({ senderKeyJids: senderKeyRecipients }, 'sending new sender key')

					const senderKeyMsg: proto.IMessage = {
						senderKeyDistributionMessage: {
							axolotlSenderKeyDistributionMessage: senderKeyDistributionMessage,
							groupId: destinationJid
						}
					}

					const senderKeySessionTargets = senderKeyRecipients
					await assertSessions(senderKeySessionTargets)

					const result = await createParticipantNodes(senderKeyRecipients, senderKeyMsg, extraAttrs)
					shouldIncludeDeviceIdentity = shouldIncludeDeviceIdentity || result.shouldIncludeDeviceIdentity

					participants.push(...result.nodes)
				}

				binaryNodeContent.push({
					tag: 'enc',
					attrs: { v: '2', type: 'skmsg', ...extraAttrs },
					content: ciphertext
				})

				await authState.keys.set({ 'sender-key-memory': { [jid]: senderKeyMap } })
			} else {
				// ADDRESSING CONSISTENCY: Match own identity to conversation context
				// TODO: investigate if this is true
				let ownId = meId
				if (isLid && meLid) {
					ownId = meLid
					logger.debug({ to: jid, ownId }, 'Using LID identity for @lid conversation')
				} else {
					logger.debug({ to: jid, ownId }, 'Using PN identity for @s.whatsapp.net conversation')
				}

				const { user: ownUser } = jidDecode(ownId)!

				if (!isRetryResend) {
					const targetUserServer = isLid ? 'lid' : 's.whatsapp.net'
					devices.push({
						user,
						device: 0,
						jid: jidEncode(user, targetUserServer, 0) // rajeh, todo: this entire logic is convoluted and weird.
					})

					if (user !== ownUser) {
						const ownUserServer = isLid ? 'lid' : 's.whatsapp.net'
						const ownUserForAddressing = isLid && meLid ? jidDecode(meLid)!.user : jidDecode(meId)!.user

						devices.push({
							user: ownUserForAddressing,
							device: 0,
							jid: jidEncode(ownUserForAddressing, ownUserServer, 0)
						})
					}

					if (additionalAttributes?.['category'] !== 'peer') {
						// Clear placeholders and enumerate actual devices
						devices.length = 0

						// Use conversation-appropriate sender identity
						const senderIdentity =
							isLid && meLid
								? jidEncode(jidDecode(meLid)?.user!, 'lid', undefined)
								: jidEncode(jidDecode(meId)?.user!, 's.whatsapp.net', undefined)

						// Enumerate devices for sender and target with consistent addressing
						const sessionDevices = await getUSyncDevices([senderIdentity, jid], true, false)
						devices.push(...sessionDevices)

						logger.debug(
							{
								deviceCount: devices.length,
								devices: devices.map(d => `${d.user}:${d.device}@${jidDecode(d.jid)?.server}`)
							},
							'Device enumeration complete with unified addressing'
						)
					}
				}

				const allRecipients: string[] = []
				const meRecipients: string[] = []
				const otherRecipients: string[] = []
				const { user: mePnUser } = jidDecode(meId)!
				const { user: meLidUser } = meLid ? jidDecode(meLid)! : { user: null }

				for (const { user, jid } of devices) {
					const isExactSenderDevice = jid === meId || (meLid && jid === meLid)
					if (isExactSenderDevice) {
						logger.debug({ jid, meId, meLid }, 'Skipping exact sender device (whatsmeow pattern)')
						continue
					}

					// Check if this is our device (could match either PN or LID user)
					const isMe = user === mePnUser || user === meLidUser

					if (isMe) {
						meRecipients.push(jid)
					} else {
						otherRecipients.push(jid)
					}

					allRecipients.push(jid)
				}

				await assertSessions(allRecipients)

				const [
					{ nodes: meNodes, shouldIncludeDeviceIdentity: s1 },
					{ nodes: otherNodes, shouldIncludeDeviceIdentity: s2 }
				] = await Promise.all([
					// For own devices: use DSM if available (1:1 chats only)
					createParticipantNodes(meRecipients, meMsg || message, extraAttrs),
					createParticipantNodes(otherRecipients, message, extraAttrs, meMsg)
				])
				participants.push(...meNodes)
				participants.push(...otherNodes)

				if (meRecipients.length > 0 || otherRecipients.length > 0) {
					extraAttrs['phash'] = generateParticipantHashV2([...meRecipients, ...otherRecipients])
				}

				shouldIncludeDeviceIdentity = shouldIncludeDeviceIdentity || s1 || s2
			}

			if (isRetryResend) {
				const isParticipantLid = isLidUser(participant!.jid)
				const isMe = areJidsSameUser(participant!.jid, isParticipantLid ? meLid : meId)

				const encodedMessageToSend = isMe
					? encodeWAMessage({
						deviceSentMessage: {
							destinationJid,
							message
						}
					})
					: encodeWAMessage(message)

				const { type, ciphertext: encryptedContent } = await signalRepository.encryptMessage({
					data: encodedMessageToSend,
					jid: participant!.jid
				})

				binaryNodeContent.push({
					tag: 'enc',
					attrs: {
						v: '2',
						type,
						count: participant!.count.toString()
					},
					content: encryptedContent
				})
			}

			if (participants.length) {
				if (additionalAttributes?.['category'] === 'peer') {
					const peerNode = participants[0]?.content?.[0] as BinaryNode
					if (peerNode) {
						binaryNodeContent.push(peerNode) // push only enc
					}
				} else {
					binaryNodeContent.push({
						tag: 'participants',
						attrs: {},

						content: participants
					})
				}
			}

			const stanza: BinaryNode = {
				tag: 'message',
				attrs: {
					id: msgId,
					to: destinationJid,
					type: getMessageType(message),
					...(additionalAttributes || {})
				},
				content: binaryNodeContent
			}

			// if the participant to send to is explicitly specified (generally retry recp)
			// ensure the message is only sent to that person
			// if a retry receipt is sent to everyone -- it'll fail decryption for everyone else who received the msg
			if (participant) {
				if (isJidGroup(destinationJid)) {
					stanza.attrs.to = destinationJid
					stanza.attrs.participant = participant.jid
				} else if (areJidsSameUser(participant.jid, meId)) {
					stanza.attrs.to = participant.jid
					stanza.attrs.recipient = destinationJid
				} else {
					stanza.attrs.to = participant.jid
				}
			} else {
				stanza.attrs.to = destinationJid
			}

			if (shouldIncludeDeviceIdentity) {
				; (stanza.content as BinaryNode[]).push({
					tag: 'device-identity',
					attrs: {},
					content: encodeSignedDeviceIdentity(authState.creds.account!, true)
				})

				logger.debug({ jid }, 'adding device identity')
			}

			const contactTcTokenData =
				!isGroup && !isRetryResend && !isStatus ? await authState.keys.get('tctoken', [destinationJid]) : {}

			const tcTokenBuffer = contactTcTokenData[destinationJid]?.token

			if (tcTokenBuffer) {
				; (stanza.content as BinaryNode[]).push({
					tag: 'tctoken',
					attrs: {},
					content: tcTokenBuffer
				})
			}

			if (additionalNodes && additionalNodes.length > 0) {
				; (stanza.content as BinaryNode[]).push(...additionalNodes)
			}

			logger.debug({ msgId }, `sending message to ${participants.length} devices`)

			await sendNode(stanza)

			// Add message to retry cache if enabled
			if (messageRetryManager && !participant) {
				messageRetryManager.addRecentMessage(destinationJid, msgId, message)
			}
		}, meId)

		return msgId
	}

	const getMessageType = (message: proto.IMessage) => {
		if (message.pollCreationMessage || message.pollCreationMessageV2 || message.pollCreationMessageV3) {
			return 'poll'
		}

		if (message.eventMessage) {
			return 'event'
		}

		if (getMediaType(message) !== '') {
			return 'media'
		}

		return 'text'
	}

	const getMediaType = (message: proto.IMessage) => {
		if (message.imageMessage) {
			return 'image'
		} else if (message.videoMessage) {
			return message.videoMessage.gifPlayback ? 'gif' : 'video'
		} else if (message.audioMessage) {
			return message.audioMessage.ptt ? 'ptt' : 'audio'
		} else if (message.contactMessage) {
			return 'vcard'
		} else if (message.documentMessage) {
			return 'document'
		} else if (message.contactsArrayMessage) {
			return 'contact_array'
		} else if (message.liveLocationMessage) {
			return 'livelocation'
		} else if (message.stickerMessage) {
			return 'sticker'
		} else if (message.listMessage) {
			return 'list'
		} else if (message.listResponseMessage) {
			return 'list_response'
		} else if (message.buttonsResponseMessage) {
			return 'buttons_response'
		} else if (message.orderMessage) {
			return 'order'
		} else if (message.productMessage) {
			return 'product'
		} else if (message.interactiveResponseMessage) {
			return 'native_flow_response'
		} else if (message.groupInviteMessage) {
			return 'url'
		}

		return ''
	}

	const getPrivacyTokens = async (jids: string[]) => {
		const t = unixTimestampSeconds().toString()
		const result = await query({
			tag: 'iq',
			attrs: {
				to: S_WHATSAPP_NET,
				type: 'set',
				xmlns: 'privacy'
			},
			content: [
				{
					tag: 'tokens',
					attrs: {},
					content: jids.map(jid => ({
						tag: 'token',
						attrs: {
							jid: jidNormalizedUser(jid),
							t,
							type: 'trusted_contact'
						}
					}))
				}
			]
		})

		return result
	}

	const waUploadToServer = getWAUploadToServer(config, refreshMediaConn)

	const waitForMsgMediaUpdate = bindWaitForEvent(ev, 'messages.media-update')

	return {
		...sock,
		getPrivacyTokens,
		assertSessions,
		relayMessage,
		sendReceipt,
		sendReceipts,
		readMessages,
		refreshMediaConn,
		waUploadToServer,
		fetchPrivacySettings,
		sendPeerDataOperationMessage,
		createParticipantNodes,
		getUSyncDevices,
		messageRetryManager,
		updateMediaMessage: async (message: WAMessage) => {
			const content = assertMediaContent(message.message)
			const mediaKey = content.mediaKey!
			const meId = authState.creds.me!.id
			const node = await encryptMediaRetryRequest(message.key, mediaKey, meId)

			let error: Error | undefined = undefined
			await Promise.all([
				sendNode(node),
				waitForMsgMediaUpdate(async update => {
					const result = update.find(c => c.key.id === message.key.id)
					if (result) {
						if (result.error) {
							error = result.error
						} else {
							try {
								const media = await decryptMediaRetryData(result.media!, mediaKey, result.key.id!)
								if (media.result !== proto.MediaRetryNotification.ResultType.SUCCESS) {
									const resultStr = proto.MediaRetryNotification.ResultType[media.result!]
									throw new Boom(`Media re-upload failed by device (${resultStr})`, {
										data: media,
										statusCode: getStatusCodeForMediaRetry(media.result!) || 404
									})
								}

								content.directPath = media.directPath
								content.url = getUrlFromDirectPath(content.directPath!)

								logger.debug({ directPath: media.directPath, key: result.key }, 'media update successful')
							} catch (err: any) {
								error = err
							}
						}

						return true
					}
				})
			])

			if (error) {
				throw error
			}

			ev.emit('messages.update', [{ key: message.key, update: { message: message.message } }])

			return message
		},
		sendMessage: async (jid: string, content: AnyMessageContent, options: MiscMessageGenerationOptions = {}) => {
			const userJid = authState.creds.me!.id
			if (!options.ephemeralExpiration && isJidGroup(jid)) {
				try {
					const metadata = await groupMetadata(jid)
					options.ephemeralExpiration = metadata?.ephemeralDuration || 0
				} catch (error) {
					logger?.debug({ error, jid }, 'failed to fetch group ephemeral settings')
				}
			}

			if (
				typeof content === 'object' &&
				'disappearingMessagesInChat' in content &&
				typeof content['disappearingMessagesInChat'] !== 'undefined' &&
				isJidGroup(jid)
			) {
				const { disappearingMessagesInChat } = content
				const value =
					typeof disappearingMessagesInChat === 'boolean'
						? disappearingMessagesInChat
							? WA_DEFAULT_EPHEMERAL
							: 0
						: disappearingMessagesInChat
				await groupToggleEphemeral(jid, value)
			}

			if (typeof content === 'object' && 'album' in content && content.album) {
				const { album, caption } = content as { album: AlbumMedia[]; caption?: string } & AnyMessageContent

				const firstAlbumItem = album[0]
				if (caption && firstAlbumItem && !firstAlbumItem.caption) {
					firstAlbumItem.caption = caption
				}

				const albumMsg = generateWAMessageFromContent(
					jid,
					{
						albumMessage: {
							expectedImageCount: album.filter(item => 'image' in item).length,
							expectedVideoCount: album.filter(item => 'video' in item).length
						}
					},
					{ userJid, ...options }
				)

				await relayMessage(jid, albumMsg.message!, { messageId: albumMsg.key.id! })

				for (const media of album) {
					let mediaMsg: WAMessage | undefined

					if ('image' in media) {
						mediaMsg = await generateWAMessage(
							jid,
							{
								image: media.image,
								...(media.caption ? { caption: media.caption } : {})
							},
							{
								userJid,
								upload: waUploadToServer,
								...options
							}
						)
					} else if ('video' in media) {
						mediaMsg = await generateWAMessage(
							jid,
							{
								video: media.video,
								...(media.caption ? { caption: media.caption } : {}),
								...(media.gifPlayback !== undefined ? { gifPlayback: media.gifPlayback } : {})
							},
							{
								userJid,
								upload: waUploadToServer,
								...options
							}
						)
					}

					if (mediaMsg) {
						mediaMsg.message!.messageContextInfo = {
							messageSecret: randomBytes(32),
							messageAssociation: {
								associationType: 1,
								parentMessageKey: albumMsg.key!
							}
						}

						await relayMessage(jid, mediaMsg.message!, { messageId: mediaMsg.key.id! })
						await new Promise(resolve => setTimeout(resolve, 800))
					}
				}

				return albumMsg
			}

			// â”€â”€ interactiveMessage: buttons, cards, lists â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
			if (typeof content === 'object' && 'interactiveMessage' in content && content.interactiveMessage) {
				const ic = content.interactiveMessage
				const mediaOptions = { upload: waUploadToServer, mediaCache: config.mediaCache, options: config.options, logger }

				// â”€â”€ List message path â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
				if (ic.sections && Array.isArray(ic.sections) && ic.sections.length > 0) {
					const listMessage: proto.Message.IListMessage = {
						title: ic.title || '',
						description: ic.text || ic.caption || '',
						buttonText: ic.buttonText || 'Menu',
						footerText: ic.footer || '',
						listType: proto.Message.ListMessage.ListType.SINGLE_SELECT,
						sections: ic.sections.map((section: any) => ({
							title: section.title || '',
							rows: Array.isArray(section.rows)
								? section.rows.map((row: any) => ({
									title: row.title || '',
									description: row.description || '',
									rowId: row.id || row.rowId || ''
								}))
								: []
						}))
					}

					const msg = generateWAMessageFromContent(
						jid,
						{ listMessage },
						{
							userJid,
							quoted: options?.quoted || undefined
						}
					)

					await relayMessage(jid, msg.message!, {
						messageId: msg.key.id!,
						additionalNodes: [
							{
								tag: 'biz',
								attrs: {},
								content: [
									{
										tag: 'list',
										attrs: { type: 'product_list', v: '2' }
									}
								]
							}
						]
					})

					return msg
				}

				// â”€â”€ Carousel / Card message path â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
				if (ic.cards && Array.isArray(ic.cards) && ic.cards.length > 0) {
					const carouselCards: proto.Message.InteractiveMessage.ICarouselMessage['cards'] = []

					const getImageMedia = async (image: any) => {
						if (!image) {
							throw new Error('Image cannot be empty')
						}

						if (typeof image === 'string') {
							return await prepareWAMessageMedia({ image: { url: image } }, mediaOptions)
						}

						if (Buffer.isBuffer(image)) {
							return await prepareWAMessageMedia({ image }, mediaOptions)
						}

						if (typeof image === 'object') {
							return await prepareWAMessageMedia({ image }, mediaOptions)
						}

						throw new Error('Unsupported image format')
					}

					for (let i = 0; i < ic.cards.length; i++) {
						const item = ic.cards[i]!
						const img = await getImageMedia(item.image)

						carouselCards.push({
							header: proto.Message.InteractiveMessage.Header.fromObject({
								title: item.caption || `Card ${i + 1}`,
								hasMediaAttachment: true,
								...img
							}),
							nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.fromObject({
								buttons: Array.isArray(item.buttons) ? item.buttons : []
							}),
							footer: proto.Message.InteractiveMessage.Footer.create({ text: ic.footer || '' })
						})
					}

					const msg = generateWAMessageFromContent(
						jid,
						{
							viewOnceMessage: {
								message: {
									messageContextInfo: {
										deviceListMetadata: {},
										deviceListMetadataVersion: 2
									},
									interactiveMessage: proto.Message.InteractiveMessage.fromObject({
										body: proto.Message.InteractiveMessage.Body.fromObject({ text: ic.text || '' }),
										carouselMessage: proto.Message.InteractiveMessage.CarouselMessage.fromObject({
											cards: carouselCards
										})
									})
								}
							}
						},
						{
							userJid,
							quoted: options?.quoted || undefined
						}
					)

					await relayMessage(jid, msg.message!, { messageId: msg.key.id! })
					return msg
				}

				// â”€â”€ Button / Interactive message path (default) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
				const {
					text: icText = '',
					caption: icCaption = '',
					title: icTitle = '',
					footer: icFooter = '',
					buttons: rawButtons = [],
					hasMediaAttachment: icHasMedia = false,
					image = null,
					video = null,
					document: doc = null,
					fileName = null,
					mimetype = null,
					jpegThumbnail = null,
					location = null,
					product = null,
					businessOwnerJid = null,
					externalAdReply = null,
					mentionedJid = null
				} = ic as any

				// Process buttons into native flow format
				const processedButtons: Array<{ name: string; buttonParamsJson: string }> = []
				if (Array.isArray(rawButtons)) {
					for (let i = 0; i < rawButtons.length; i++) {
						const btn = rawButtons[i]
						if (!btn || typeof btn !== 'object') {
							throw new Error(`interactiveButton[${i}] must be an object`)
						}

						if (btn.name && btn.buttonParamsJson) {
							processedButtons.push(btn)
							continue
						}

						if (btn.id || btn.text || btn.displayText) {
							processedButtons.push({
								name: 'quick_reply',
								buttonParamsJson: JSON.stringify({
									display_text: btn.text || btn.displayText || `Button ${i + 1}`,
									id: btn.id || `quick_${i + 1}`
								})
							})
							continue
						}

						if (btn.buttonId && btn.buttonText?.displayText) {
							processedButtons.push({
								name: 'quick_reply',
								buttonParamsJson: JSON.stringify({
									display_text: btn.buttonText.displayText,
									id: btn.buttonId
								})
							})
							continue
						}

						throw new Error(`interactiveButton[${i}] has invalid shape`)
					}
				}

				const messageContent: proto.Message.IInteractiveMessage = {}

				// Build header from media/location/product/title
				if (image) {
					const resolvedImage = Buffer.isBuffer(image)
						? image
						: typeof image === 'object' && image.url
							? { url: image.url }
							: typeof image === 'string'
								? { url: image }
								: image

					const preparedMedia = await prepareWAMessageMedia({ image: resolvedImage }, mediaOptions)
					messageContent.header = proto.Message.InteractiveMessage.Header.fromObject({
						title: icTitle || '',
						hasMediaAttachment: icHasMedia || true,
						imageMessage: preparedMedia.imageMessage
					})
				} else if (video) {
					const resolvedVideo = Buffer.isBuffer(video)
						? video
						: typeof video === 'object' && video.url
							? { url: video.url }
							: typeof video === 'string'
								? { url: video }
								: video

					const preparedMedia = await prepareWAMessageMedia({ video: resolvedVideo }, mediaOptions)
					messageContent.header = proto.Message.InteractiveMessage.Header.fromObject({
						title: icTitle || '',
						hasMediaAttachment: icHasMedia || true,
						videoMessage: preparedMedia.videoMessage
					})
				} else if (doc) {
					const resolvedDocument = Buffer.isBuffer(doc)
						? doc
						: typeof doc === 'object' && doc.url
							? { url: doc.url }
							: typeof doc === 'string'
								? { url: doc }
								: doc

					const mediaInput: any = {
						document: resolvedDocument,
						mimetype: mimetype || 'application/octet-stream'
					}
					if (fileName) {
						mediaInput.fileName = fileName
					}

					if (jpegThumbnail) {
						if (Buffer.isBuffer(jpegThumbnail)) {
							mediaInput.jpegThumbnail = jpegThumbnail
						} else if (typeof jpegThumbnail === 'string') {
							try {
								const response = await fetch(jpegThumbnail)
								const arrayBuffer = await response.arrayBuffer()
								mediaInput.jpegThumbnail = Buffer.from(arrayBuffer)
							} catch {
								// ignore
							}
						}
					}

					const preparedMedia = await prepareWAMessageMedia(mediaInput, mediaOptions)
					messageContent.header = proto.Message.InteractiveMessage.Header.fromObject({
						title: icTitle || '',
						hasMediaAttachment: icHasMedia || true,
						documentMessage: preparedMedia.documentMessage
					})
				} else if (location && typeof location === 'object') {
					messageContent.header = proto.Message.InteractiveMessage.Header.fromObject({
						title: icTitle || location.name || 'Location',
						hasMediaAttachment: icHasMedia || false,
						locationMessage: {
							degreesLatitude: (location as any).degressLatitude || location.degreesLatitude || 0,
							degreesLongitude: (location as any).degressLongitude || location.degreesLongitude || 0,
							name: location.name || '',
							address: location.address || ''
						}
					})
				} else if (product && typeof product === 'object') {
					let productImageMessage = null
					if (product.productImage) {
						const resolvedProductImage = Buffer.isBuffer(product.productImage)
							? product.productImage
							: typeof product.productImage === 'object' && (product.productImage as any).url
								? { url: (product.productImage as any).url }
								: typeof product.productImage === 'string'
									? { url: product.productImage }
									: product.productImage
						const preparedMedia = await prepareWAMessageMedia({ image: resolvedProductImage as any }, mediaOptions)
						productImageMessage = preparedMedia.imageMessage
					}

					messageContent.header = proto.Message.InteractiveMessage.Header.fromObject({
						title: icTitle || product.title || 'Product',
						hasMediaAttachment: icHasMedia || false,
						productMessage: {
							product: {
								productImage: productImageMessage,
								productId: product.productId || '',
								title: product.title || '',
								description: product.description || '',
								currencyCode: product.currencyCode || 'USD',
								priceAmount1000: parseInt(String(product.priceAmount1000)) || 0,
								retailerId: product.retailerId || '',
								url: product.url || '',
								productImageCount: product.productImageCount || 1
							},
							businessOwnerJid: businessOwnerJid || product.businessOwnerJid || userJid
						}
					})
				} else if (icTitle) {
					messageContent.header = proto.Message.InteractiveMessage.Header.fromObject({
						title: icTitle,
						hasMediaAttachment: false
					})
				}

				// Body
				const hasMedia = !!(image || video || doc || location || product)
				const bodyText = hasMedia ? icCaption : icText || icCaption
				if (bodyText) {
					messageContent.body = proto.Message.InteractiveMessage.Body.fromObject({ text: bodyText })
				}

				// Footer
				if (icFooter) {
					messageContent.footer = proto.Message.InteractiveMessage.Footer.fromObject({ text: icFooter })
				}

				// Native flow buttons
				if (processedButtons.length > 0) {
					messageContent.nativeFlowMessage = proto.Message.InteractiveMessage.NativeFlowMessage.fromObject({
						buttons: processedButtons
					})
				}

				// Context info (external ad reply, mentions)
				if (externalAdReply && typeof externalAdReply === 'object') {
					messageContent.contextInfo = {
						externalAdReply: {
							title: externalAdReply.title || '',
							body: externalAdReply.body || '',
							mediaType: externalAdReply.mediaType || 1,
							sourceUrl: externalAdReply.sourceUrl || externalAdReply.url || '',
							thumbnailUrl: externalAdReply.thumbnailUrl || '',
							renderLargerThumbnail: externalAdReply.renderLargerThumbnail || false,
							showAdAttribution: externalAdReply.showAdAttribution !== false,
							containsAutoReply: externalAdReply.containsAutoReply || false,
							...(externalAdReply.mediaUrl && { mediaUrl: externalAdReply.mediaUrl }),
							...(externalAdReply.thumbnail && Buffer.isBuffer(externalAdReply.thumbnail)
								? { thumbnail: externalAdReply.thumbnail }
								: {}),
							...(externalAdReply.jpegThumbnail && { jpegThumbnail: externalAdReply.jpegThumbnail })
						},
						...(mentionedJid ? { mentionedJid } : {})
					}
				} else if (mentionedJid) {
					messageContent.contextInfo = { mentionedJid }
				}

				const payload = proto.Message.InteractiveMessage.create(messageContent)
				const msg = generateWAMessageFromContent(
					jid,
					{
						viewOnceMessage: {
							message: {
								interactiveMessage: payload
							}
						}
					},
					{
						userJid,
						quoted: options?.quoted || undefined
					}
				)

				await relayMessage(jid, msg.message!, {
					messageId: msg.key.id!,
					additionalNodes: [
						{
							tag: 'biz',
							attrs: {},
							content: [
								{
									tag: 'interactive',
									attrs: { type: 'native_flow', v: '1' },
									content: [
										{
											tag: 'native_flow',
											attrs: { v: '9', name: 'mixed' }
										}
									]
								}
							]
						}
					]
				})

				return msg
			}

			let mediaHandle: string | undefined
			const uploadWithHandle = async (filePath: string, uploadOptions: any) => {
				const uploaded = await waUploadToServer(filePath, uploadOptions)
				mediaHandle = (uploaded as any)?.handle || mediaHandle
				return uploaded
			}

			const fullMsg = await generateWAMessage(jid, content, {
				logger,
				userJid,
				getUrlInfo: text =>
					getUrlInfo(text, {
						thumbnailWidth: linkPreviewImageThumbnailWidth,
						fetchOpts: {
							timeout: 3_000,
							...(httpRequestOptions || {})
						},
						logger,
						uploadImage: generateHighQualityLinkPreview ? waUploadToServer : undefined
					}),
				getProfilePicUrl: sock.profilePictureUrl,
				getCallLink: sock.createCallLink,
				upload: uploadWithHandle,
				mediaCache: config.mediaCache,
				options: config.options,
				messageId: generateMessageIDV2(sock.user?.id),
				...options
			})

			const isDeleteMsg = 'delete' in content && !!content.delete
			const isEditMsg = 'edit' in content && !!content.edit
			const isPinMsg = 'pin' in content && !!content.pin
			const isKeepMsg = 'keep' in content && !!content.keep
			const isPollMessage = 'poll' in content && !!content.poll
			const isAiMsg = 'ai' in content && !!content.ai
			const additionalAttributes: BinaryNodeAttributes = {}
			const additionalNodes: BinaryNode[] = []

			if (isDeleteMsg) {
				if ((isJidGroup(content.delete?.remoteJid as string) && !content.delete?.fromMe) || isJidNewsletter(jid)) {
					additionalAttributes.edit = '8'
				} else {
					additionalAttributes.edit = '7'
				}
			} else if (isEditMsg) {
				additionalAttributes.edit = isJidNewsletter(jid) ? '3' : '1'
			} else if (isPinMsg) {
				additionalAttributes.edit = '2'
			} else if (isKeepMsg) {
				additionalAttributes.edit = '6'
			} else if (isPollMessage) {
				additionalNodes.push({
					tag: 'meta',
					attrs: {
						polltype: 'creation'
					}
				} as BinaryNode)
			} else if (isAiMsg) {
				additionalNodes.push({
					attrs: {
						biz_bot: '1'
					},
					tag: 'bot'
				})
			}

			if (mediaHandle) {
				additionalAttributes.media_id = mediaHandle
			}

			if ('cachedGroupMetadata' in options) {
				logger.warn('cachedGroupMetadata in sendMessage are deprecated, now cachedGroupMetadata is part of the socket config.')
			}

			const relayAdditionalNodes = isAiMsg ? additionalNodes : options.additionalNodes ?? additionalNodes
			await relayMessage(jid, fullMsg.message!, {
				messageId: fullMsg.key.id!,
				useCachedGroupMetadata: options.useCachedGroupMetadata,
				additionalAttributes,
				statusJidList: options.statusJidList,
				additionalNodes: relayAdditionalNodes
			})
			if (config.emitOwnEvents) {
				process.nextTick(async () => {
					await processingMutex.mutex(() => upsertMessage(fullMsg, 'append'))
				})
			}

			return fullMsg
		}
	}
}

