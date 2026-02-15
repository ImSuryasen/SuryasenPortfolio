import siteConfig from "../site.config.js";

function fallbackSkillSvg(name) {
  return `
    <svg viewBox="0 0 64 64" role="img" aria-label="${name} placeholder icon" xmlns="http://www.w3.org/2000/svg">
      <rect width="64" height="64" rx="14" fill="rgba(114,165,255,0.2)" />
      <text x="50%" y="56%" text-anchor="middle" fill="white" font-size="22" font-family="Arial">${name.slice(0, 1).toUpperCase()}</text>
    </svg>
  `;
}

export function socialIconMap() {
  return {
    linkedin: "./assets/linkedin.svg",
    github: "https://cdn.simpleicons.org/github/ffffff",
    instagram: "https://cdn.simpleicons.org/instagram/ffffff",
    twitter: "https://cdn.simpleicons.org/x/ffffff",
    facebook: "https://cdn.simpleicons.org/facebook/ffffff",
    youtube: "https://cdn.simpleicons.org/youtube/ffffff"
  };
}

export function buildSocialRow({ socials, resumeUrl }) {
  const icons = socialIconMap();
  const row = document.getElementById("social-row");
  if (!row) return;

  const links = Object.entries(icons)
    .filter(([key]) => socials[key])
    .map(
      ([key, src]) => `
      <a class="social-icon" href="${socials[key]}" target="_blank" rel="noopener noreferrer" aria-label="${key}">
        <img src="${src}" alt="${key}" onerror="this.style.display='none';this.parentElement.innerHTML='<span>${key.slice(0, 1).toUpperCase()}</span>'"/>
      </a>
    `
    )
    .join("");

  row.innerHTML = `
    ${links}
    <a class="cv-pill" href="${resumeUrl}" target="_blank" rel="noopener noreferrer" aria-label="Open CV">CV</a>
    <button id="theme-toggle" class="theme-toggle" aria-label="Toggle theme">☾</button>
  `;
}

export function buildRouteLinks() {
  const routeLinks = document.getElementById("route-links");
  if (!routeLinks) return;

  routeLinks.innerHTML = `
    <a href="#/home" data-route="home" class="nav-link">Home</a>
    <a href="#/about" data-route="about" class="nav-link">About</a>
    <a href="#/experience" data-route="experience" class="nav-link">Experience</a>
    <a href="#/projects" data-route="projects" class="nav-link">Projects</a>
    <a href="#/skills" data-route="skills" class="nav-link">Skills</a>
    <a href="#/hobbies" data-route="hobbies" class="nav-link">Hobbies</a>
  `;
}

export function buildMobileNav() {
  const mobile = document.getElementById("mobile-nav");
  if (!mobile) return;

  mobile.innerHTML = `
    <a href="#/home" data-route="home">Home</a>
    <a href="#/about" data-route="about">About</a>
    <a href="#/experience" data-route="experience">Experience</a>
    <a href="#/projects" data-route="projects">Projects</a>
    <a href="#/skills" data-route="skills">Skills</a>
    <a href="#/hobbies" data-route="hobbies">Hobbies</a>
  `;
}

