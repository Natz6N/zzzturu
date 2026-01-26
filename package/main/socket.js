import crypto from "crypto";
import fetch from "node-fetch";
import fs from "fs";
import path from "path";
import {
    fileURLToPath
} from 'url';
import {
    dirname
} from 'path';
import Sticker from './sticker-engine/index.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * @param {import('baileys').WASocket} socket
 */

export default function addProperty(socket, store, smsg, baileys) {
    const {
        proto,
        generateWAMessageFromContent,
        jidDecode,
        downloadContentFromMessage,
        prepareWAMessageMedia,
        generateMessageID,
        generateWAMessage
    } = baileys;

    Object.assign(socket, {
        sendCard: async (jid, options = {}) => {
            const {
                text = "",
                    footer = "",
                    cards = [],
                    quoted = null,
                    sender = jid
            } = options

            if (!cards.length) throw new Error("cards cannot be empty")

            let carouselCards = []
            const getImageMedia = async (image) => {
                if (!image) throw new Error("Image cannot be empty")

                if (typeof image === "string") {
                    return await prepareWAMessageMedia({
                        image: {
                            url: image
                        }
                    }, {
                        upload: socket.waUploadToServer
                    })
                }

                if (Buffer.isBuffer(image)) {
                    return await prepareWAMessageMedia({
                        image
                    }, {
                        upload: socket.waUploadToServer
                    })
                }

                if (typeof image === "object") {
                    return await prepareWAMessageMedia({
                        image
                    }, {
                        upload: socket.waUploadToServer
                    })
                }

                throw new Error("Format image tidak didukung")
            }

            for (let i = 0; i < cards.length; i++) {
                const item = cards[i]

                let img = await getImageMedia(item.image)

                carouselCards.push({
                    header: proto.Message.InteractiveMessage.Header.fromObject({
                        title: item.caption || `Card ${i + 1}`,
                        hasMediaAttachment: true,
                        ...img
                    }),
                    nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.fromObject({
                        buttons: Array.isArray(item.buttons) ? item.buttons : []
                    }),
                    footer: proto.Message.InteractiveMessage.Footer.create({
                        text: footer
                    })
                })
            }

            const msg = await generateWAMessageFromContent(
                jid, {
                    viewOnceMessage: {
                        message: {
                            messageContextInfo: {
                                deviceListMetadata: {},
                                deviceListMetadataVersion: 2
                            },
                            interactiveMessage: proto.Message.InteractiveMessage.fromObject({
                                body: proto.Message.InteractiveMessage.Body.fromObject({
                                    text
                                }),
                                carouselMessage: proto.Message.InteractiveMessage.CarouselMessage.fromObject({
                                    cards: carouselCards
                                })
                            })
                        }
                    }
                }, {
                    userJid: sender,
                    quoted
                }
            )

            return await socket.relayMessage(jid, msg.message, {
                messageId: msg.key.id
            })
        },

        sendSticker: async (jid, options = {}) => {
            try {
                if (!options.sticker)
                    throw new Error('Please enter the path or buffer of the sticker.')

                const tmpDir = path.join(__dirname, './tmp')
                if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, {
                    recursive: true
                })

                let stickerPath

                if (Buffer.isBuffer(options.sticker)) {
                    stickerPath = path.join(tmpDir, `sticker_${Date.now()}.webp`)
                    fs.writeFileSync(stickerPath, options.sticker)
                } else if (typeof options.sticker === 'string') {
                    if (!fs.existsSync(options.sticker))
                        throw new Error(`File not found: ${options.sticker}`)
                    stickerPath = options.sticker
                } else {
                    throw new Error('Sticker format not recognized (must be buffer or file path).')
                }

                const sticker = new Sticker(stickerPath, {
                    pack: options.packname || "Made By",
                    author: options.author || "漏 饾檷廷饾櫘饾櫔饾櫔 饾檷廷饾櫄饾櫈饾櫍饾櫙饾櫙"
                })

                const buffer = await sticker.build()
                const result = await socket.sendMessage(jid, {
                    sticker: buffer
                })

                if (Buffer.isBuffer(options.sticker)) fs.unlinkSync(stickerPath)

                return result
            } catch (e) {
                console.error('[sendSticker Error]', e)
            }
        },

        sendButton: async (jid, content = {}, options = {}) => {
            if (!socket.user?.id) {
                throw new Error("User not authenticated");
            }

            const {
                text = "",
                    caption = "",
                    title = "",
                    footer = "",
                    buttons = [],
                    hasMediaAttachment = false,
                    image = null,
                    video = null,
                    document = null,
                    fileName = null,
                    mimetype = null,
                    jpegThumbnail = null,
                    location = null,
                    product = null,
                    businessOwnerJid = null,
                    externalAdReply = null,
            } = content;

            if (!Array.isArray(buttons) || buttons.length === 0) {
                throw new Error("buttons must be a non-empty array");
            }

            const processedButtons = [];

            for (let i = 0; i < buttons.length; i++) {
                const btn = buttons[i];

                if (!btn || typeof btn !== "object") {
                    throw new Error(`interactiveButton[${i}] must be an object`);
                }

                if (btn.name && btn.buttonParamsJson) {
                    processedButtons.push(btn);
                    continue;
                }

                if (btn.id || btn.text || btn.displayText) {
                    processedButtons.push({
                        name: "quick_reply",
                        buttonParamsJson: JSON.stringify({
                            display_text: btn.text || btn.displayText || `Button ${i + 1}`,
                            id: btn.id || `quick_${i + 1}`,
                        }),
                    });
                    continue;
                }

                if (btn.buttonId && btn.buttonText?.displayText) {
                    processedButtons.push({
                        name: "quick_reply",
                        buttonParamsJson: JSON.stringify({
                            display_text: btn.buttonText.displayText,
                            id: btn.buttonId,
                        }),
                    });
                    continue;
                }

                throw new Error(`interactiveButton[${i}] has invalid shape`);
            }

            let messageContent = {};

            if (image) {
                const mediaInput = {};
                if (Buffer.isBuffer(image)) {
                    mediaInput.image = image;
                } else if (typeof image === "object" && image.url) {
                    mediaInput.image = {
                        url: image.url
                    };
                } else if (typeof image === "string") {
                    mediaInput.image = {
                        url: image
                    };
                }

                const preparedMedia = await prepareWAMessageMedia(mediaInput, {
                    upload: socket.waUploadToServer,
                });

                messageContent.header = {
                    title: title || "",
                    hasMediaAttachment: hasMediaAttachment || true,
                    imageMessage: preparedMedia.imageMessage,
                };
            } else if (video) {
                const mediaInput = {};
                if (Buffer.isBuffer(video)) {
                    mediaInput.video = video;
                } else if (typeof video === "object" && video.url) {
                    mediaInput.video = {
                        url: video.url
                    };
                } else if (typeof video === "string") {
                    mediaInput.video = {
                        url: video
                    };
                }

                const preparedMedia = await prepareWAMessageMedia(mediaInput, {
                    upload: socket.waUploadToServer,
                });

                messageContent.header = {
                    title: title || "",
                    hasMediaAttachment: hasMediaAttachment || true,
                    videoMessage: preparedMedia.videoMessage,
                };
            } else if (document) {
                const mediaInput = {
                    document: {}
                };

                if (Buffer.isBuffer(document)) {
                    mediaInput.document = document;
                } else if (typeof document === "object" && document.url) {
                    mediaInput.document = {
                        url: document.url
                    };
                } else if (typeof document === "string") {
                    mediaInput.document = {
                        url: document
                    };
                }

                if (fileName) {
                    if (typeof mediaInput.document === "object") {
                        mediaInput.document.fileName = fileName;
                    }
                }

                if (mimetype) {
                    if (typeof mediaInput.document === "object") {
                        mediaInput.document.mimetype = mimetype;
                    }
                }

                if (jpegThumbnail) {
                    if (typeof mediaInput.document === "object") {
                        if (Buffer.isBuffer(jpegThumbnail)) {
                            mediaInput.document.jpegThumbnail = jpegThumbnail;
                        } else if (typeof jpegThumbnail === "string") {
                            try {
                                const response = await fetch(jpegThumbnail);
                                const arrayBuffer = await response.arrayBuffer();
                                mediaInput.document.jpegThumbnail = Buffer.from(arrayBuffer);
                            } catch {
                                //
                            }
                        }
                    }
                }

                const preparedMedia = await prepareWAMessageMedia(mediaInput, {
                    upload: socket.waUploadToServer,
                });

                messageContent.header = {
                    title: title || "",
                    hasMediaAttachment: hasMediaAttachment || true,
                    documentMessage: preparedMedia.documentMessage,
                };
            } else if (location && typeof location === "object") {
                messageContent.header = {
                    title: title || location.name || "Location",
                    hasMediaAttachment: hasMediaAttachment || false,
                    locationMessage: {
                        degreesLatitude: location.degressLatitude || location.degreesLatitude || 0,
                        degreesLongitude: location.degressLongitude || location.degreesLongitude || 0,
                        name: location.name || "",
                        address: location.address || "",
                    },
                };
            } else if (product && typeof product === "object") {
                let productImageMessage = null;
                if (product.productImage) {
                    const mediaInput = {};
                    if (Buffer.isBuffer(product.productImage)) {
                        mediaInput.image = product.productImage;
                    } else if (
                        typeof product.productImage === "object" &&
                        product.productImage.url
                    ) {
                        mediaInput.image = {
                            url: product.productImage.url,
                        };
                    } else if (typeof product.productImage === "string") {
                        mediaInput.image = {
                            url: product.productImage,
                        };
                    }

                    const preparedMedia = await prepareWAMessageMedia(mediaInput, {
                        upload: socket.waUploadToServer,
                    });
                    productImageMessage = preparedMedia.imageMessage;
                }

                messageContent.header = {
                    title: title || product.title || "Product",
                    hasMediaAttachment: hasMediaAttachment || false,
                    productMessage: {
                        product: {
                            productImage: productImageMessage,
                            productId: product.productId || "",
                            title: product.title || "",
                            description: product.description || "",
                            currencyCode: product.currencyCode || "USD",
                            priceAmount1000: parseInt(product.priceAmount1000) || 0,
                            retailerId: product.retailerId || "",
                            url: product.url || "",
                            productImageCount: product.productImageCount || 1,
                        },
                        businessOwnerJid: businessOwnerJid || product.businessOwnerJid || socket.user.id,
                    },
                };
            } else if (title) {
                messageContent.header = {
                    title: title,
                    hasMediaAttachment: false,
                };
            }

            const hasMedia = !!(image || video || document || location || product);
            const bodyText = hasMedia ? caption : text || caption;

            if (bodyText) {
                messageContent.body = {
                    text: bodyText
                };
            }

            if (footer) {
                messageContent.footer = {
                    text: footer
                };
            }

            messageContent.nativeFlowMessage = {
                buttons: processedButtons,
            };

            if (externalAdReply && typeof externalAdReply === "object") {
                messageContent.contextInfo = {
                    externalAdReply: {
                        title: externalAdReply.title || "",
                        body: externalAdReply.body || "",
                        mediaType: externalAdReply.mediaType || 1,
                        sourceUrl: externalAdReply.sourceUrl || externalAdReply.url || "",
                        thumbnailUrl: externalAdReply.thumbnailUrl || "",
                        renderLargerThumbnail: externalAdReply.renderLargerThumbnail || false,
                        showAdAttribution: externalAdReply.showAdAttribution !== false,
                        containsAutoReply: externalAdReply.containsAutoReply || false,
                        ...(externalAdReply.mediaUrl && {
                            mediaUrl: externalAdReply.mediaUrl,
                        }),
                        ...(externalAdReply.thumbnail &&
                            Buffer.isBuffer(externalAdReply.thumbnail) && {
                                thumbnail: externalAdReply.thumbnail,
                            }),
                        ...(externalAdReply.jpegThumbnail && {
                            jpegThumbnail: externalAdReply.jpegThumbnail,
                        }),
                    },
                    ...(options.mentionedJid && {
                        mentionedJid: options.mentionedJid,
                    }),
                };
            } else if (options.mentionedJid) {
                messageContent.contextInfo = {
                    mentionedJid: options.mentionedJid,
                };
            }

            const payload = proto.Message.InteractiveMessage.create(messageContent);

            const msg = generateWAMessageFromContent(
                jid, {
                    viewOnceMessage: {
                        message: {
                            interactiveMessage: payload,
                        },
                    },
                }, {
                    userJid: socket.user.id,
                    quoted: options?.quoted || null,
                }
            );

            const additionalNodes = [{
                tag: "biz",
                attrs: {},
                content: [{
                    tag: "interactive",
                    attrs: {
                        type: "native_flow",
                        v: "1",
                    },
                    content: [{
                        tag: "native_flow",
                        attrs: {
                            v: "9",
                            name: "mixed",
                        },
                    }, ],
                }, ],
            }, ];

            await socket.relayMessage(jid, msg.message, {
                messageId: msg.key.id,
                additionalNodes,
            });

            return msg;
        },
        sendAlbum: async (jid, items = [], options = {}) => {
            if (!socket.user?.id) {
                throw new Error("User not authenticated");
            }

            const messageSecret = new Uint8Array(32);
            crypto.getRandomValues(messageSecret);

            const messageContent = {
                messageContextInfo: {
                    messageSecret
                },
                albumMessage: {
                    expectedImageCount: items.filter((a) =>
                        a?.image).length,
                    expectedVideoCount: items.filter((a) =>
                        a?.video).length,
                },
            };

            const generationOptions = {
                userJid: socket.user.id,
                upload: socket.waUploadToServer,
                quoted: options?.quoted || null,
                ephemeralExpiration: options?.quoted
                    ?.expiration ?? 0,
            };

            const album = generateWAMessageFromContent(jid,
                messageContent, generationOptions);

            await socket.relayMessage(album.key.remoteJid, album
                .message, {
                    messageId: album.key.id,
                });

            await Promise.all(
                items.map(async (content) => {
                    const mediaSecret =
                        new Uint8Array(32);
                    crypto.getRandomValues(
                        mediaSecret);

                    const mediaMsg =
                        await generateWAMessage(
                            album.key.remoteJid,
                            content, {
                                upload: socket
                                    .waUploadToServer,
                                ephemeralExpiration: options
                                    ?.quoted
                                    ?.expiration ??
                                    0,
                            });

                    mediaMsg.message
                        .messageContextInfo = {
                            messageSecret: mediaSecret,
                            messageAssociation: {
                                associationType: 1,
                                parentMessageKey: album
                                    .key,
                            },
                        };

                    return socket.relayMessage(
                        mediaMsg.key.remoteJid,
                        mediaMsg.message, {
                            messageId: mediaMsg
                                .key.id,
                        });
                })
            );

            return album;
        },

        sendOrder: async (jid, orderData, options = {}) => {
            if (!socket.user?.id) {
                throw new Error("User not authenticated");
            }

            let thumbnail = null;
            if (orderData.thumbnail) {
                if (Buffer.isBuffer(orderData.thumbnail)) {
                    thumbnail = orderData.thumbnail;
                } else if (typeof orderData.thumbnail === "string") {
                    try {
                        if (orderData.thumbnail.startsWith("http")) {
                            const response = await fetch(orderData.thumbnail);
                            const arrayBuffer = await response.arrayBuffer();
                            thumbnail = Buffer.from(arrayBuffer);
                        } else {
                            thumbnail = Buffer.from(orderData.thumbnail, "base64");
                        }
                    } catch (e) {
                        socket.logger?.warn({
                                err: e.message
                            },
                            "Failed to fetch/convert thumbnail"
                        );
                        thumbnail = null;
                    }
                }
            }

            const orderMessage = proto.Message.OrderMessage.fromObject({
                orderId: orderData.orderId || generateMessageID(),
                thumbnail: thumbnail,
                itemCount: orderData.itemCount || 1,
                status: orderData.status || proto.Message.OrderMessage.OrderStatus.INQUIRY,
                surface: orderData.surface || proto.Message.OrderMessage.OrderSurface.CATALOG,
                message: orderData.message || "",
                orderTitle: orderData.orderTitle || "Order",
                sellerJid: orderData.sellerJid || socket.user.id,
                token: orderData.token || "",
                totalAmount1000: orderData.totalAmount1000 || 0,
                totalCurrencyCode: orderData.totalCurrencyCode || "IDR",
                contextInfo: {
                    ...(options.contextInfo || {}),
                    ...(options.mentions ? {
                        mentionedJid: options.mentions,
                    } : {}),
                },
            });

            const msg = proto.Message.create({
                orderMessage,
            });

            const message = generateWAMessageFromContent(jid, msg, {
                userJid: socket.user.id,
                timestamp: options.timestamp || new Date(),
                quoted: options.quoted || null,
                ephemeralExpiration: options.ephemeralExpiration || 0,
                messageId: options.messageId || null,
            });

            return await socket.relayMessage(message.key.remoteJid, message.message, {
                messageId: message.key.id,
            });
        },

        getPNFromLid: async (m, lidInput) => {
            if (!lidInput) throw new Error("Misssing input");
            try {
                let chat = m.chat
                if (chat.endsWith('@g.us')) {

                    const metadata = await socket.groupMetadata(chat);
                    if (!metadata || !metadata.participants) return lidInput;

                    const found = metadata.participants.find(entry => entry.id === lidInput);
                    return found ? found.phoneNumber : lidInput;
                } else {
                    const {
                        remoteJid,
                        remoteJidAlt
                    } = m.key
                    if (remoteJid === lidInput && remoteJidAlt.endsWith("@s.whatsapp.net")) {
                        return remoteJidAlt
                    }
                }
            } catch (e) {
                console.error('Gagal ambil group metadata:', e.message);
                return lidInput;
            }
        },

        getLidFromPN: async (m, jidInput) => {
            if (!jidInput) throw new Error("Misssing jid input");
            try {
                let chat = m.chat;
                if (chat.endsWith('@g.us')) {
                    const metadata = await socket.groupMetadata(chat);
                    if (!metadata || !metadata.participants) return jidInput;

                    const found = metadata.participants.find(entry => entry.phoneNumber === jidInput);
                    return found ? found.id : jidInput;
                } else {
                    const {
                        remoteJid,
                        remoteJidAlt
                    } = m.key
                    if (!remoteJid || !remoteJidAlt) return null
                    if (remoteJidAlt === jidInput && remoteJid.endsWith("@lid")) {
                        return remoteJid
                    }
                }
            } catch (e) {
                console.error('Gagal ambil group metadata:', e.message);
                return jidInput;
            }
        },
    });
};