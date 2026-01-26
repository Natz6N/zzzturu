/**
 * Custom SQLite Auth Store untuk Baileys
 * by Ryuu
 */

//import Database from "bun:sqlite"; 
//jika menggunakan bun runtime
import Database from "better-sqlite3";
/**
 * Membuat atau mengambil auth state dari SQLite
 * @param {string} dbPath - Lokasi file SQLite (contoh: "./auth.db")
 */
export default async function useSQLiteAuthState(dbPath = "./auth.db", baileys) {
    const {
        proto,
        BufferJSON,
        initAuthCreds
    } = baileys;
    const db = new Database(dbPath);
    db.pragma("journal_mode = WAL");

    db.prepare(`
    CREATE TABLE IF NOT EXISTS baileys_state (
      key TEXT PRIMARY KEY,
      value BLOB
    )
  `).run();

    const load = (key) => {
        const row = db.prepare("SELECT value FROM baileys_state WHERE key = ?").get(key);
        if (!row) return null;
        try {
            return JSON.parse(row.value.toString(), BufferJSON.reviver);
        } catch {
            return null;
        }
    };

    const save = (key, data) => {
        const json = JSON.stringify(data, BufferJSON.replacer);
        const buf = Buffer.from(json, "utf8");
        db.prepare("REPLACE INTO baileys_state (key, value) VALUES (?, ?)").run(key, buf);
    };

    const creds = load("creds") || initAuthCreds();

    const keys = {};
    const categories = [
        "pre-key",
        "session",
        "sender-key",
        "app-state-sync-key",
        "app-state-sync-version"
    ];

    for (const category of categories) {
        keys[category] = {};
        const rows = db
            .prepare("SELECT key, value FROM baileys_state WHERE key LIKE ?")
            .all(`${category}:%`);
        for (const row of rows) {
            try {
                keys[category][row.key.slice(category.length + 1)] = JSON.parse(row.value.toString());
            } catch {}
        }
    }

    async function saveCreds() {
        save("creds", creds);
    }

    const set = (category, id, value) => {
        const key = `${category}:${id}`;
        save(key, value);
    };

    const get = (category, id) => {
        const key = `${category}:${id}`;
        return load(key);
    };

    const del = (category, id) => {
        const key = `${category}:${id}`;
        db.prepare("DELETE FROM baileys_state WHERE key = ?").run(key);
    };

    return {
        state: {
            creds,
            keys: {
                get: async (type, ids) => {
                    const data = {};
                    for (const id of ids) {
                        const value = load(`${type}:${id}`);
                        if (value) data[id] = value;
                    }
                    return data;
                },
                set: async (data) => {
                    for (const category in data) {
                        for (const id in data[category]) {
                            const value = data[category][id];
                            save(`${category}:${id}`, value);
                        }
                    }
                }
            }
        },
        saveCreds: async () => save("creds", creds)
    };
    setInterval(async () => {
        await save("creds", creds);
    }, 30_000);
}