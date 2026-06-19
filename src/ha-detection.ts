/**
 * Home Assistant auto-detection.
 *
 * On the hassio Docker network "homeassistant" resolves directly to HA Core.
 * Any HTTP response from homeassistant:8123 confirms HA is running.
 */

const PROBE_TIMEOUT_MS = 3_000;

interface HaDetectionResult {
  detected: boolean;
  url: string | null;
  version: string | null;
}

async function probeHaUrl(baseUrl: string, requireHeader = false): Promise<HaDetectionResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);

  try {
    const res = await fetch(`${baseUrl}/api/`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    clearTimeout(timer);

    const version = res.headers.get("x-ha-version") ?? null;

    // If we got any HTTP response (even 401/403), it's HA
    if (!requireHeader) {
      return { detected: true, url: baseUrl, version };
    }

    // Fallback: require x-ha-version or 200 + JSON body
    if (version) return { detected: true, url: baseUrl, version };
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
  // hassio Docker network — "homeassistant" resolves directly to HA Core
  // Any response means HA is there
  const hassioResult = await probeHaUrl("http://homeassistant:8123", false);
  if (hassioResult.detected) {
    console.log(`KomDash Agent: Home Assistant detected at homeassistant:8123 (version: ${hassioResult.version ?? "unknown"})`);
    return hassioResult;
  }

  // Supervisor proxy
  const supervisorResult = await probeHaUrl("http://supervisor/core", false);
  if (supervisorResult.detected) {
    console.log(`KomDash Agent: Home Assistant detected via Supervisor (version: ${supervisorResult.version ?? "unknown"})`);
    return { ...supervisorResult, url: "http://homeassistant:8123" };
  }

  // Fallback probes — require x-ha-version or 200
  for (const url of [
    "http://localhost:8123",
    "http://127.0.0.1:8123",
    "http://homeassistant.local:8123",
  ]) {
    const result = await probeHaUrl(url, true);
    if (result.detected) {
      console.log(`KomDash Agent: Home Assistant detected at ${url} (version: ${result.version ?? "unknown"})`);
      return result;
    }
  }

  return { detected: false, url: null, version: null };
}
