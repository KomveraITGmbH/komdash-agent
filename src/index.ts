import os from "node:os";
import { execFile } from "node:child_process";
import type { AgentCheckinInput, AgentCheckinMount, MountKind } from "./types.js";
import { detectHomeAssistant } from "./ha-detection.js";
import { startTunnel } from "./tunnel.js";

const KOMDASH_URL = process.env.KOMDASH_URL;
const AGENT_KEY = process.env.AGENT_KEY;
const CHECKIN_INTERVAL_SECONDS = Number(process.env.CHECKIN_INTERVAL_SECONDS) || 60;

if (!KOMDASH_URL || !AGENT_KEY) {
  console.error("KomDash Agent: KOMDASH_URL and AGENT_KEY environment variables are required.");
  process.exit(1);
}

const CHECKIN_URL = `${KOMDASH_URL.replace(/\/+$/, "")}/api/agent/checkin`;

// Pseudo filesystems we never report as storage mounts.
const IGNORED_FS_TYPES = new Set([
  "tmpfs",
  "devtmpfs",
  "proc",
  "sysfs",
  "cgroup",
  "cgroup2",
  "devpts",
  "overlay",
  "squashfs",
  "fuse.lxcfs",
  "fusectl",
  "mqueue",
  "tracefs",
  "debugfs",
  "configfs",
  "securityfs",
  "pstore",
  "binfmt_misc",
  "autofs",
  "rpc_pipefs",
  "efivarfs",
]);

function mountKindForFsType(fsType: string): MountKind | null {
  const type = fsType.toLowerCase();
  if (IGNORED_FS_TYPES.has(type)) return null;
  if (type.startsWith("nfs")) return "nfs";
  if (type === "cifs" || type === "smb" || type === "smb3" || type === "smbfs") return "smb";
  return "local";
}

function getInternalIp(): string {
  const interfaces = os.networkInterfaces();
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries ?? []) {
      if (entry.family === "IPv4" && !entry.internal) {
        return entry.address;
      }
    }
  }
  return "";
}

function cpuSnapshot() {
  return os.cpus().map((cpu) => ({ ...cpu.times }));
}

async function getCpuUsagePct(sampleMs = 300): Promise<number | null> {
  const start = cpuSnapshot();
  await new Promise((resolve) => setTimeout(resolve, sampleMs));
  const end = cpuSnapshot();

  let idleDelta = 0;
  let totalDelta = 0;

  for (let i = 0; i < start.length; i++) {
    const startTimes = start[i];
    const endTimes = end[i];
    const startTotal = startTimes.user + startTimes.nice + startTimes.sys + startTimes.idle + startTimes.irq;
    const endTotal = endTimes.user + endTimes.nice + endTimes.sys + endTimes.idle + endTimes.irq;
    idleDelta += endTimes.idle - startTimes.idle;
    totalDelta += endTotal - startTotal;
  }

  if (totalDelta <= 0) return null;
  const usage = 1 - idleDelta / totalDelta;
  return Math.max(0, Math.min(100, Math.round(usage * 100)));
}

function getRamUsagePct(): number {
  const total = os.totalmem();
  const free = os.freemem();
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round(((total - free) / total) * 100)));
}

function runDf(): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile("df", ["-PT", "-k"], { timeout: 10_000 }, (error, stdout) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(stdout);
    });
  });
}

function parseDfOutput(output: string): AgentCheckinMount[] {
  const lines = output.trim().split("\n");
  const mounts: AgentCheckinMount[] = [];

  // Skip the header row.
  for (const line of lines.slice(1)) {
    const fields = line.trim().split(/\s+/);
    if (fields.length < 7) continue;

    const [, fsType, totalKb, usedKb, availKb] = fields;
    const mountPoint = fields.slice(6).join(" ");
    const kind = mountKindForFsType(fsType);
    if (!kind) continue;

    const totalBytes = Number(totalKb) * 1024;
    const usedBytes = Number(usedKb) * 1024;
    const freeBytes = Number(availKb) * 1024;

    mounts.push({
      mountPoint,
      fsType,
      mountKind: kind,
      totalBytes: Number.isFinite(totalBytes) ? totalBytes : null,
      usedBytes: Number.isFinite(usedBytes) ? usedBytes : null,
      freeBytes: Number.isFinite(freeBytes) ? freeBytes : null,
    });
  }

  return mounts;
}

async function getMounts(): Promise<AgentCheckinMount[]> {
  try {
    const output = await runDf();
    return parseDfOutput(output);
  } catch (error) {
    console.error("KomDash Agent: failed to read disk mounts via df:", (error as Error).message);
    return [];
  }
}

// HA stats fetched via Supervisor API
let haStats: {
  entityCount: number | null;
  automationCount: number | null;
  deviceCount: number | null;
  backupStatus: "ok" | "warning" | "failed" | "unknown";
} = {
  entityCount: null,
  automationCount: null,
  deviceCount: null,
  backupStatus: "unknown",
};

