import type { Readable } from 'stream'
import type { URL } from 'url'
import { proto } from '../../WAProto/index.js'
import type { MediaType } from '../Defaults/index.js'
import type { BinaryNode } from '../WABinary/index.js'
import type { GroupMetadata } from './GroupMetadata.js'
import type { CacheStore } from './Socket.js'

// export the WAMessage Prototypes
export { proto as WAProto }
export type WAMessage = proto.IWebMessageInfo & {
	key: WAMessageKey
	messageStubParameters?: any
	category?: string
	retryCount?: number
}
export type WAMessageContent = proto.IMessage
export type WAContactMessage = proto.Message.IContactMessage
export type WAContactsArrayMessage = proto.Message.IContactsArrayMessage
export type WAMessageKey = proto.IMessageKey & {
	remoteJidAlt?: string
	participantAlt?: string
	server_id?: string
	addressingMode?: string
	isViewOnce?: boolean // TODO: remove out of the message key, place in WebMessageInfo
}
export type WATextMessage = proto.Message.IExtendedTextMessage
export type WAContextInfo = proto.IContextInfo
export type WALocationMessage = proto.Message.ILocationMessage
export type WAGenericMediaMessage =
	| proto.Message.IVideoMessage
	| proto.Message.IImageMessage
	| proto.Message.IAudioMessage
	| proto.Message.IDocumentMessage
	| proto.Message.IStickerMessage
export const WAMessageStubType = proto.WebMessageInfo.StubType
export const WAMessageStatus = proto.WebMessageInfo.Status
import type { ILogger } from '../Utils/logger.js'
export type WAMediaPayloadURL = { url: URL | string }
export type WAMediaPayloadStream = { stream: Readable }
export type WAMediaUpload = Buffer | WAMediaPayloadStream | WAMediaPayloadURL
/** Set of message types that are supported by the library */
export type MessageType = keyof proto.Message

export enum WAMessageAddressingMode {
	PN = 'pn',
	LID = 'lid'
}

export type MessageWithContextInfo =
	| 'imageMessage'
	| 'contactMessage'
	| 'locationMessage'
	| 'extendedTextMessage'
	| 'documentMessage'
	| 'audioMessage'
	| 'videoMessage'
	| 'call'
	| 'contactsArrayMessage'
	| 'liveLocationMessage'
	| 'templateMessage'
	| 'stickerMessage'
	| 'groupInviteMessage'
	| 'templateButtonReplyMessage'
	| 'productMessage'
	| 'listMessage'
	| 'orderMessage'
	| 'listResponseMessage'
	| 'buttonsMessage'
	| 'buttonsResponseMessage'
	| 'interactiveMessage'
	| 'interactiveResponseMessage'
	| 'pollCreationMessage'
	| 'requestPhoneNumberMessage'
	| 'messageHistoryBundle'
	| 'eventMessage'
	| 'newsletterAdminInviteMessage'
	| 'albumMessage'
	| 'stickerPackMessage'
	| 'pollResultSnapshotMessage'
	| 'messageHistoryNotice'

export type DownloadableMessage = { mediaKey?: Uint8Array | null; directPath?: string | null; url?: string | null }

export type MessageReceiptType =
	| 'read'
	| 'read-self'
	| 'hist_sync'
	| 'peer_msg'
	| 'sender'
	| 'inactive'
	| 'played'
	| undefined

export type MediaConnInfo = {
	auth: string
	ttl: number
	hosts: { hostname: string; maxContentLengthBytes: number }[]
	fetchDate: Date
}

export interface WAUrlInfo {
	'canonical-url': string
	'matched-text': string
	title: string
	description?: string
	jpegThumbnail?: Buffer
	highQualityThumbnail?: proto.Message.IImageMessage
	originalThumbnailUrl?: string
}

// types to generate WA messages
type Mentionable = {
	/** list of jids that are mentioned in the accompanying text */
	mentions?: string[]
}
type Contextable = {
	/** add contextInfo to the message */
	contextInfo?: proto.IContextInfo
}
type ViewOnce = {
	viewOnce?: boolean
}

type Editable = {
	edit?: WAMessageKey
}
type WithDimensions = {
	width?: number
	height?: number
}

type MessageExtras = {
	keep?: boolean
	ai?: boolean
}

export type PollMessageOptions = {
	name: string
	selectableCount?: number
	values: string[]
	/** 32 byte message secret to encrypt poll selections */
	messageSecret?: Uint8Array
	toAnnouncementGroup?: boolean
}

export type EventMessageOptions = {
	name: string
	description?: string
	startDate: Date
	endDate?: Date
	location?: WALocationMessage
	call?: 'audio' | 'video'
	isCancelled?: boolean
	isScheduleCall?: boolean
	extraGuestsAllowed?: boolean
	messageSecret?: Uint8Array<ArrayBufferLike>
}