export function pageTemplate(page, state = {}) {
  if (page === "home") {
    return `
      <section class="page hero" data-page="home">
        <div id="hero-bg" class="hero-bg" aria-hidden="true"></div>
        <div class="hero-center">
          <div>
            <h1 class="hero-title">${siteConfig.name}</h1>
            <p class="hero-tagline">${siteConfig.tagline}</p>
            <div class="hero-cta-wrap">
              <a class="hero-cta" href="#/about" aria-label="Explore about section">Explore</a>
            </div>
          </div>
        </div>
      </section>
    `;
  }

  if (page === "about") {
    const about = state.about || {};
    const esc = (value = "") =>
      String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    const imageUrl = esc(about.imageUrl || "./assets/profile.jpg");
    const contentHtml = about.contentHtml || `<p>I am ${siteConfig.name}, a curious builder focused on shipping meaningful digital products, blending clean engineering with human-centered UI motion.</p>`;
    const highlights = Array.isArray(about.highlights) ? about.highlights : [];

    return `
      <section class="page" data-page="about">
        <div class="section-title-row reveal">
          <h2 class="section-title">About</h2>
          <button class="exp-edit-btn" id="edit-about-btn" aria-label="Edit about section">✎</button>
        </div>
        <div class="about-grid reveal">
          <div class="about-image panel">
            <img class="about-image-img" src="${imageUrl}" alt="${esc(siteConfig.name)} profile image" onerror="this.src='./assets/profile.jpg'" />
          </div>
          <article class="about-content panel">
            <div class="about-content-rich">${contentHtml}</div>
            <div class="chip-row">
              ${highlights.map((item) => `<span class="chip">${esc(item)}</span>`).join("")}
            </div>
          </article>
        </div>
      </section>
    `;
  }

  if (page === "experience") {
    const syncStatus = state.syncStatus
      ? `<p class="section-subtitle reveal ${state.syncStatus.ok ? "sync-ok" : "sync-error"}">${state.syncStatus.message}</p>`
      : "";
    const syncWarnings = Array.isArray(state.syncStatus?.warnings) && state.syncStatus.warnings.length
      ? `<ul class="sync-warning-list reveal">${state.syncStatus.warnings.map((w) => `<li>${w}</li>`).join("")}</ul>`
      : "";

    return `
      <section class="page" data-page="experience">
        <h2 class="section-title reveal">Experience</h2>
        <p class="section-subtitle reveal">Import LinkedIn experience JSON, then edit every card inline. Add or delete roles anytime.</p>
        ${syncStatus}
        ${syncWarnings}
        <div class="actions-row reveal">
          <button class="btn" id="sync-linkedin-btn">Sync LinkedIn</button>
          <button class="btn primary" id="import-linkedin-btn">Import LinkedIn Data</button>
          <button class="btn" id="add-experience-btn">Add Job</button>
          <a class="btn" href="${siteConfig.socials.linkedin}" target="_blank" rel="noopener noreferrer">Open LinkedIn Profile</a>
        </div>
        <div id="experience-content" class="timeline-wrap reveal">
          ${state.experienceHtml || ""}
        </div>
      </section>
    `;
  }

  if (page === "projects") {
    return `
      <section class="page" data-page="projects">
        <h2 class="section-title reveal">Projects</h2>
        <div class="actions-row reveal">
          <button class="btn" id="add-project-btn">Add Project</button>
          <button class="btn" id="sort-stars">Sort by Stars</button>
          <button class="btn" id="sort-updated">Sort by Recently Updated</button>
        </div>
        <div id="project-content" class="project-list reveal">
          ${state.projectHtml || ""}
        </div>
      </section>
    `;
  }

  if (page === "skills") {
    const esc = (value = "") =>
      String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;");

    const skillGroups = Array.isArray(state.skills) ? state.skills : siteConfig.skills;

    const categories = skillGroups
      .map((group) => {
        const items = group.items || [];
        const total = items.length || 1;
        const avg = Math.round(items.reduce((sum, skill) => sum + (skill.level || 0), 0) / total);
        const strong = items.filter((skill) => (skill.level || 0) >= 85).length;

        const rows = items
          .map((skill) => {
            const fallbackIconDataUrl = `data:image/svg+xml;utf8,${encodeURIComponent(
              fallbackSkillSvg(skill.name).trim()
            )}`;
            const iconUrl = String(skill.iconUrl || "").trim() || fallbackIconDataUrl;

            return `
              <article class="skill-row reveal" tabindex="0">
                <div class="skill-row-head">
                  <div class="skill-name-wrap">
                    <img src="${esc(iconUrl)}" alt="${esc(skill.name)} icon" onerror="this.onerror=null;this.src='${fallbackIconDataUrl}'" />
                    <p>${esc(skill.name)}</p>
                  </div>
                  <span>${skill.level || 0}%</span>
                </div>
                <div class="skill-progress" role="img" aria-label="${esc(skill.name)} proficiency ${skill.level || 0}%">
                  <div class="skill-progress-fill" style="width:${skill.level || 0}%"></div>
                </div>
              </article>
            `;
          })
          .join("");

        return `
          <section class="skill-category panel reveal" data-skill-section-id="${esc(group.id || group.category || "")}" tabindex="0" role="button" aria-label="Edit ${esc(group.category)} section">
            <div class="skill-category-head">
              <h3>${esc(group.category)}</h3>
              <p>Avg proficiency: ${avg}% • Strong skills: ${strong}/${items.length}</p>
              <button class="exp-edit-btn" type="button" data-skill-action="edit-section" data-skill-section-id="${esc(group.id || group.category || "")}" aria-label="Edit ${esc(group.category)}">✎</button>
            </div>
            <div class="skill-category-body">${rows}</div>
          </section>
        `;
      })
      .join("");

    return `
      <section class="page" data-page="skills">
        <div class="section-title-row reveal">
          <h2 class="section-title">Skills</h2>
          <button class="btn" id="add-skill-section-btn" type="button">Add Skill Section</button>
        </div>
        <p class="section-subtitle reveal">A balanced profile across technical depth, tools, core CS foundations, and collaborative execution.</p>
        <div class="skills-categories">${categories}</div>
      </section>
    `;
  }

  if (page === "hobbies") {
    const cards = (state.hobbies || [])
      .map(
        (hobby) => `
        <a class="hobby-card panel reveal" href="#/hobby/${hobby.slug}">
          <div class="hobby-cover" style="background-image:url('https://picsum.photos/seed/${encodeURIComponent(hobby.slug)}/900/600')"></div>
          <div class="hobby-body">
            <h3>${hobby.name}</h3>
            <p>${hobby.description || ""}</p>
          </div>
        </a>
      `
      )
      .join("");

    return `
      <section class="page" data-page="hobbies">
        <h2 class="section-title reveal">Hobbies</h2>
        <div class="hobby-grid">${cards}</div>
      </section>
    `;
  }

  if (page === "hobby") {
    const hobby = state.hobby;
    if (!hobby) {
      return `
        <section class="page" data-page="hobby">
          <h2 class="section-title">Hobby</h2>
          <div class="panel empty-state">Hobby not found.</div>
        </section>
      `;
    }

    const gallery = hobby.gallery
      .map(
        (img) => `
          <article class="gallery-item panel reveal" data-image-id="${img.id}">
            <img src="${img.src}" alt="${hobby.name} image" data-lightbox="${img.id}" />
            <input type="text" value="${(img.caption || "").replace(/"/g, "&quot;")}" data-caption-id="${img.id}" aria-label="Edit caption" />
          </article>
        `
      )
      .join("");

    return `
      <section class="page" data-page="hobby">
        <h2 class="section-title reveal">${hobby.name}</h2>
        <p class="reveal">${hobby.description || ""}</p>
        <div class="actions-row reveal">
          <label class="btn" for="hobby-upload">Add Images</label>
          <input id="hobby-upload" type="file" accept="image/*" multiple hidden />
          <a class="btn" href="#/hobbies">Back to hobbies</a>
        </div>
        <section class="gallery-grid">${gallery}</section>
      </section>
    `;
  }

  return `
    <section class="page" data-page="home">
      <h2 class="section-title">Not found</h2>
      <a class="btn" href="#/home">Go Home</a>
    </section>
  `;
}

