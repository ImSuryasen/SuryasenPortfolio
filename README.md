# SURYASEN Portfolio (Vanilla HTML/CSS/JS)

A modern, animated, responsive static portfolio built with:
- HTML
- CSS
- JavaScript (ES modules)

No backend, no database server, no build tools, no API keys.
Persistence is handled via LocalStorage + IndexedDB only.

## Run locally

1. Open `index.html` directly in a modern browser.
2. Optional (recommended for best module + fetch behavior): serve the folder with a static server.

## Configure site content

Edit `site.config.js`:
- `name`
- `tagline`
- `githubUsername`
- `resumeUrl`
- `socials`
- `skills`
- `hobbies`

## Routes

Hash-based SPA routes:
- `#/home`
- `#/about`
- `#/experience`
- `#/projects`
- `#/skills`
- `#/hobbies`
- `#/hobby/<slug>`

## LinkedIn Experience import (no scraping)

In `#/experience` click **Import LinkedIn Data**:
- Paste JSON
- Or upload JSON file
- Schema validation runs client-side
- Data saves to IndexedDB

You can also use **Sync LinkedIn** (OAuth) when backend sync is configured.

Reference files:
- `data/linkedin.schema.json`
- `data/linkedin.sample.json`

## LinkedIn OAuth sync backend (optional)

To enable direct OAuth-based sync from LinkedIn:

1. Create a LinkedIn app in LinkedIn Developer Portal.
2. Configure redirect URL (example): `http://localhost:5500/index.html`
3. Start backend service:
  - `cd backend`
  - `npm install`
  - copy `.env.example` to `.env`
  - fill `LINKEDIN_CLIENT_ID` and `LINKEDIN_CLIENT_SECRET`
  - `npm start`
4. In `site.config.js` set:
  - `linkedinSync.enabled = true`
  - `linkedinSync.backendBaseUrl = "http://localhost:8787"`
5. Serve frontend on the same redirect URL host and use **Sync LinkedIn** in `#/experience`.

Important:
- LinkedIn experience endpoints are permission-restricted.
- If your app only has basic scopes, OAuth can succeed while job-history fetch returns empty.
- In that case, keep using Import JSON + inline editing (add/edit/delete) already supported in Experience.

Permission checklist (must be done in LinkedIn Developer Portal):
- Enable product: Sign In with LinkedIn using OpenID Connect
- Add exact redirect URL in app Auth settings
- Configure scopes in backend `.env` via `LINKEDIN_SCOPES`
- Use a scope set like: `openid profile email r_liteprofile r_emailaddress w_member_social`

Note: Some experience/positions endpoints need partner-level approval and cannot be self-enabled from this repository.

## GitHub projects

`#/projects` fetches public repos for `githubUsername` via GitHub REST API.

Features:
- Sort by stars or recently updated
- Skeleton loading
- Error fallback
- LocalStorage cache (6-hour refresh)

## Hobbies + hobby pages

- Hobbies are rendered from config
- Each hobby opens `#/hobby/<slug>`
- Gallery supports:
  - default seeded placeholder images
  - user image uploads (stored as Data URL in IndexedDB)
  - editable captions
  - lightbox viewer with prev/next

## Motion and accessibility

- View Transitions API used when available
- CSS fallback transitions when unavailable
- Scroll reveal via IntersectionObserver
- Hero parallax (disabled for reduced motion)
- Reduced motion support from `prefers-reduced-motion`
- Keyboard focus styles + semantic structure + aria labels

## GitHub Pages deployment (automatic)

This repo includes `.github/workflows/deploy-pages.yml`.

1. Push this folder to a GitHub repository on branch `main`.
2. In GitHub repo settings, open **Pages**.
3. Under **Build and deployment**, select **GitHub Actions** as source.
4. Push to `main` again (or use **Run workflow** in Actions).
5. Open the published Pages URL shown in the workflow/deployment.

Because routing uses hash (`#/...`), direct route refresh works on static hosting without server rewrites.

## Assets

Place your own images at:
- `assets/hero-bg.jpg`
- `assets/profile.jpg`

If missing, layout still renders with overlays/placeholders.
