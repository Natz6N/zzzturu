"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.LIDMappingStore = void 0;

const WABinary_1 = require("../WABinary");

class TTLCache {
    constructor({ ttl, updateAgeOnGet }) {
        this.ttl = ttl;
        this.updateAgeOnGet = updateAgeOnGet;
        this.map = new Map();
    }
    get(key) {
        const item = this.map.get(key);
        if (!item) {
            return undefined;
        }
        if (item.expiresAt !== 0 && item.expiresAt <= Date.now()) {
            this.map.delete(key);
            return undefined;
        }
        if (this.updateAgeOnGet && this.ttl) {
            item.expiresAt = Date.now() + this.ttl;
            this.map.set(key, item);
        }
        return item.value;
    }
    set(key, value) {
        const expiresAt = this.ttl ? Date.now() + this.ttl : 0;
        this.map.set(key, { value, expiresAt });
    }
}

class LIDMappingStore {
    constructor(keys, logger, pnToLIDFunc) {
        this.mappingCache = new TTLCache({
            ttl: 3 * 24 * 60 * 60 * 1000,
            updateAgeOnGet: true
        });
        this.keys = keys;
        this.pnToLIDFunc = pnToLIDFunc;
        this.logger = logger;
    }
    async storeLIDPNMappings(pairs) {
        const pairMap = {};
        for (const { lid, pn } of pairs) {
            if (!(((0, WABinary_1.isLidUser)(lid) && (0, WABinary_1.isPnUser)(pn)) || ((0, WABinary_1.isPnUser)(lid) && (0, WABinary_1.isLidUser)(pn)))) {
                this.logger.warn(`Invalid LID-PN mapping: ${lid}, ${pn}`);
                continue;
            }
            const lidDecoded = (0, WABinary_1.jidDecode)(lid);
            const pnDecoded = (0, WABinary_1.jidDecode)(pn);
            if (!lidDecoded || !pnDecoded)
                return;
            const pnUser = pnDecoded.user;
            const lidUser = lidDecoded.user;
            let existingLidUser = this.mappingCache.get(`pn:${pnUser}`);
            if (!existingLidUser) {
                this.logger.trace(`Cache miss for PN user ${pnUser}; checking database`);
                const stored = await this.keys.get('lid-mapping', [pnUser]);
                existingLidUser = stored[pnUser];
                if (existingLidUser) {
                    this.mappingCache.set(`pn:${pnUser}`, existingLidUser);
                    this.mappingCache.set(`lid:${existingLidUser}`, pnUser);
                }
            }
            if (existingLidUser === lidUser) {
                this.logger.debug({ pnUser, lidUser }, 'LID mapping already exists, skipping');
                continue;
            }
            pairMap[pnUser] = lidUser;
        }
        this.logger.trace({ pairMap }, `Storing ${Object.keys(pairMap).length} pn mappings`);
        await this.keys.transaction(async () => {
            for (const [pnUser, lidUser] of Object.entries(pairMap)) {
                await this.keys.set({
                    'lid-mapping': {
                        [pnUser]: lidUser,
                        [`${lidUser}_reverse`]: pnUser
                    }
                });
                this.mappingCache.set(`pn:${pnUser}`, lidUser);
                this.mappingCache.set(`lid:${lidUser}`, pnUser);
            }
        }, 'lid-mapping');
    }
    async getLIDForPN(pn) {
        var _a;
        return ((_a = (await this.getLIDsForPNs([pn]))) === null || _a === void 0 ? void 0 : _a[0].lid) || null;
    }
    async getLIDsForPNs(pns) {
        const usyncFetch = {};
        const successfulPairs = {};
        for (const pn of pns) {
            if (!(0, WABinary_1.isPnUser)(pn) && !(0, WABinary_1.isHostedPnUser)(pn))
                continue;
            const decoded = (0, WABinary_1.jidDecode)(pn);
            if (!decoded)
                continue;
            const pnUser = decoded.user;
            let lidUser = this.mappingCache.get(`pn:${pnUser}`);
            if (!lidUser) {
                const stored = await this.keys.get('lid-mapping', [pnUser]);
                lidUser = stored[pnUser];
                if (lidUser) {
                    this.mappingCache.set(`pn:${pnUser}`, lidUser);
                    this.mappingCache.set(`lid:${lidUser}`, pnUser);
                }
                else {
                    this.logger.trace(`No LID mapping found for PN user ${pnUser}; batch getting from USync`);
                    const device = decoded.device || 0;
                    let normalizedPn = (0, WABinary_1.jidNormalizedUser)(pn);
                    if ((0, WABinary_1.isHostedPnUser)(normalizedPn)) {
                        normalizedPn = `${pnUser}@s.whatsapp.net`;
                    }
                    if (!usyncFetch[normalizedPn]) {
                        usyncFetch[normalizedPn] = [device];
                    }
                    else {
                        usyncFetch[normalizedPn].push(device);
                    }
                    continue;
                }
            }
            lidUser = lidUser.toString();
            if (!lidUser) {
                this.logger.warn(`Invalid or empty LID user for PN ${pn}: lidUser = "${lidUser}"`);
                return null;
            }
            const pnDevice = decoded.device !== undefined ? decoded.device : 0;
            const deviceSpecificLid = `${lidUser}${!!pnDevice ? `:${pnDevice}` : ``}@${decoded.server === 'hosted' ? 'hosted.lid' : 'lid'}`;
            this.logger.trace(`getLIDForPN: ${pn} → ${deviceSpecificLid} (user mapping with device ${pnDevice})`);
            successfulPairs[pn] = { lid: deviceSpecificLid, pn };
        }
        if (Object.keys(usyncFetch).length > 0) {
            const result = await (this.pnToLIDFunc === null || this.pnToLIDFunc === void 0 ? void 0 : this.pnToLIDFunc(Object.keys(usyncFetch)));
            if (result && result.length > 0) {
                await this.storeLIDPNMappings(result);
                for (const pair of result) {
                    const pnDecoded = (0, WABinary_1.jidDecode)(pair.pn);
                    const pnUser = pnDecoded === null || pnDecoded === void 0 ? void 0 : pnDecoded.user;
                    if (!pnUser)
                        continue;
                    const lidUser = (0, WABinary_1.jidDecode)(pair.lid).user;
                    if (!lidUser)
                        continue;
                    for (const device of usyncFetch[pair.pn]) {
                        const deviceSpecificLid = `${lidUser}${!!device ? `:${device}` : ``}@${device === 99 ? 'hosted.lid' : 'lid'}`;
                        this.logger.trace(`getLIDForPN: USYNC success for ${pair.pn} → ${deviceSpecificLid} (user mapping with device ${device})`);
                        const deviceSpecificPn = `${pnUser}${!!device ? `:${device}` : ``}@${device === 99 ? 'hosted' : 's.whatsapp.net'}`;
                        successfulPairs[deviceSpecificPn] = { lid: deviceSpecificLid, pn: deviceSpecificPn };
                    }
                }
            }
            else {
                return null;
            }
        }
        return Object.values(successfulPairs);
    }
    async getPNForLID(lid) {
        if (!(0, WABinary_1.isLidUser)(lid))
            return null;
        const decoded = (0, WABinary_1.jidDecode)(lid);
        if (!decoded)
            return null;
        const lidUser = decoded.user;
        let pnUser = this.mappingCache.get(`lid:${lidUser}`);
        if (!pnUser || typeof pnUser !== 'string') {
            const stored = await this.keys.get('lid-mapping', [`${lidUser}_reverse`]);
            pnUser = stored[`${lidUser}_reverse`];
            if (!pnUser || typeof pnUser !== 'string') {
                this.logger.trace(`No reverse mapping found for LID user: ${lidUser}`);
                return null;
            }
            this.mappingCache.set(`lid:${lidUser}`, pnUser);
        }
        const lidDevice = decoded.device !== undefined ? decoded.device : 0;
        const pnJid = `${pnUser}:${lidDevice}@${decoded.domainType === WABinary_1.WAJIDDomains.HOSTED_LID ? 'hosted' : 's.whatsapp.net'}`;
        this.logger.trace(`Found reverse mapping: ${lid} → ${pnJid}`);
        return pnJid;
    }
}
exports.LIDMappingStore = LIDMappingStore;
