/**
 * Home Assistant auto-detection.
 *
 * Without host_network the add-on runs on the hassio Docker network where
 * "homeassistant" resolves directly to HA Core — no manual config needed.
 */

const PROBE_TIMEOUT_MS = 3_000;

interface HaDetectionResult {
  detected: boolean;
  url: string | null;
  version: string | null;
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

const HA_PROBE_URLS = [
  "http://homeassistant:8123",       // hassio Docker network (primary, no host_network needed)
  "http://supervisor/core",          // Supervisor proxy
  "http://localhost:8123",
  "http://127.0.0.1:8123",
  "http://homeassistant.local:8123",
];

export async function detectHomeAssistant(): Promise<HaDetectionResult> {
  const supervisorToken = process.env.SUPERVISOR_TOKEN;

  for (const url of HA_PROBE_URLS) {
    const result = await probeHaUrl(url, supervisorToken);
    if (result.detected) {
      console.log(`KomDash Agent: Home Assistant detected at ${url} (version: ${result.version ?? "unknown"})`);
      return result;
    }
  }

  return { detected: false, url: null, version: null };
}
