"use strict"

Object.defineProperty(exports, "__esModule", { value: true })

const { DEFAULT_CONNECTION_CONFIG } = require("../Defaults")
const { makeCommunitiesSocket } = require("./communities")

global.__SOCKET_MAP__ = global.__SOCKET_MAP__ || new Map()

/**
 * @param {Object} config
 * @param {String} sessionId
 */
const makeWASocket = async (config, sessionId = "primary") => {
  const existing = global.__SOCKET_MAP__.get(sessionId)

  if (existing?.ws) {
    await new Promise((resolve) => {
      let settled = false

      const done = () => {
        if (settled) return
        settled = true

        try {
          existing.ws.removeAllListeners()
          existing.ev?.removeAllListeners?.()
        } catch {}

        global.__SOCKET_MAP__.delete(sessionId)
        resolve()
      }

    
      const timeout = setTimeout(() => {
        try {
          existing.ws.terminate?.()
        } catch {}
        done()
      }, 1500)

      try {
        existing.ws.once("close", () => {
          clearTimeout(timeout)
          done()
        })

        // request graceful close
        if (
          existing.ws.readyState === 0 || // CONNECTING
          existing.ws.readyState === 1    // OPEN
        ) {
          existing.ws.close()
        } else {
          clearTimeout(timeout)
          done()
        }
      } catch {
        clearTimeout(timeout)
        done()
      }
    })
  }
  const sock = makeCommunitiesSocket({
    ...DEFAULT_CONNECTION_CONFIG,
    ...config
  })

  global.__SOCKET_MAP__.set(sessionId, sock)

  sock.ws?.once("close", () => {
    if (global.__SOCKET_MAP__.get(sessionId) === sock) {
      global.__SOCKET_MAP__.delete(sessionId)
    }
  })

  return sock
}

exports.default = makeWASocket
