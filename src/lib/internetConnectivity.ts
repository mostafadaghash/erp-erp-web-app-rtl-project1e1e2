const PROBE_INTERVAL_MS = 6000;
const PROBE_TIMEOUT_MS = 3500;
const PROBE_URLS = [
  "https://www.gstatic.com/generate_204",
  "https://1.1.1.1/cdn-cgi/trace",
] as const;

let lastReportedState: boolean | null = null;
let probeInFlight = false;

function publishConnectivity(online: boolean) {
  if (lastReportedState === online) return;
  lastReportedState = online;
  window.dispatchEvent(new Event(online ? "online" : "offline"));
}

async function probeUrl(url: string): Promise<void> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    await fetch(`${url}${url.includes("?") ? "&" : "?"}erp_probe=${Date.now()}`, {
      method: "GET",
      mode: "no-cors",
      cache: "no-store",
      credentials: "omit",
      signal: controller.signal,
    });
  } finally {
    window.clearTimeout(timeout);
  }
}

async function checkInternetConnectivity() {
  if (probeInFlight) return;
  probeInFlight = true;
  try {
    if (!navigator.onLine) {
      publishConnectivity(false);
      return;
    }
    const results = await Promise.allSettled(PROBE_URLS.map((url) => probeUrl(url)));
    publishConnectivity(results.some((result) => result.status === "fulfilled"));
  } finally {
    probeInFlight = false;
  }
}

if (typeof window !== "undefined") {
  void checkInternetConnectivity();
  window.setInterval(() => void checkInternetConnectivity(), PROBE_INTERVAL_MS);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void checkInternetConnectivity();
  });
}
