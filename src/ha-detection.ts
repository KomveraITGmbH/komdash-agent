/**
 * Home Assistant auto-detection.
 *
 * Probes well-known local HA URLs. Accepts both 200 (older HA) and 401
 * (newer HA that requires auth) as "HA is here" signals — the x-ha-version
 * header is present in both cases.
 */

const HA_PROBE_URLS = [
  "http://localhost:8123",
  "http://127.0.0.1:8123",
  "http://homeassistant.local:8123",
  "http://homeassistant:8123",
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

    // HA always sends x-ha-version, even on 401 (auth required)
    const version = res.headers.get("x-ha-version") ?? null;
    if (version) {
      return { detected: true, url: baseUrl, version };
    }

    // Older HA (pre-2021) returns 200 with { message: "API running." }
    if (res.ok) {
      const body = await res.json().catch(() => null);
      if (body && typeof body === "object") {
        return { detected: true, url: baseUrl, version: null };
      }
    }

    return { detected: false, url: null, version: null };
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
