import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 8787);

const clientId = process.env.LINKEDIN_CLIENT_ID;
const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
const defaultRedirectUri = process.env.LINKEDIN_REDIRECT_URI;
const frontendOrigin = process.env.FRONTEND_ORIGIN || "*";
const defaultScopes =
  process.env.LINKEDIN_SCOPES ||
  "openid profile email r_liteprofile r_emailaddress w_member_social";

function isPlaceholder(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return (
    !normalized ||
    normalized === "your_linkedin_client_id" ||
    normalized === "your_linkedin_client_secret" ||
    normalized.includes("your_")
  );
}

app.use(
  cors({
    origin: frontendOrigin === "*" ? true : frontendOrigin,
    credentials: false
  })
);
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "linkedin-sync" });
});

app.get("/api/linkedin/auth-url", (req, res) => {
  if (isPlaceholder(clientId)) {
    return res.status(500).json({
      error: "LinkedIn sync backend is not configured.",
      details: "Invalid LINKEDIN_CLIENT_ID in backend/.env",
      setup: [
        "Create backend/.env (copy from backend/.env.example)",
        "Set LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET from LinkedIn Developer app",
        "Restart backend server"
      ]
    });
  }

  if (isPlaceholder(clientSecret)) {
    return res.status(500).json({
      error: "LinkedIn sync backend is not configured.",
      details: "Invalid LINKEDIN_CLIENT_SECRET in backend/.env",
      setup: [
        "Set LINKEDIN_CLIENT_SECRET from LinkedIn Developer app",
        "Restart backend server"
      ]
    });
  }

  if (!defaultRedirectUri) {
    return res.status(500).json({
      error: "LinkedIn sync backend is not configured.",
      details: "Missing LINKEDIN_REDIRECT_URI in backend/.env",
      setup: [
        "Set LINKEDIN_REDIRECT_URI to your frontend callback URL (for example http://localhost:5500/index.html)",
        "Ensure the same URL is added in LinkedIn app redirect URLs",
        "Restart backend server"
      ]
    });
  }

  const redirectUri = req.query.redirectUri || defaultRedirectUri;
  const state = req.query.state || "state_missing";
  const scope = String(req.query.scope || defaultScopes)
    .split(/\s+/)
    .filter(Boolean)
    .join(" ");

  const authUrl = new URL("https://www.linkedin.com/oauth/v2/authorization");
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", String(redirectUri));
  authUrl.searchParams.set("state", String(state));
  authUrl.searchParams.set("scope", scope);

  return res.json({
    authUrl: authUrl.toString(),
    scope,
    redirectUri: String(redirectUri)
  });
});

async function getAccessToken({ code, redirectUri }) {
  if (isPlaceholder(clientId) || isPlaceholder(clientSecret)) {
    throw new Error("Missing LINKEDIN_CLIENT_ID or LINKEDIN_CLIENT_SECRET");
  }

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: String(redirectUri || defaultRedirectUri),
    client_id: clientId,
    client_secret: clientSecret
  });

  const tokenRes = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  });

  const tokenJson = await tokenRes.json();
  if (!tokenRes.ok || !tokenJson.access_token) {
    throw new Error(tokenJson.error_description || tokenJson.error || "Unable to get access token");
  }

  return tokenJson.access_token;
}

async function fetchLinkedinProfile(token) {
  const meRes = await fetch("https://api.linkedin.com/v2/me", {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  const me = meRes.ok ? await meRes.json() : null;

  let emailAddress = "";
  const emailRes = await fetch(
    "https://api.linkedin.com/v2/emailAddress?q=members&projection=(elements*(handle~))",
    {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  );

  if (emailRes.ok) {
    const emailPayload = await emailRes.json();
    emailAddress = emailPayload?.elements?.[0]?.["handle~"]?.emailAddress || "";
  }

  return { me, emailAddress };
}

async function fetchPositions(token) {
  const warnings = [];

  const endpoints = [
    "https://api.linkedin.com/v2/positions",
    "https://api.linkedin.com/rest/positions"
  ];

  for (const endpoint of endpoints) {
    const res = await fetch(endpoint, {
      headers: {
        Authorization: `Bearer ${token}`,
        "LinkedIn-Version": "202405",
        "X-Restli-Protocol-Version": "2.0.0"
      }
    });

    if (!res.ok) {
      const details = await res.text();
      warnings.push(`Unable to access ${endpoint}: ${details.slice(0, 180)}`);
      continue;
    }

    const json = await res.json();
    const elements = Array.isArray(json.elements)
      ? json.elements
      : Array.isArray(json.data)
      ? json.data
      : [];

    if (elements.length) {
      return { elements, warnings };
    }
  }

  return { elements: [], warnings };
}

function normalizeExperienceItem(item, idx) {
  const company =
    item.companyName ||
    item.company ||
    item.organization ||
    item.employer ||
    "Organization";

  const role = item.title || item.role || item.position || "Position";
  const start = item.startDate || item.start || "";
  const end = item.endDate || item.end || "Present";
  const description = item.description || item.summary || "";

  const skills = Array.isArray(item.skills)
    ? item.skills
    : typeof item.skills === "string"
    ? item.skills
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

  return {
    id: item.id || `exp_sync_${idx}_${Date.now()}`,
    company,
    role,
    location: item.location || "",
    start,
    end,
    description,
    skills,
    logoUrl: item.logoUrl || "https://cdn.simpleicons.org/linkedin/0A66C2"
  };
}

app.post("/api/linkedin/sync", async (req, res) => {
  try {
    const { code, redirectUri, fallbackProfileUrl } = req.body || {};
    if (!code) {
      return res.status(400).json({ error: "Missing authorization code" });
    }

    const token = await getAccessToken({ code, redirectUri });
    const profile = await fetchLinkedinProfile(token);
    const positionsResult = await fetchPositions(token);

    const experiences = positionsResult.elements.map((item, idx) => normalizeExperienceItem(item, idx));

    const profileId = profile.me?.id || "";
    const firstName = profile.me?.localizedFirstName || "";
    const lastName = profile.me?.localizedLastName || "";

    const payload = {
      profileUrl: fallbackProfileUrl || (profileId ? `https://www.linkedin.com/in/${profileId}` : ""),
      fullName: `${firstName} ${lastName}`.trim(),
      email: profile.emailAddress,
      experiences
    };

    return res.json({
      payload,
      warnings: positionsResult.warnings,
      message:
        experiences.length > 0
          ? "LinkedIn sync completed."
          : "LinkedIn OAuth completed, but experience endpoints were unavailable for this app permission set."
    });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : "LinkedIn sync failed"
    });
  }
});

app.listen(port, () => {
  console.log(`LinkedIn sync backend running on http://localhost:${port}`);
});