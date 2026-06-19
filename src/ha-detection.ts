/**
 * Home Assistant auto-detection.
 *
 * Tries multiple known HA endpoints including all local host IPs.
 * With host_network:true the add-on shares the host's network namespace,
 * so probing the host's own IPs (e.g. 192.168.x.x:8123) is the most
 * reliable way to reach HA Core in HA OS.
 */

import os from "node:os";

const PROBE_TIMEOUT_MS = 3_000;

interface HaDetectionResult {
  detected: boolean;
  url: string | null;
  version: string | null;
}

function getLocalIps(): string[] {
  const ips: string[] = [];
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === "IPv4" && !entry.internal) {
        ips.push(entry.address);
      }
    }
  }
  return ips;
}

async function probeHaUrl(baseUrl: string, token?: string): Promise<HaDetectionResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);

  try {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const res = await fetch(`${baseUrl}/api/`, { signal: controller.signal, headers });
    clearTimeout(timer);

    // Modern HA always includes x-ha-version, even on 401
    const version = res.headers.get("x-ha-version") ?? null;
    if (version) return { detected: true, url: baseUrl, version };

    // Older HA returns 200 with { message: "API running." }
    if (res.ok) {
      const body = await res.json().catch(() => null);
      if (body && typeof body === "object") return { detected: true, url: baseUrl, version: null };
    }

    return { detected: false, url: null, version: null };
  } catch {
    clearTimeout(timer);
    return { detected: false, url: null, version: null };
  }
}

export async function detectHomeAssistant(): Promise<HaDetectionResult> {
  const supervisorToken = process.env.SUPERVISOR_TOKEN;

  // Build probe list — local IPs first (most reliable with host_network:true)
  const localIpUrls = getLocalIps().map((ip) => `http://${ip}:8123`);

  const probeUrls = [
    ...localIpUrls,
    "http://172.30.32.2:8123",       // HA Core on hassio bridge (host_network)
    "http://localhost:8123",
    "http://127.0.0.1:8123",
    "http://homeassistant.local:8123",
    "http://homeassistant:8123",
    "http://hassio.local:8123",
  ];

  // Try supervisor proxy first if token is available
  if (supervisorToken) {
    for (const supervisorUrl of [
      "http://172.30.32.1/core",
      "http://supervisor/core",
    ]) {
      const result = await probeHaUrl(supervisorUrl, supervisorToken);
      if (result.detected) {
        const haUrl = localIpUrls[0] ?? "http://homeassistant.local:8123";
        console.log(`KomDash Agent: Home Assistant detected via Supervisor (version: ${result.version ?? "unknown"}), using ${haUrl}`);
        return { ...result, url: haUrl };
      }
    }
  }

  for (const url of probeUrls) {
    const result = await probeHaUrl(url);
    if (result.detected) {
      console.log(`KomDash Agent: Home Assistant detected at ${url} (version: ${result.version ?? "unknown"})`);
      return result;
    }
  }

  return { detected: false, url: null, version: null };
}
