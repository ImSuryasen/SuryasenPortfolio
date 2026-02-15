import {
  exportEditableDataSnapshot,
  importEditableDataSnapshot,
  setIdbWriteListener,
  storage
} from "./storage.js";

const DEFAULTS = {
  enabled: false,
  owner: "",
  repo: "",
  branch: "main",
  path: "data/user-content.json",
  tokenStorageKey: "portfolio.githubSyncToken"
};

const STATE = {
  config: { ...DEFAULTS },
  timer: null,
  running: null,
  initialized: false
};

function normalizeConfig(config = {}) {
  return {
    ...DEFAULTS,
    ...config,
    enabled: Boolean(config.enabled),
    owner: String(config.owner || "").trim(),
    repo: String(config.repo || "").trim(),
    branch: String(config.branch || DEFAULTS.branch).trim(),
    path: String(config.path || DEFAULTS.path).trim(),
    tokenStorageKey: String(config.tokenStorageKey || DEFAULTS.tokenStorageKey).trim()
  };
}

function encodeBase64Utf8(value) {
  return btoa(unescape(encodeURIComponent(String(value || ""))));
}

function decodeBase64Utf8(value) {
  return decodeURIComponent(escape(atob(String(value || ""))));
}

function rawContentUrl(config) {
  const owner = encodeURIComponent(config.owner);
  const repo = encodeURIComponent(config.repo);
  const branch = encodeURIComponent(config.branch);
  const path = config.path
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;
}

function contentsApiUrl(config) {
  const owner = encodeURIComponent(config.owner);
  const repo = encodeURIComponent(config.repo);
  const path = config.path
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  return `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
}

function getToken() {
  const key = STATE.config.tokenStorageKey;
  if (!key) return "";
  return String(localStorage.getItem(key) || "").trim();
}

export function setGithubSyncToken(token = "") {
  const key = STATE.config.tokenStorageKey;
  if (!key) return;

  const value = String(token || "").trim();
  if (!value) {
    localStorage.removeItem(key);
    return;
  }

  localStorage.setItem(key, value);
}

async function fetchRemoteSnapshot() {
  const config = STATE.config;
  if (!config.enabled || !config.owner || !config.repo) return null;

  try {
    const response = await fetch(`${rawContentUrl(config)}?t=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) return null;
    const payload = await response.json();
    if (!payload || typeof payload !== "object") return null;
    return payload;
  } catch {
    return null;
  }
}

async function getExistingRemoteSha(token) {
  const config = STATE.config;
  const response = await fetch(contentsApiUrl(config), {
    method: "GET",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28"
    }
  });

  if (response.status === 404) {
    return "";
  }

  if (!response.ok) {
    throw new Error(`Unable to access GitHub content file (${response.status})`);
  }

  const body = await response.json();
  return String(body.sha || "").trim();
}

async function pushSnapshotNow(reason = "auto-sync") {
  if (STATE.running) return STATE.running;

  STATE.running = (async () => {
    const config = STATE.config;
    if (!config.enabled || !config.owner || !config.repo) return false;

    const token = getToken();
    if (!token) return false;

    const snapshot = await exportEditableDataSnapshot();
    const serialized = JSON.stringify(snapshot, null, 2);
    const content = encodeBase64Utf8(serialized);
    const sha = await getExistingRemoteSha(token);

    const response = await fetch(contentsApiUrl(config), {
      method: "PUT",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28"
      },
      body: JSON.stringify({
        message: `chore: sync portfolio content (${reason})`,
        content,
        branch: config.branch,
        ...(sha ? { sha } : {})
      })
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`GitHub sync failed (${response.status}): ${text.slice(0, 200)}`);
    }

    storage.set("portfolio.githubSyncMeta", {
      syncedAt: Date.now(),
      reason,
      repo: `${config.owner}/${config.repo}`,
      path: config.path
    });

    return true;
  })();

  try {
    return await STATE.running;
  } finally {
    STATE.running = null;
  }
}

function queuePush(reason = "change") {
  if (!STATE.config.enabled) return;

  if (STATE.timer) {
    clearTimeout(STATE.timer);
  }

  STATE.timer = setTimeout(() => {
    pushSnapshotNow(reason).catch(() => {
      // fail silently to avoid interrupting user flow; next edit retries automatically
    });
  }, 1200);
}

export async function setupGithubSync(config = {}) {
  STATE.config = normalizeConfig(config);

  if (!STATE.config.enabled || !STATE.config.owner || !STATE.config.repo) {
    setIdbWriteListener(null);
    STATE.initialized = false;
    return { enabled: false, pulled: false };
  }

  const snapshot = await fetchRemoteSnapshot();
  if (snapshot) {
    await importEditableDataSnapshot(snapshot);
  }

  setIdbWriteListener(() => {
    queuePush("idb-write");
  });

  STATE.initialized = true;
  return { enabled: true, pulled: Boolean(snapshot) };
}

export async function forceGithubSync(reason = "manual") {
  return pushSnapshotNow(reason);
}

export async function forceGithubPull() {
  const snapshot = await fetchRemoteSnapshot();
  if (!snapshot) return false;
  await importEditableDataSnapshot(snapshot);
  return true;
}

export function isGithubSyncReady() {
  return STATE.initialized && Boolean(getToken());
}

export function decodeGithubSyncToken(encoded = "") {
  try {
    return decodeBase64Utf8(encoded);
  } catch {
    return "";
  }
}