async function refreshHaStats(): Promise<void> {
  const token = process.env.SUPERVISOR_TOKEN;
  if (!token) {
    console.log("KomDash Agent: SUPERVISOR_TOKEN not available, skipping HA stats");
    return;
  }

  console.log("KomDash Agent: fetching HA stats via Supervisor API...");

  // Entity / automation / device counts via HA Core states API
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8_000);
    const res = await fetch("http://supervisor/core/api/states", {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (res.ok) {
      const states: Array<{ entity_id: string; attributes?: { device_id?: string } }> = await res.json();
      const deviceIds = new Set(
        states
          .map(s => s.attributes?.device_id)
          .filter((id): id is string => typeof id === "string" && id.length > 0),
      );
      haStats = {
        ...haStats,
        entityCount: states.length,
        automationCount: states.filter(s => s.entity_id.startsWith("automation.")).length,
        deviceCount: deviceIds.size > 0 ? deviceIds.size : null,
      };
      console.log(`KomDash Agent: HA stats — entities: ${haStats.entityCount}, automations: ${haStats.automationCount}, devices: ${haStats.deviceCount}`);
    } else {
      console.warn(`KomDash Agent: HA states API returned ${res.status}`);
    }
  } catch (err) {
    console.warn("KomDash Agent: HA states fetch failed:", (err as Error).message);
  }

  // Backup status via Supervisor API
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8_000);
    const res = await fetch("http://supervisor/backups", {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (res.ok) {
      const body: { data?: { backups?: Array<{ date: string }> } } = await res.json();
      const backups = body?.data?.backups ?? [];
      if (backups.length === 0) {
        haStats = { ...haStats, backupStatus: "warning" };
      } else {
        // Warn if the newest backup is older than 7 days
        const newest = backups
          .map(b => new Date(b.date).getTime())
          .filter(t => !isNaN(t))
          .sort((a, b) => b - a)[0];
        const ageMs = newest ? Date.now() - newest : Infinity;
        haStats = {
          ...haStats,
          backupStatus: ageMs < 7 * 24 * 60 * 60 * 1000 ? "ok" : "warning",
        };
      }
    }
  } catch {
    // Supervisor backup API not available — keep previous status
  }
}

// HA detection state — refreshed every 5 minutes
let haState = { detected: false, url: null as string | null, version: null as string | null };

async function refreshHaDetection() {
  const result = await detectHomeAssistant();
  haState = { detected: result.detected, url: result.url, version: result.version };
}

async function collectCheckinPayload(): Promise<AgentCheckinInput> {
  const [cpuPct, mounts] = await Promise.all([getCpuUsagePct(), getMounts()]);

  return {
    hostname: os.hostname(),
    internalIp: getInternalIp(),
    os: `${os.platform()} ${os.release()}`,
    cpuPct,
    ramPct: getRamUsagePct(),
    uptimeSeconds: Math.floor(os.uptime()),
    mounts,
    haDetected: haState.detected,
    haUrl: haState.url,
    haVersion: haState.version,
    haEntityCount: haStats.entityCount,
    haAutomationCount: haStats.automationCount,
    haDeviceCount: haStats.deviceCount,
    haBackupStatus: haStats.backupStatus,
  };
}

async function sendCheckin(payload: AgentCheckinInput): Promise<void> {
  const response = await fetch(CHECKIN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${AGENT_KEY}`,
      "User-Agent": "KomDash-Agent/1.0",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Checkin failed with status ${response.status}: ${body}`);
  }
}

async function checkinWithRetry(): Promise<void> {
  const maxAttempts = 5;
  let attempt = 0;
  let delayMs = 2000;

  while (attempt < maxAttempts) {
    attempt++;
    try {
      const payload = await collectCheckinPayload();
      await sendCheckin(payload);
      console.log(`KomDash Agent: checkin succeeded at ${new Date().toISOString()}`);
      return;
    } catch (error) {
      console.error(
        `KomDash Agent: checkin attempt ${attempt}/${maxAttempts} failed:`,
        (error as Error).message,
      );
      if (attempt >= maxAttempts) return;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      delayMs = Math.min(delayMs * 2, 60_000);
    }
  }
}

const HA_DETECT_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

async function main() {
  console.log(`KomDash Agent: starting, checking in every ${CHECKIN_INTERVAL_SECONDS}s to ${CHECKIN_URL}`);

  // Initial HA detection and stats before first checkin
  await refreshHaDetection();
  await refreshHaStats();

  // Start WebSocket tunnel (reconnects automatically)
  startTunnel(haState.url ?? "http://localhost:8123");

  // Refresh HA detection and stats every 5 minutes
  setInterval(() => {
    refreshHaDetection().catch((err) =>
      console.error("KomDash Agent: HA detection error:", (err as Error).message),
    );
    refreshHaStats().catch(() => {});
  }, HA_DETECT_INTERVAL_MS);

  // Checkin loop
  // eslint-disable-next-line no-constant-condition
  while (true) {
    await checkinWithRetry();
    await new Promise((resolve) => setTimeout(resolve, CHECKIN_INTERVAL_SECONDS * 1000));
  }
}

void main();
