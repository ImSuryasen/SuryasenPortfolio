const LS_KEYS = {
  THEME: "portfolio.theme",
  LAST_ROUTE: "portfolio.lastRoute",
  REDUCED_MOTION_OVERRIDE: "portfolio.reducedMotionOverride",
  GITHUB_CACHE: "portfolio.githubCache",
  ICON_URLS: "portfolio.iconUrls"
};

const DB_NAME = "portfolioDB";
const DB_VERSION = 1;
let dbInstancePromise;
let idbWriteListener = null;
let isIdbWriteListenerMuted = false;

function openDb() {
  if (dbInstancePromise) return dbInstancePromise;

  dbInstancePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("linkedin")) db.createObjectStore("linkedin", { keyPath: "key" });
      if (!db.objectStoreNames.contains("hobbies")) db.createObjectStore("hobbies", { keyPath: "slug" });
      if (!db.objectStoreNames.contains("profile")) db.createObjectStore("profile", { keyPath: "key" });
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return dbInstancePromise;
}

function tx(storeName, mode = "readonly") {
  return openDb().then((db) => db.transaction(storeName, mode).objectStore(storeName));
}

export async function idbGet(storeName, key) {
  const store = await tx(storeName);
  return new Promise((resolve, reject) => {
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function idbGetAll(storeName) {
  const store = await tx(storeName);
  return new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function idbSet(storeName, value) {
  const store = await tx(storeName, "readwrite");
  return new Promise((resolve, reject) => {
    const req = store.put(value);
    req.onsuccess = () => {
      if (!isIdbWriteListenerMuted && typeof idbWriteListener === "function") {
        try {
          idbWriteListener({ storeName, value });
        } catch {
          // ignore listener errors to keep storage writes resilient
        }
      }
      resolve(value);
    };
    req.onerror = () => reject(req.error);
  });
}

export function setIdbWriteListener(listener) {
  idbWriteListener = typeof listener === "function" ? listener : null;
}

export async function runWithoutIdbWriteListener(task) {
  isIdbWriteListenerMuted = true;
  try {
    return await task();
  } finally {
    isIdbWriteListenerMuted = false;
  }
}

export const storage = {
  get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  },
  remove(key) {
    localStorage.removeItem(key);
  }
};

export function getPrefTheme() {
  return storage.get(LS_KEYS.THEME, "dark");
}

export function setPrefTheme(theme) {
  storage.set(LS_KEYS.THEME, theme);
}

export function getLastRoute() {
  return storage.get(LS_KEYS.LAST_ROUTE, "#/home");
}

export function setLastRoute(route) {
  storage.set(LS_KEYS.LAST_ROUTE, route);
}

export function getReducedMotionOverride() {
  return storage.get(LS_KEYS.REDUCED_MOTION_OVERRIDE, null);
}

export function setReducedMotionOverride(value) {
  storage.set(LS_KEYS.REDUCED_MOTION_OVERRIDE, value);
}

export function getGithubCache() {
  return storage.get(LS_KEYS.GITHUB_CACHE, null);
}

export function setGithubCache(payload) {
  storage.set(LS_KEYS.GITHUB_CACHE, payload);
}

export function getIconCache() {
  return storage.get(LS_KEYS.ICON_URLS, {});
}

export function setIconCache(cache) {
  storage.set(LS_KEYS.ICON_URLS, cache);
}

const FALLBACK_LS_MAP = {
  aboutProfile: "portfolio.aboutProfile",
  skillsProfile: "portfolio.skillsProfile",
  projectsProfile: "portfolio.projectsProfile",
  linkedinTimeline: "portfolio.linkedinTimeline"
};

export async function exportEditableDataSnapshot() {
  const [profile, linkedin, hobbies] = await Promise.all([
    idbGetAll("profile"),
    idbGetAll("linkedin"),
    idbGetAll("hobbies")
  ]);

  return {
    version: 1,
    updatedAt: Date.now(),
    profile,
    linkedin,
    hobbies
  };
}

export async function importEditableDataSnapshot(snapshot) {
  const next = snapshot && typeof snapshot === "object" ? snapshot : null;
  if (!next) return false;

  const profileRows = Array.isArray(next.profile) ? next.profile : [];
  const linkedinRows = Array.isArray(next.linkedin) ? next.linkedin : [];
  const hobbyRows = Array.isArray(next.hobbies) ? next.hobbies : [];

  await runWithoutIdbWriteListener(async () => {
    for (const row of profileRows) {
      if (!row || typeof row !== "object") continue;
      await idbSet("profile", row);

      const localStorageKey = FALLBACK_LS_MAP[String(row.key || "")];
      if (localStorageKey && row.value !== undefined) {
        storage.set(localStorageKey, row.value);
      }
    }

    for (const row of linkedinRows) {
      if (!row || typeof row !== "object") continue;
      await idbSet("linkedin", row);
      if (String(row.key || "") === "timeline" && row.value !== undefined) {
        storage.set(FALLBACK_LS_MAP.linkedinTimeline, row.value);
      }
    }

    for (const row of hobbyRows) {
      if (!row || typeof row !== "object") continue;
      await idbSet("hobbies", row);
    }
  });

  return true;
}

export { LS_KEYS };
