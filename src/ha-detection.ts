/**
 * Home Assistant auto-detection.
 *
 * Probes well-known local HA URLs in order of likelihood.
 * Returns { detected: true, url, version } when found, else { detected: false }.
 */

const HA_PROBE_URLS = [
  "http://localhost:8123",
  "http://homeassistant.local:8123",
  "http://127.0.0.1:8123",
];

const PROBE_TIMEOUT_MS = 3_000;

interface HaDetectionResult {
  detected: boolean;
  url: string | null;
  version: string | null;
}

async function probeHaUrl(baseUrl: string): Promise<HaDetectionResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);

  try {
    const res = await fetch(`${baseUrl}/api/`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    clearTimeout(timer);

    if (!res.ok) return { detected: false, url: null, version: null };

    // HA returns { "message": "API running." } for unauthenticated /api/
    const body = await res.json().catch(() => null);
    if (!body || typeof body !== "object") return { detected: false, url: null, version: null };

    // Extract version from X-HA-Version header if present
    const version = res.headers.get("x-ha-version") ?? null;

    return { detected: true, url: baseUrl, version };
  } catch {
    clearTimeout(timer);
    return { detected: false, url: null, version: null };
  }
}

export async function detectHomeAssistant(): Promise<HaDetectionResult> {
  for (const url of HA_PROBE_URLS) {
    const result = await probeHaUrl(url);
    if (result.detected) {
      console.log(`KomDash Agent: Home Assistant detected at ${url} (version: ${result.version ?? "unknown"})`);
      return result;
    }
  }
  return { detected: false, url: null, version: null };
}