export function experienceHtmlFromPayload(payload) {
  if (!payload?.experiences?.length) {
    return `
      <article class="empty-state panel">
        <p>No experiences yet. Add a job card, or import from your LinkedIn JSON and then edit freely.</p>
      </article>
    `;
  }

  const esc = (value = "") =>
    String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const withBreaks = (value = "") => esc(value).replace(/\n/g, "<br />");

  return `<section class="experience-list">${payload.experiences
    .map(
      (item) => {
        const skills = (item.skills || [])
          .map((skill) => `<span class="experience-skill-chip">${esc(skill)}</span>`)
          .join("");
        const companyLine = [item.company, item.employmentType].filter(Boolean).join(" · ");
        const timeLine = [
          [item.start, item.end].filter(Boolean).join(" - "),
          item.location,
          item.locationType
        ]
          .filter(Boolean)
          .join(" · ");

        return `
      <article class="experience-card panel" data-exp-id="${esc(item.id)}">
        <div class="experience-card-summary">
          <div class="experience-org-wrap">
            <img class="experience-org-logo" src="${esc(item.logoUrl || "https://cdn.simpleicons.org/linkedin/0A66C2")}" alt="${esc(item.company || "Organization")} logo" onerror="this.src='https://cdn.simpleicons.org/linkedin/0A66C2'" />
            <div class="experience-view-main">
              <h3>${esc(item.role || "Position")}</h3>
              <p class="experience-company-line">${esc(companyLine || "Organization")}</p>
              <p class="experience-time-line">${esc(timeLine || "Add timeline and location")}</p>
            </div>
          </div>
          <button class="exp-edit-btn" data-exp-action="edit" aria-label="Edit experience">✎</button>
        </div>

        <p class="experience-description">${withBreaks(item.description || "Add your role responsibilities and impact.")}</p>

        <div class="experience-skill-row">
          <span class="field-label">Skills Used</span>
          <div class="experience-skill-chips">${skills || `<span class="experience-skill-chip">Add skills</span>`}</div>
        </div>
      </article>
    `;
      }
    )
    .join("")}</section>`;
}