type SharePhoneNumber = {
	sharePhoneNumber: boolean
}

type RequestPhoneNumber = {
	requestPhoneNumber: boolean
}

export type AnyMediaMessageContent = (
	| ({
		image: WAMediaUpload
		caption?: string
		jpegThumbnail?: string
	} & Mentionable &
		Contextable &
		WithDimensions)
	| ({
		video: WAMediaUpload
		caption?: string
		gifPlayback?: boolean
		jpegThumbnail?: string
		/** if set to true, will send as a `video note` */
		ptv?: boolean
	} & Mentionable &
		Contextable &
		WithDimensions)
	| {
		audio: WAMediaUpload
		/** if set to true, will send as a `voice note` */
		ptt?: boolean
		/** optionally tell the duration of the audio */
		seconds?: number
	}
	| ({
		sticker: WAMediaUpload
		isAnimated?: boolean
	} & WithDimensions)
	| ({
		document: WAMediaUpload
		mimetype: string
		fileName?: string
		caption?: string
	} & Contextable)
) & { mimetype?: string } & Editable

export type AlbumMedia = (
	| {
		image: WAMediaUpload
		caption?: string
	}
	| {
		video: WAMediaUpload
		caption?: string
		gifPlayback?: boolean
	}
) & Editable

export type ButtonReplyInfo = {
	displayText: string
	id: string
	index: number
}

export type GroupInviteInfo = {
	inviteCode: string
	inviteExpiration: number
	text: string
	jid: string
	subject: string
}

export type WASendableProduct = Omit<proto.Message.ProductMessage.IProductSnapshot, 'productImage'> & {
	productImage: WAMediaUpload
}

export type AnyRegularMessageContent = (
	| ({
		text: string
		linkPreview?: WAUrlInfo | null
	} & Mentionable &
		Contextable &
		Editable)
	| AnyMediaMessageContent
	| { event: EventMessageOptions }
	| ({
		poll: PollMessageOptions
	} & Mentionable &
		Contextable &
		Editable)
	| {
		contacts: {
			displayName?: string
			contacts: proto.Message.IContactMessage[]
		}
	}
	| {
		location: WALocationMessage
	}
	| { react: proto.Message.IReactionMessage }
	| {
		buttonReply: ButtonReplyInfo
		type: 'template' | 'plain'
	}
	| {
		groupInvite: GroupInviteInfo
	}
	| {
		listReply: Omit<proto.Message.IListResponseMessage, 'contextInfo'>
	}
	| {
		pin: WAMessageKey
		type: proto.PinInChat.Type
		/**
		 * 24 hours, 7 days, 30 days
		 */
		time?: 86400 | 604800 | 2592000
	}
	| {
		product: WASendableProduct
		businessOwnerJid?: string
		body?: string
		footer?: string
	}
	| SharePhoneNumber
	| RequestPhoneNumber
) &
	ViewOnce

export type AnyMessageContent =
	| (AnyRegularMessageContent & MessageExtras)
	| ({
		forward: WAMessage
		force?: boolean
	} & MessageExtras)
	| ({
		/** Delete your message or anyone's message in a group (admin required) */
		delete: WAMessageKey
	} & MessageExtras)
	| ({
		disappearingMessagesInChat: boolean | number
	} & MessageExtras)
	| ({
		limitSharing: boolean
	} & MessageExtras)
	| ({
		album: AlbumMedia[]
		caption?: string
	} & MessageExtras)
	| ({
		/** Send interactive message (buttons, cards, lists) via sendMessage */
		interactiveMessage: InteractiveMessageContent
	} & MessageExtras)

export type InteractiveMessageContent = {
	/** Body text (or caption when media is present) */
	text?: string
	caption?: string
	/** Header title */
	title?: string
	/** Footer text */
	footer?: string
	/** Interactive buttons (native flow format) */
	buttons?: InteractiveButton[]
	/** Carousel cards */
	cards?: InteractiveCard[]
	/** List sections (for list-type messages) */
	sections?: InteractiveListSection[]
	/** Button text for list messages */
	buttonText?: string
	/** Image attachment */
	image?: WAMediaUpload | string | null
	/** Video attachment */
	video?: WAMediaUpload | string | null
	/** Document attachment */
	document?: WAMediaUpload | string | null
	/** Document file name */
	fileName?: string | null
	/** Document MIME type */
	mimetype?: string | null
	/** JPEG thumbnail */
	jpegThumbnail?: Buffer | string | null
	/** Whether header has media attachment */
	hasMediaAttachment?: boolean
	/** Location data */
	location?: {
		degreesLatitude: number
		degreesLongitude: number
		name?: string
		address?: string
	} | null
	/** Product data */
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
	/** Business owner JID */
	businessOwnerJid?: string | null
	/** External ad reply */
	externalAdReply?: {
		title?: string
		body?: string
		mediaType?: number
		sourceUrl?: string
		url?: string
		thumbnailUrl?: string
		renderLargerThumbnail?: boolean
		showAdAttribution?: boolean
		containsAutoReply?: boolean
		mediaUrl?: string
		thumbnail?: Buffer
		jpegThumbnail?: Buffer
	} | null
	/** JIDs to mention */
	mentionedJid?: string[]
}

