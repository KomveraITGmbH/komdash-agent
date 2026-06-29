/**
 * KomDash Agent Tunnel — persistent WebSocket connection to the KomDash relay server.
 *
 * The agent connects OUTBOUND (no port forwarding needed).
 * KomDash forwards HTTP and WebSocket requests through this connection.
 *
 * Protocol messages: JSON objects with a "type" discriminator field.
 */

import { WebSocket } from "ws";

const KOMDASH_URL = process.env.KOMDASH_URL!;
const AGENT_KEY = process.env.AGENT_KEY!;

const WS_URL = KOMDASH_URL.replace(/^http/, "ws").replace(/\/+$/, "") + "/api/tunnel/ws";

// Exponential backoff: 2s → 4s → 8s → … → 60s max
const INITIAL_BACKOFF_MS = 2_000;
const MAX_BACKOFF_MS = 60_000;

// ---------------------------------------------------------------------------
// Active WebSocket channels: channelId → WS connection to local HA
// ---------------------------------------------------------------------------

const activeChannels = new Map<string, WebSocket>();

// ---------------------------------------------------------------------------
// Handle messages from the KomDash relay server
// ---------------------------------------------------------------------------

async function handleMessage(raw: string, send: (msg: object) => void, haUrl: string) {
  let msg: Record<string, unknown>;
  try {
    msg = JSON.parse(raw);
  } catch {
    return;
  }

  switch (msg.type) {
    case "ping":
      send({ type: "pong" });
      break;

    case "http_req": {
      const { id, method, path, headers, body } = msg as {
        id: string;
        method: string;
        path: string;
        headers: Record<string, string>;
        body: string | null;
      };

      // /api/hassio_ingress/ → Supervisor directly (authenticated via ingress_session cookie)
      // Everything else including /api/hassio/ → HA Core, which validates the Bearer token
      // and proxies to the Supervisor with its own SUPERVISOR_TOKEN
      const base = path.startsWith("/api/hassio_ingress")
        ? "http://supervisor"
        : haUrl.replace(/\/+$/, "");
      const url = base + path;
      const requestBody = body ? Buffer.from(body, "base64") : undefined;

      // Remove headers that would confuse the local HA server.
      // X-Forwarded-* headers cause HA to return 400 if the source IP
      // is not listed in trusted_proxies.
      const fwdHeaders: Record<string, string> = { ...headers };
      delete fwdHeaders["host"];
      delete fwdHeaders["x-forwarded-for"];
      delete fwdHeaders["x-forwarded-proto"];
      delete fwdHeaders["x-forwarded-host"];
      delete fwdHeaders["x-real-ip"];

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30_000);

        const res = await fetch(url, {
          method,
          headers: fwdHeaders,
          body: requestBody,
          signal: controller.signal,
          // @ts-ignore — Node.js 18+ fetch option
          redirect: "manual",
        });
        clearTimeout(timeout);

        const resBody = Buffer.from(await res.arrayBuffer());
        const resHeaders: Record<string, string> = {};
        res.headers.forEach((v, k) => {
          resHeaders[k] = v;
        });

        send({
          type: "http_res",
          id,
          status: res.status,
          headers: resHeaders,
          body: resBody.toString("base64"),
        });
      } catch (err) {
        send({
          type: "http_res",
          id,
          status: 502,
          headers: { "content-type": "text/plain" },
          body: Buffer.from(`Agent error: ${(err as Error).message}`).toString("base64"),
        });
      }
      break;
    }

    case "ws_open": {
      const { channelId, path, headers } = msg as {
        channelId: string;
        path: string;
        headers: Record<string, string>;
      };

      const wsBase = path.startsWith("/api/hassio_ingress")
        ? "ws://supervisor"
        : haUrl.replace(/^http/, "ws").replace(/\/+$/, "");
      const wsUrl = wsBase + path;
      const fwdHeaders: Record<string, string> = { ...headers };
      delete fwdHeaders["host"];
      delete fwdHeaders["origin"];
      // Remove HTTP upgrade handshake headers — the ws library generates these automatically.
      // Forwarding them results in duplicate headers and can cause the HA/Supervisor handshake to fail.
      delete fwdHeaders["sec-websocket-key"];
      delete fwdHeaders["sec-websocket-extensions"];
      delete fwdHeaders["sec-websocket-version"];

      // Pass Sec-WebSocket-Protocol as the protocols argument so the ws library
      // handles negotiation correctly instead of treating it as a raw header.
      const wsProtocols = fwdHeaders["sec-websocket-protocol"]
        ? fwdHeaders["sec-websocket-protocol"].split(",").map((p) => p.trim())
        : undefined;
      delete fwdHeaders["sec-websocket-protocol"];

      try {
        const haWs = new WebSocket(wsUrl, wsProtocols, { headers: fwdHeaders });

        haWs.on("open", () => {
          activeChannels.set(channelId, haWs);
          send({ type: "ws_opened", channelId });
        });

        haWs.on("message", (data: Buffer, isBinary: boolean) => {
          send({
            type: "ws_msg",
            channelId,
            data: (data as Buffer).toString("base64"),
            isBinary,
          });
        });

        haWs.on("close", () => {
          activeChannels.delete(channelId);
          send({ type: "ws_closed", channelId });
        });

        haWs.on("error", (err) => {
          activeChannels.delete(channelId);
          send({ type: "ws_error", channelId, error: err.message });
        });
      } catch (err) {
        send({ type: "ws_error", channelId, error: (err as Error).message });
      }
      break;
    }

    case "ws_msg": {
      const { channelId, data, isBinary } = msg as {
        channelId: string;
        data: string;
        isBinary: boolean;
      };
      const haWs = activeChannels.get(channelId);
      if (haWs?.readyState === WebSocket.OPEN) {
        haWs.send(Buffer.from(data, "base64"), { binary: isBinary });
      }
      break;
    }

    case "ws_close": {
      const { channelId } = msg as { channelId: string };
      const haWs = activeChannels.get(channelId);
      if (haWs) {
        haWs.close();
        activeChannels.delete(channelId);
      }
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// Connect with exponential backoff
// ---------------------------------------------------------------------------

export function startTunnel(haUrl: string): void {
  let backoff = INITIAL_BACKOFF_MS;
  let stopped = false;

  function connect() {
    if (stopped) return;

    console.log(`KomDash Agent: connecting tunnel to ${WS_URL}`);

    const ws = new WebSocket(WS_URL, {
      headers: { Authorization: `Bearer ${AGENT_KEY}` },
    });

    const send = (msg: object) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg));
      }
    };

    ws.on("open", () => {
      console.log("KomDash Agent: tunnel connected");
      backoff = INITIAL_BACKOFF_MS; // reset backoff on successful connect
    });

    ws.on("message", (data) => {
      handleMessage(data.toString(), send, haUrl).catch((err) => {
        console.error("KomDash Agent: tunnel message error:", err.message);
      });
    });

    ws.on("close", (code, reason) => {
      // Close all active HA WebSocket channels
      for (const haWs of activeChannels.values()) {
        haWs.close();
      }
      activeChannels.clear();

      if (!stopped) {
        console.log(
          `KomDash Agent: tunnel closed (${code} ${reason.toString()}), reconnecting in ${backoff / 1000}s`,
        );
        setTimeout(() => {
          backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
          connect();
        }, backoff);
      }
    });

    ws.on("error", (err) => {
      // Error is always followed by close — reconnect is handled there
      console.error("KomDash Agent: tunnel error:", err.message);
    });
  }

  connect();
}
