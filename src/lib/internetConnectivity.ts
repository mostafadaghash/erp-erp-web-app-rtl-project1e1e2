const PROBE_INTERVAL_MS = 5000;
const PROBE_TIMEOUT_MS = 2500;
const CONNECTIVITY_EVENT = "business-tech-erp:internet-connectivity";
const PROBE_URLS = [
  "https://www.gstatic.com/generate_204",
  "https://1.1.1.1/cdn-cgi/trace",
] as const;

export type InternetConnectivityState = "checking" | "online" | "offline";

let currentState: InternetConnectivityState = "checking";
let probeInFlight = false;

function publishConnectivity(nextState: InternetConnectivityState) {
  if (currentState === nextState) return;
  currentState = nextState;
  window.dispatchEvent(new CustomEvent<InternetConnectivityState>(CONNECTIVITY_EVENT, {
    detail: nextState,
  }));
}

export function getInternetConnectivityState(): InternetConnectivityState {
  return currentState;
}

export function subscribeInternetConnectivity(
  listener: (state: InternetConnectivityState) => void,
): () => void {
  const handleConnectivity = (event: Event) => {
    const detail = (event as CustomEvent<InternetConnectivityState>).detail;
    if (detail === "checking" || detail === "online" || detail === "offline") {
      listener(detail);
    }
  };
  window.addEventListener(CONNECTIVITY_EVENT, handleConnectivity);
  listener(currentState);
  return () => window.removeEventListener(CONNECTIVITY_EVENT, handleConnectivity);
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

export async function checkInternetConnectivity(): Promise<void> {
  if (probeInFlight) return;
  if (!navigator.onLine) {
    publishConnectivity("offline");
    return;
  }

  probeInFlight = true;
  try {
    const results = await Promise.allSettled(PROBE_URLS.map((url) => probeUrl(url)));
    publishConnectivity(results.some((result) => result.status === "fulfilled") ? "online" : "offline");
  } finally {
    probeInFlight = false;
  }
}

if (typeof window !== "undefined") {
  const handleNativeOffline = () => publishConnectivity("offline");
  const handleNativeOnline = () => {
    publishConnectivity("checking");
    void checkInternetConnectivity();
  };
  const handleFocus = () => void checkInternetConnectivity();
  const handleVisibility = () => {
    if (document.visibilityState === "visible") void checkInternetConnectivity();
  };

  window.addEventListener("offline", handleNativeOffline);
  window.addEventListener("online", handleNativeOnline);
  window.addEventListener("focus", handleFocus);
  document.addEventListener("visibilitychange", handleVisibility);

  void checkInternetConnectivity();
  window.setInterval(() => void checkInternetConnectivity(), PROBE_INTERVAL_MS);
}