export type InteractiveButton =
	| { name: string; buttonParamsJson: string }
	| { id: string; text?: string; displayText?: string }
	| { buttonId: string; buttonText: { displayText: string } }

export type InteractiveCard = {
	image: WAMediaUpload | string
	caption?: string
	buttons?: Array<{ name: string; buttonParamsJson: string }>
}

export type InteractiveListSection = {
	title: string
	rows: Array<{
		id: string
		title: string
		description?: string
	}>
}

export type GroupMetadataParticipants = Pick<GroupMetadata, 'participants'>

type MinimalRelayOptions = {
	/** override the message ID with a custom provided string */
	messageId?: string
	/** should we use group metadata cache, or fetch afresh from the server; default assumed to be "true" */
	useCachedGroupMetadata?: boolean
}

export type MessageRelayOptions = MinimalRelayOptions & {
	/** only send to a specific participant; used when a message decryption fails for a single user */
	participant?: { jid: string; count: number }
	/** additional attributes to add to the WA binary node */
	additionalAttributes?: { [_: string]: string }
	additionalNodes?: BinaryNode[]
	/** should we use the devices cache, or fetch afresh from the server; default assumed to be "true" */
	useUserDevicesCache?: boolean
	/** jid list of participants for status@broadcast */
	statusJidList?: string[]
}

export type MiscMessageGenerationOptions = MinimalRelayOptions & {
	/** optional, if you want to manually set the timestamp of the message */
	timestamp?: Date
	/** the message you want to quote */
	quoted?: WAMessage
	/** disappearing messages settings */
	ephemeralExpiration?: number | string
	/** timeout for media upload to WA server */
	mediaUploadTimeoutMs?: number
	/** jid list of participants for status@broadcast */
	statusJidList?: string[]
	/** backgroundcolor for status */
	backgroundColor?: string
	/** font type for status */
	font?: number
	/** if it is broadcast */
	broadcast?: boolean
	/** add extra nodes for message relay */
	additionalNodes?: BinaryNode[]
}
export type MessageGenerationOptionsFromContent = MiscMessageGenerationOptions & {
	userJid: string
}

export type WAMediaUploadFunction = (
	encFilePath: string,
	opts: { fileEncSha256B64: string; mediaType: MediaType; timeoutMs?: number }
) => Promise<{ mediaUrl: string; directPath: string; meta_hmac?: string; ts?: number; fbid?: number }>

export type MediaGenerationOptions = {
	logger?: ILogger
	mediaTypeOverride?: MediaType
	upload: WAMediaUploadFunction
	/** cache media so it does not have to be uploaded again */
	mediaCache?: CacheStore

	mediaUploadTimeoutMs?: number

	options?: RequestInit

	backgroundColor?: string

	font?: number
}
export type MessageContentGenerationOptions = MediaGenerationOptions & {
	getUrlInfo?: (text: string) => Promise<WAUrlInfo | undefined>
	getProfilePicUrl?: (jid: string, type: 'image' | 'preview') => Promise<string | undefined>
	getCallLink?: (type: 'audio' | 'video', event?: { startTime: number }) => Promise<string | undefined>
	jid?: string
}
export type MessageGenerationOptions = MessageContentGenerationOptions & MessageGenerationOptionsFromContent

/**
 * Type of message upsert
 * 1. notify => notify the user, this message was just received
 * 2. append => append the message to the chat history, no notification required
 */
export type MessageUpsertType = 'append' | 'notify'

export type MessageUserReceipt = proto.IUserReceipt

export type WAMessageUpdate = { update: Partial<WAMessage>; key: WAMessageKey }

export type WAMessageCursor = { before: WAMessageKey | undefined } | { after: WAMessageKey | undefined }

export type MessageUserReceiptUpdate = { key: WAMessageKey; receipt: MessageUserReceipt }

export type MediaDecryptionKeyInfo = {
	iv: Buffer
	cipherKey: Buffer
	macKey?: Buffer
}

export type MinimalMessage = Pick<WAMessage, 'key' | 'messageTimestamp'>