export function projectSkeletons() {
  return new Array(3).fill(0).map(() => `<div class="skeleton"></div>`).join("");
}

export function projectsHtml(repos) {
  const esc = (value = "") =>
    String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  return repos
    .map((repo) => {
      const rawStacks = Array.isArray(repo.techStacks) ? repo.techStacks : [];
      const stacks = rawStacks
        .map((item) => String(item || "").trim())
        .filter(Boolean)
        .filter((item, index, arr) => arr.findIndex((x) => x.toLowerCase() === item.toLowerCase()) === index)
        .filter((item) => item.toLowerCase() !== "unknown");

      return `
      <article class="project-card panel" data-project-id="${esc(repo.id)}">
        <div class="project-card-summary">
          <div>
            <h3>${esc(repo.name)}</h3>
            <p class="project-brief">${esc(repo.description || "No description")}</p>
          </div>
          <div class="project-card-actions">
            <button class="exp-edit-btn" data-project-action="edit" aria-label="Edit project">✎</button>
            <span class="project-expand-indicator" aria-hidden="true">⌄</span>
          </div>
        </div>

        <div class="project-details">
          <p>${esc(repo.description || "No description")}</p>
          <div class="repo-meta">
            <span>${esc(repo.language || "Unknown")}</span>
            <span>★ ${repo.stargazers_count || 0}</span>
            <span>⑂ ${repo.forks_count || 0}</span>
            <span>Updated ${repo.updated_at ? new Date(repo.updated_at).toLocaleDateString() : "N/A"}</span>
          </div>
          <div class="experience-skill-chips">
            ${stacks
              .map((stack) => `<span class="experience-skill-chip">${esc(stack)}</span>`)
              .join("") || `<span class="experience-skill-chip">Add tech stacks in edit mode</span>`}
          </div>
          <a class="btn" href="${esc(repo.html_url || "#")}" target="_blank" rel="noopener noreferrer">Open GitHub Repository</a>
        </div>
      </article>
    `;
    })
    .join("");
}
