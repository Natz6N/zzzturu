"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.makeLibSignalRepository = makeLibSignalRepository;
const libsignal = __importStar(require("libsignal"));
const Utils_1 = require("../Utils");
const WABinary_1 = require("../WABinary");
const lid_mapping_1 = require("./lid-mapping");
const sender_key_name_1 = require("./Group/sender-key-name");
const sender_key_record_1 = require("./Group/sender-key-record");
const Group_1 = require("./Group");
function makeLibSignalRepository(auth, logger, pnToLIDFunc) {
    const parsedKeys = auth.keys;
    const noopLogger = logger || {
        trace: () => { },
        debug: () => { },
        info: () => { },
        warn: () => { },
        error: () => { }
    };
    const lidMapping = new lid_mapping_1.LIDMappingStore(auth.keys, noopLogger, pnToLIDFunc);
    const storage = signalStorage(auth, lidMapping);
    const migratedSessionCache = new Map();
    const migratedSessionCacheTtlMs = 3 * 24 * 60 * 60 * 1000;
    const isMigratedSessionCached = (key) => {
        const expiry = migratedSessionCache.get(key);
        if (!expiry) {
            return false;
        }
        if (expiry <= Date.now()) {
            migratedSessionCache.delete(key);
            return false;
        }
        return true;
    };
    const cacheMigratedSession = (key) => {
        migratedSessionCache.set(key, Date.now() + migratedSessionCacheTtlMs);
    };
    const transaction = parsedKeys.transaction
        ? (work, tag) => parsedKeys.transaction(work, tag)
        : async (work) => work();
    return {
        decryptGroupMessage({ group, authorJid, msg }) {
            const senderName = jidToSignalSenderKeyName(group, authorJid);
            const cipher = new Group_1.GroupCipher(storage, senderName);
            return transaction(async () => {
                return cipher.decrypt(msg);
            }, group);
        },
        async processSenderKeyDistributionMessage({ item, authorJid }) {
            const builder = new Group_1.GroupSessionBuilder(storage);
            if (!item.groupId) {
                throw new Error('Group ID is required for sender key distribution message');
            }
            const senderName = jidToSignalSenderKeyName(item.groupId, authorJid);
            const senderMsg = new Group_1.SenderKeyDistributionMessage(null, null, null, null, item.axolotlSenderKeyDistributionMessage);
            const senderNameStr = senderName.toString();
            return transaction(async () => {
                const { [senderNameStr]: senderKey } = await auth.keys.get('sender-key', [senderNameStr]);
                if (!senderKey) {
                    await storage.storeSenderKey(senderName, new sender_key_record_1.SenderKeyRecord());
                }
                await builder.process(senderName, senderMsg);
            }, item.groupId);
        },
        async decryptMessage({ jid, type, ciphertext }) {
            const addr = jidToSignalProtocolAddress(jid);
            const session = new libsignal.SessionCipher(storage, addr);
            const doDecrypt = async () => {
                switch (type) {
                    case 'pkmsg':
                        return await session.decryptPreKeyWhisperMessage(ciphertext);
                    case 'msg':
                        return await session.decryptWhisperMessage(ciphertext);
                    default:
                        throw new Error(`Unknown message type: ${type}`);
                }
            };
            return transaction(async () => {
                return await doDecrypt();
            }, jid);
        },
        async encryptMessage({ jid, data }) {
            const addr = jidToSignalProtocolAddress(jid);
            const cipher = new libsignal.SessionCipher(storage, addr);
            return transaction(async () => {
                const { type: sigType, body } = await cipher.encrypt(data);
                const type = sigType === 3 ? 'pkmsg' : 'msg';
                return { type, ciphertext: Buffer.from(body, 'binary') };
            }, jid);
        },
        async encryptGroupMessage({ group, meId, data }) {
            const senderName = jidToSignalSenderKeyName(group, meId);
            const builder = new Group_1.GroupSessionBuilder(storage);
            const senderNameStr = senderName.toString();
            return transaction(async () => {
                const { [senderNameStr]: senderKey } = await auth.keys.get('sender-key', [senderNameStr]);
                if (!senderKey) {
                    await storage.storeSenderKey(senderName, new sender_key_record_1.SenderKeyRecord());
                }
                const senderKeyDistributionMessage = await builder.create(senderName);
                const session = new Group_1.GroupCipher(storage, senderName);
                const ciphertext = await session.encrypt(data);
                return {
                    ciphertext,
                    senderKeyDistributionMessage: senderKeyDistributionMessage.serialize()
                };
            }, group);
        },
        async injectE2ESession({ jid, session }) {
            const cipher = new libsignal.SessionBuilder(storage, jidToSignalProtocolAddress(jid));
            return transaction(async () => {
                await cipher.initOutgoing(session);
            }, jid);
        },
        jidToSignalProtocolAddress(jid) {
            return jidToSignalProtocolAddress(jid).toString();
        },
        lidMapping,
        async validateSession(jid) {
            try {
                const addr = jidToSignalProtocolAddress(jid);
                const sess = await storage.loadSession(addr.toString());
                if (!sess) {
                    return { exists: false, reason: 'no session' };
                }
                if (!sess.haveOpenSession()) {
                    return { exists: false, reason: 'no open session' };
                }
                return { exists: true };
            }
            catch (_a) {
                return { exists: false, reason: 'validation error' };
            }
        },
        async deleteSession(jids) {
            if (!jids.length)
                return;
            const sessionUpdates = {};
            jids.forEach(jid => {
                const addr = jidToSignalProtocolAddress(jid);
                sessionUpdates[addr.toString()] = null;
            });
            return transaction(async () => {
                await auth.keys.set({ session: sessionUpdates });
            }, `delete-${jids.length}-sessions`);
        },
        async migrateSession(fromJid, toJid) {
            if (!fromJid || (!(0, WABinary_1.isLidUser)(toJid) && !(0, WABinary_1.isHostedLidUser)(toJid))) {
                return { migrated: 0, skipped: 0, total: 0 };
            }
            if (!(0, WABinary_1.isPnUser)(fromJid) && !(0, WABinary_1.isHostedPnUser)(fromJid)) {
                return { migrated: 0, skipped: 0, total: 1 };
            }
            const decodedFrom = (0, WABinary_1.jidDecode)(fromJid);
            if (!decodedFrom) {
                return { migrated: 0, skipped: 0, total: 0 };
            }
            const { user } = decodedFrom;
            const { [user]: userDevices } = await parsedKeys.get('device-list', [user]);
            if (!userDevices) {
                return { migrated: 0, skipped: 0, total: 0 };
            }
            const fromDeviceStr = ((decodedFrom.device !== undefined ? decodedFrom.device : 0)).toString();
            if (!userDevices.includes(fromDeviceStr)) {
                userDevices.push(fromDeviceStr);
            }
            const uncachedDevices = userDevices.filter(device => {
                const deviceKey = `${user}.${device}`;
                return !isMigratedSessionCached(deviceKey);
            });
            const deviceSessionKeys = uncachedDevices.map(device => `${user}.${device}`);
            const existingSessions = await parsedKeys.get('session', deviceSessionKeys);
            const deviceJids = [];
            for (const [sessionKey, sessionData] of Object.entries(existingSessions)) {
                if (!sessionData) {
                    continue;
                }
                const deviceStr = sessionKey.split('.')[1];
                if (!deviceStr)
                    continue;
                const deviceNum = parseInt(deviceStr);
                let jid = deviceNum === 0 ? `${user}@s.whatsapp.net` : `${user}:${deviceNum}@s.whatsapp.net`;
                if (deviceNum === 99) {
                    jid = `${user}:99@hosted`;
                }
                deviceJids.push(jid);
            }
            const toUser = ((0, WABinary_1.jidDecode)(toJid) || {}).user || '';
            return transaction(async () => {
                const migrationOps = deviceJids.map(jid => {
                    const lidWithDevice = (0, WABinary_1.transferDevice)(jid, toJid);
                    const fromDecoded = (0, WABinary_1.jidDecode)(jid);
                    return {
                        fromAddr: jidToSignalProtocolAddress(jid),
                        toAddr: jidToSignalProtocolAddress(lidWithDevice),
                        deviceId: (fromDecoded === null || fromDecoded === void 0 ? void 0 : fromDecoded.device) || 0,
                        user,
                        lidWithDevice
                    };
                });
                const totalOps = migrationOps.length;
                let migratedCount = 0;
                const pnAddrStrings = Array.from(new Set(migrationOps.map(op => op.fromAddr.toString())));
                const pnSessions = await parsedKeys.get('session', pnAddrStrings);
                const sessionUpdates = {};
                for (const op of migrationOps) {
                    const pnAddrStr = op.fromAddr.toString();
                    const lidAddrStr = op.toAddr.toString();
                    const pnSession = pnSessions[pnAddrStr];
                    if (!pnSession) {
                        continue;
                    }
                    const fromSession = libsignal.SessionRecord.deserialize(pnSession);
                    if (fromSession.haveOpenSession()) {
                        sessionUpdates[lidAddrStr] = fromSession.serialize();
                        sessionUpdates[pnAddrStr] = null;
                        migratedCount++;
                    }
                }
                if (Object.keys(sessionUpdates).length > 0) {
                    await parsedKeys.set({ session: sessionUpdates });
                    for (const op of migrationOps) {
                        if (sessionUpdates[op.toAddr.toString()]) {
                            cacheMigratedSession(`${op.user}.${op.deviceId}`);
                        }
                    }
                }
                const skippedCount = totalOps - migratedCount;
                return { migrated: migratedCount, skipped: skippedCount, total: totalOps };
            }, `migrate-${deviceJids.length}-sessions-${toUser}`);
        }
    };
}
const jidToSignalProtocolAddress = (jid) => {
    const decoded = (0, WABinary_1.jidDecode)(jid);
    const { user, device, server, domainType } = decoded;
    if (!user) {
        throw new Error(`JID decoded but user is empty: "${jid}" -> user: "${user}", server: "${server}", device: ${device}`);
    }
    const signalUser = domainType !== WABinary_1.WAJIDDomains.WHATSAPP ? `${user}_${domainType}` : user;
    const finalDevice = device || 0;
    if (device === 99 && decoded.server !== 'hosted' && decoded.server !== 'hosted.lid') {
        throw new Error('Unexpected non-hosted device JID with device 99. This ID seems invalid. ID:' + jid);
    }
    return new libsignal.ProtocolAddress(signalUser, finalDevice);
};
const jidToSignalSenderKeyName = (group, user) => {
    return new sender_key_name_1.SenderKeyName(group, jidToSignalProtocolAddress(user));
};
function signalStorage({ creds, keys }, lidMapping) {
    const resolveLIDSignalAddress = async (id) => {
        if (id.includes('.')) {
            const [deviceId, device] = id.split('.');
            const [user, domainType_] = deviceId.split('_');
            const domainType = parseInt(domainType_ || '0');
            if (domainType === WABinary_1.WAJIDDomains.LID || domainType === WABinary_1.WAJIDDomains.HOSTED_LID) {
                return id;
            }
            const pnJid = `${user}${device !== '0' ? `:${device}` : ''}@${domainType === WABinary_1.WAJIDDomains.HOSTED ? 'hosted' : 's.whatsapp.net'}`;
            const lidForPN = await lidMapping.getLIDForPN(pnJid);
            if (lidForPN) {
                const lidAddr = jidToSignalProtocolAddress(lidForPN);
                return lidAddr.toString();
            }
        }
        return id;
    };
    return {
        loadSession: async (id) => {
            try {
                const wireJid = await resolveLIDSignalAddress(id);
                const { [wireJid]: sess } = await keys.get('session', [wireJid]);
                if (sess) {
                    return libsignal.SessionRecord.deserialize(sess);
                }
            }
            catch (_a) {
                return null;
            }
            return null;
        },
        storeSession: async (id, session) => {
            const wireJid = await resolveLIDSignalAddress(id);
            await keys.set({ session: { [wireJid]: session.serialize() } });
        },
        isTrustedIdentity: () => {
            return true;
        },
        loadPreKey: async (id) => {
            const keyId = id.toString();
            const { [keyId]: key } = await keys.get('pre-key', [keyId]);
            if (key) {
                return {
                    privKey: Buffer.from(key.private),
                    pubKey: Buffer.from(key.public)
                };
            }
        },
        removePreKey: (id) => keys.set({ 'pre-key': { [id]: null } }),
        loadSignedPreKey: () => {
            const key = creds.signedPreKey;
            return {
                privKey: Buffer.from(key.keyPair.private),
                pubKey: Buffer.from(key.keyPair.public)
            };
        },
        loadSenderKey: async (senderKeyName) => {
            const keyId = senderKeyName.toString();
            const { [keyId]: key } = await keys.get('sender-key', [keyId]);
            if (key) {
                return sender_key_record_1.SenderKeyRecord.deserialize(key);
            }
            return new sender_key_record_1.SenderKeyRecord();
        },
        storeSenderKey: async (senderKeyName, key) => {
            const keyId = senderKeyName.toString();
            const serialized = JSON.stringify(key.serialize());
            await keys.set({ 'sender-key': { [keyId]: Buffer.from(serialized, 'utf-8') } });
        },
        getOurRegistrationId: () => creds.registrationId,
        getOurIdentity: () => {
            const { signedIdentityKey } = creds;
            return {
                privKey: Buffer.from(signedIdentityKey.private),
                pubKey: (0, Utils_1.generateSignalPubKey)(signedIdentityKey.public)
            };
        }
    };
}
