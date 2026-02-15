import { saveLinkedinPayload, getEditableLinkedinPayload } from "./linkedin.js";

const OAUTH_STATE_KEY = "portfolio.linkedin.oauthState";
const OAUTH_RETURN_ROUTE_KEY = "portfolio.linkedin.returnRoute";

function randomState() {
  return `st_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function getSyncConfig(siteConfig) {
  return {
    enabled: Boolean(siteConfig?.linkedinSync?.enabled),
    backendBaseUrl: String(siteConfig?.linkedinSync?.backendBaseUrl || "").replace(/\/$/, "")
  };
}

export async function startLinkedinOAuth(siteConfig) {
  const syncConfig = getSyncConfig(siteConfig);
  if (!syncConfig.enabled || !syncConfig.backendBaseUrl) {
    throw new Error("LinkedIn sync is not configured. Enable linkedinSync in site.config.js first.");
  }

  const state = randomState();
  const redirectUri = `${location.origin}${location.pathname}`;
  const scope = siteConfig?.linkedinSync?.scope || "";

  const query = new URLSearchParams({
    redirectUri,
    state
  });
  if (scope) query.set("scope", scope);

  const authRes = await fetch(`${syncConfig.backendBaseUrl}/api/linkedin/auth-url?${query.toString()}`);

  const authJson = await authRes.json();
  if (!authRes.ok || !authJson.authUrl) {
    const details = [authJson.error, authJson.details].filter(Boolean).join(" — ");
    const setup = Array.isArray(authJson.setup) ? `\n${authJson.setup.join("\n")}` : "";
    throw new Error((details || "Unable to start LinkedIn OAuth") + setup);
  }

  sessionStorage.setItem(OAUTH_STATE_KEY, state);
  sessionStorage.setItem(OAUTH_RETURN_ROUTE_KEY, location.hash || "#/experience");
  location.href = authJson.authUrl;
}

export async function handleLinkedinOAuthCallback(siteConfig) {
  const syncConfig = getSyncConfig(siteConfig);
  if (!syncConfig.enabled || !syncConfig.backendBaseUrl) {
    return null;
  }

  const params = new URLSearchParams(location.search);
  const code = params.get("code");
  const state = params.get("state");
  const error = params.get("error");
  const errorDescription = params.get("error_description");

  if (!code && !error) return null;

  const storedState = sessionStorage.getItem(OAUTH_STATE_KEY);
  const returnRoute = sessionStorage.getItem(OAUTH_RETURN_ROUTE_KEY) || "#/experience";

  sessionStorage.removeItem(OAUTH_STATE_KEY);
  sessionStorage.removeItem(OAUTH_RETURN_ROUTE_KEY);

  const cleanUrl = `${location.origin}${location.pathname}${returnRoute}`;
  history.replaceState({}, "", cleanUrl);

  if (error) {
    return {
      ok: false,
      message: `LinkedIn authorization failed: ${errorDescription || error}`
    };
  }

  if (!storedState || state !== storedState) {
    return {
      ok: false,
      message: "LinkedIn OAuth state mismatch. Please retry sync."
    };
  }

  const existing = await getEditableLinkedinPayload(siteConfig?.socials?.linkedin || "");
  const redirectUri = `${location.origin}${location.pathname}`;

  const syncRes = await fetch(`${syncConfig.backendBaseUrl}/api/linkedin/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code,
      redirectUri,
      fallbackProfileUrl: existing.profileUrl || siteConfig?.socials?.linkedin || ""
    })
  });

  const syncJson = await syncRes.json();
  if (!syncRes.ok || !syncJson.payload) {
    return {
      ok: false,
      message: syncJson.error || "LinkedIn sync failed"
    };
  }

  await saveLinkedinPayload(syncJson.payload);

  return {
    ok: true,
    message: syncJson.message || "LinkedIn sync completed.",
    warnings: syncJson.warnings || []
  };
}
