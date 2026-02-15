import siteConfig from "../site.config.js";
import { parseRoute, navigate, routeSequence } from "./router.js";
import {
  getLastRoute,
  getPrefTheme,
  setLastRoute,
  setPrefTheme,
  getReducedMotionOverride,
  setReducedMotionOverride
} from "./storage.js";
import { getEditableProjects, addCustomProject, updateEditableProject, deleteEditableProject } from "./projects.js";
import {
  getEditableLinkedinPayload,
  openLinkedinImportModal,
  addLinkedinExperience,
  updateLinkedinExperience,
  deleteLinkedinExperience
} from "./linkedin.js";
import { ensureHobbies, getHobby, addHobbyImage, updateHobbyCaption } from "./hobbies.js";
import { getEditableSkills, saveEditableSkills, createEmptySkillSection } from "./skills.js";
import {
  buildSocialRow,
  buildRouteLinks,
  buildMobileNav,
  pageTemplate,
  experienceHtmlFromPayload,
  projectSkeletons,
  projectsHtml
} from "./ui.js";
import { startLinkedinOAuth, handleLinkedinOAuthCallback, getSyncConfig } from "./linkedin-sync.js";
import { getAboutProfile, saveAboutProfile } from "./profile.js";
import { setupGithubSync, setGithubSyncToken, forceGithubSync } from "./github-sync.js";

let hobbiesCache = [];
let currentProjectSort = "stars";
let dragState = null;
let experienceSyncStatus = null;

const reduceMotionMedia = window.matchMedia("(prefers-reduced-motion: reduce)");

function prefersReducedMotion() {
  const override = getReducedMotionOverride();
  if (typeof override === "boolean") return override;
  return reduceMotionMedia.matches;
}

function setTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  setPrefTheme(theme);
  const toggle = document.getElementById("theme-toggle");
  if (toggle) toggle.textContent = theme === "dark" ? "☾" : "☀";
}

function setupThemeToggle() {
  const themeToggle = document.getElementById("theme-toggle");
  if (!themeToggle) return;
  themeToggle.addEventListener("click", () => {
    const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    setTheme(next);
  });
}

function applySiteFavicon(imageUrl = "") {
  const source = String(imageUrl || "").trim() || "./assets/favicon.svg";
  const href = `${source}${source.includes("?") ? "&" : "?"}v=${Date.now()}`;

  const ensureLink = (rel) => {
    let link = document.querySelector(`link[rel='${rel}']`);
    if (!(link instanceof HTMLLinkElement)) {
      link = document.createElement("link");
      link.rel = rel;
      document.head.appendChild(link);
    }
    link.href = href;
  };

  ensureLink("icon");
  ensureLink("shortcut icon");
  ensureLink("apple-touch-icon");
}

function setupMobileMenu() {
  const toggle = document.getElementById("menu-toggle");
  const mobileNav = document.getElementById("mobile-nav");
  if (!toggle || !mobileNav) return;

  toggle.addEventListener("click", () => {
    const open = mobileNav.classList.toggle("open");
    toggle.setAttribute("aria-expanded", String(open));
  });

  mobileNav.addEventListener("click", (event) => {
    if (event.target instanceof HTMLElement && event.target.tagName === "A") {
      mobileNav.classList.remove("open");
      toggle.setAttribute("aria-expanded", "false");
    }
  });
}

function setupScrollProgress() {
  const bar = document.getElementById("scroll-progress");
  if (!bar) return;

  const update = () => {
    const scrollTop = window.scrollY;
    const scrollable = Math.max(document.body.scrollHeight - window.innerHeight, 1);
    const progress = Math.min(100, (scrollTop / scrollable) * 100);
    bar.style.width = `${progress}%`;
  };

  update();
  window.addEventListener("scroll", update, { passive: true });
  window.addEventListener("resize", update);
}

function setupReveals() {
  const revealEls = document.querySelectorAll(".reveal");
  if (!revealEls.length || prefersReducedMotion()) {
    revealEls.forEach((el) => el.classList.add("is-visible"));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.14 }
  );

  revealEls.forEach((el) => observer.observe(el));
}

function setupHeroParallax() {
  const heroBg = document.getElementById("hero-bg");
  if (!heroBg) return;
  if (prefersReducedMotion()) {
    heroBg.style.transform = "none";
    return;
  }

  const update = () => {
    const y = Math.min(window.scrollY, window.innerHeight);
    heroBg.style.transform = `translateY(${y * 0.12}px) scale(${1.02 + y * 0.00008})`;
  };

  update();
  window.addEventListener("scroll", update, { passive: true });
}

function setupDragRow(row) {
  if (!row) return;

  let isDown = false;
  let startX = 0;
  let scrollLeft = 0;
  let velocity = 0;
  let lastX = 0;
  let lastTime = 0;

  row.style.cursor = "grab";

  row.addEventListener("pointerdown", (event) => {
    isDown = true;
    startX = event.clientX;
    scrollLeft = row.scrollLeft;
    velocity = 0;
    lastX = event.clientX;
    lastTime = performance.now();
    row.style.cursor = "grabbing";
    row.setPointerCapture(event.pointerId);
  });

  row.addEventListener("pointermove", (event) => {
    if (!isDown) return;
    const x = event.clientX;
    row.scrollLeft = scrollLeft - (x - startX);

    const now = performance.now();
    const dt = Math.max(now - lastTime, 16);
    velocity = (x - lastX) / dt;
    lastX = x;
    lastTime = now;
  });

  const end = () => {
    if (!isDown) return;
    isDown = false;
    row.style.cursor = "grab";

    const momentum = () => {
      if (Math.abs(velocity) < 0.01) return;
      row.scrollLeft -= velocity * 18;
      velocity *= 0.93;
      requestAnimationFrame(momentum);
    };

    requestAnimationFrame(momentum);
  };

  row.addEventListener("pointerup", end);
  row.addEventListener("pointercancel", end);
  row.addEventListener("mouseleave", end);
}

function setupPageDragNavigation() {
  const container = document.getElementById("route-container");
  if (!container) return;
  if (window.innerWidth < 992 || prefersReducedMotion()) return;

  container.addEventListener("pointerdown", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (["INPUT", "TEXTAREA", "BUTTON", "A", "IMG"].includes(target.tagName)) return;

    dragState = {
      startX: event.clientX,
      active: true
    };
  });

  container.addEventListener("pointerup", (event) => {
    if (!dragState?.active) return;

    const delta = event.clientX - dragState.startX;
    const threshold = 140;
    const currentHash = location.hash || "#/home";
    const seq = routeSequence(currentHash);

    if (delta < -threshold && seq.next) navigate(seq.next);
    if (delta > threshold && seq.prev) navigate(seq.prev);

    dragState = null;
  });

  container.addEventListener("pointercancel", () => {
    dragState = null;
  });
}

function setupFallbackTransition(container) {
  container.classList.add("route-fallback-enter");
  requestAnimationFrame(() => {
    container.classList.add("route-fallback-enter-active");
    setTimeout(() => {
      container.classList.remove("route-fallback-enter", "route-fallback-enter-active");
    }, 260);
  });
}

function syncActiveNav(page) {
  document.querySelectorAll(".nav-link[data-route], #mobile-nav a[data-route]").forEach((link) => {
    const isActive = link.getAttribute("data-route") === page;
    link.classList.toggle("active", isActive);
    if (isActive) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  });
}

async function renderProjects(container) {
  container.innerHTML = projectSkeletons();
  const result = await getEditableProjects(siteConfig.githubUsername, currentProjectSort);

  if (result.error && !(result.projects || []).length) {
    container.innerHTML = `<article class="panel empty-state">Unable to fetch GitHub repos: ${result.error}</article>`;
    return;
  }

  container.innerHTML = projectsHtml(result.projects || []);
}

async function openProjectEditor(projectId) {
  const result = await getEditableProjects(siteConfig.githubUsername, currentProjectSort);
  const project = (result.projects || []).find((item) => String(item.id) === String(projectId));
  if (!project) return;

  const root = document.getElementById("linkedin-modal-root");
  if (!root) return;

  const esc = (value = "") =>
    String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  root.innerHTML = `
    <div class="modal-backdrop" role="dialog" aria-modal="true" aria-label="Edit project">
      <section class="modal panel glass exp-edit-modal">
        <h2>Edit project</h2>
        <form id="project-edit-form" class="exp-edit-form">
          <label class="field-label" for="project-name">Project name</label>
          <input id="project-name" name="name" class="exp-form-control" type="text" value="${esc(project.name)}" required />

          <label class="field-label" for="project-description">Description</label>
          <textarea id="project-description" name="description" rows="5" class="exp-form-control">${esc(project.description || "")}</textarea>

          <label class="field-label" for="project-tech">Tech stacks (comma separated)</label>
          <input id="project-tech" name="techStacks" class="exp-form-control" type="text" value="${esc((project.techStacks || []).join(", "))}" />

          <label class="field-label" for="project-language">Primary language</label>
          <input id="project-language" name="language" class="exp-form-control" type="text" value="${esc(project.language || "")}" />

          <label class="field-label" for="project-url">GitHub repository URL</label>
          <input id="project-url" name="html_url" class="exp-form-control" type="url" value="${esc(project.html_url || "")}" />

          <div class="exp-edit-actions">
            <button class="btn" type="button" id="project-delete-btn">Delete project</button>
            <div class="exp-edit-actions-right">
              <button class="btn" type="button" id="project-cancel-btn">Cancel</button>
              <button class="btn primary" type="submit">Save</button>
            </div>
          </div>
        </form>
      </section>
    </div>
  `;

  const close = () => {
    root.innerHTML = "";
  };

  root.querySelector("#project-cancel-btn")?.addEventListener("click", close);

  root.querySelector("#project-delete-btn")?.addEventListener("click", async () => {
    await deleteEditableProject(project.id);
    close();
    await renderRoute();
  });

  root.querySelector(".modal-backdrop")?.addEventListener("click", (event) => {
    if (event.target instanceof HTMLElement && event.target.classList.contains("modal-backdrop")) {
      close();
    }
  });

  root.querySelector("#project-edit-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!(form instanceof HTMLFormElement)) return;

    const formData = new FormData(form);

    await updateEditableProject(project.id, {
      name: String(formData.get("name") || "").trim(),
      description: String(formData.get("description") || "").trim(),
      techStacks: String(formData.get("techStacks") || "").trim(),
      language: String(formData.get("language") || "").trim(),
      html_url: String(formData.get("html_url") || "").trim()
    });

    close();
    await renderRoute();
  });
}

function setupProjectsActions() {
  const stars = document.getElementById("sort-stars");
  const updated = document.getElementById("sort-updated");
  const addProject = document.getElementById("add-project-btn");
  const container = document.getElementById("project-content");

  if (stars) {
    stars.addEventListener("click", () => {
      currentProjectSort = "stars";
      renderProjects(container);
    });
  }

  if (updated) {
    updated.addEventListener("click", () => {
      currentProjectSort = "updated";
      renderProjects(container);
    });
  }

  if (addProject) {
    addProject.addEventListener("click", async () => {
      const project = await addCustomProject();
      await renderRoute();
      if (project?.id) {
        await openProjectEditor(project.id);
      }
    });
  }

  if (container) {
    container.addEventListener("click", async (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;

      const action = target.getAttribute("data-project-action");
      if (action === "edit") {
        event.stopPropagation();
        const card = target.closest("[data-project-id]");
        if (!(card instanceof HTMLElement)) return;
        const projectId = card.dataset.projectId;
        if (!projectId) return;
        await openProjectEditor(projectId);
        return;
      }

      if (target.closest("a")) return;

      const card = target.closest("[data-project-id]");
      if (!(card instanceof HTMLElement)) return;
      card.classList.toggle("expanded");
    });
  }
}

async function openAboutEditor() {
  const about = await getAboutProfile();
  const root = document.getElementById("linkedin-modal-root");
  if (!root) return;

  const esc = (value = "") =>
    String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  root.innerHTML = `
    <div class="modal-backdrop" role="dialog" aria-modal="true" aria-label="Edit about section">
      <section class="modal panel glass exp-edit-modal">
        <h2>Edit About</h2>
        <form id="about-edit-form" class="exp-edit-form">
          <label class="field-label" for="about-image-url">Profile image URL</label>
          <input id="about-image-url" name="imageUrl" class="exp-form-control" type="url" value="${esc(about.imageUrl || "")}" placeholder="https://..." />
          <label class="field-label" for="about-image-file">Or upload custom image</label>
          <input id="about-image-file" class="exp-form-control" type="file" accept="image/*" />
          <div id="about-image-preview" class="about-edit-preview">
            <img id="about-image-preview-img" src="${esc(about.imageUrl || "./assets/profile.jpg")}" alt="About preview" />
          </div>

          <section class="about-crop-panel" id="about-crop-panel">
            <h3>Crop uploaded image (optional)</h3>
            <canvas id="about-crop-canvas" width="420" height="240"></canvas>
            <div class="about-crop-controls">
              <label class="field-label" for="about-crop-zoom">Zoom</label>
              <input id="about-crop-zoom" type="range" min="100" max="300" value="100" />
              <label class="field-label" for="about-crop-x">Horizontal</label>
              <input id="about-crop-x" type="range" min="-100" max="100" value="0" />
              <label class="field-label" for="about-crop-y">Vertical</label>
              <input id="about-crop-y" type="range" min="-100" max="100" value="0" />
            </div>
            <div class="actions-row">
              <button class="btn" type="button" id="about-use-original-btn">Use Original</button>
              <button class="btn" type="button" id="about-apply-crop-btn">Apply Crop</button>
            </div>
          </section>

          <label class="field-label">About text (rich formatting)</label>
          <div class="about-toolbar" id="about-toolbar">
            <button type="button" class="btn" data-cmd="bold">Bold</button>
            <button type="button" class="btn" data-cmd="italic">Italic</button>
            <button type="button" class="btn" data-cmd="underline">Underline</button>
            <button type="button" class="btn" data-cmd="insertUnorderedList">Bullets</button>
            <button type="button" class="btn" data-cmd="insertOrderedList">Numbered</button>
            <button type="button" class="btn" data-cmd="formatBlock" data-value="h3">Heading</button>
            <button type="button" class="btn" data-cmd="formatBlock" data-value="blockquote">Quote</button>
            <button type="button" class="btn" data-cmd="createLink">Link</button>
          </div>
          <div id="about-rich-editor" class="about-rich-editor" contenteditable="true">${about.contentHtml || "<p>Write your about section...</p>"}</div>

          <label class="field-label" for="about-highlights">Highlights (comma separated chips)</label>
          <input id="about-highlights" name="highlights" class="exp-form-control" type="text" value="${esc((about.highlights || []).join(", "))}" placeholder="Frontend Engineering, UI Motion, Leadership" />

          <div class="exp-edit-actions">
            <span></span>
            <div class="exp-edit-actions-right">
              <button class="btn" type="button" id="about-cancel-btn">Cancel</button>
              <button class="btn primary" type="submit">Save</button>
            </div>
          </div>
        </form>
      </section>
    </div>
  `;

  const close = () => {
    root.innerHTML = "";
  };

  const previewImg = root.querySelector("#about-image-preview-img");
  const imageUrlInput = root.querySelector("#about-image-url");
  const fileInput = root.querySelector("#about-image-file");
  const cropCanvas = root.querySelector("#about-crop-canvas");
  const cropZoom = root.querySelector("#about-crop-zoom");
  const cropX = root.querySelector("#about-crop-x");
  const cropY = root.querySelector("#about-crop-y");
  const editor = root.querySelector("#about-rich-editor");

  let uploadedImage = null;
  let uploadedImageDataUrl = "";

  const refreshPreview = (value) => {
    if (!(previewImg instanceof HTMLImageElement)) return;
    const src = String(value || "").trim() || "./assets/profile.jpg";
    previewImg.src = src;
  };

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  const renderCropPreview = () => {
    if (!(cropCanvas instanceof HTMLCanvasElement) || !uploadedImage) return;
    const context = cropCanvas.getContext("2d");
    if (!context) return;

    const zoom = Number(cropZoom?.value || 100) / 100;
    const offsetX = Number(cropX?.value || 0) / 100;
    const offsetY = Number(cropY?.value || 0) / 100;

    const sourceWidth = uploadedImage.naturalWidth;
    const sourceHeight = uploadedImage.naturalHeight;
    const cropWidth = sourceWidth / zoom;
    const cropHeight = sourceHeight / zoom;

    const maxShiftX = (sourceWidth - cropWidth) / 2;
    const maxShiftY = (sourceHeight - cropHeight) / 2;

    const centerX = sourceWidth / 2 + offsetX * maxShiftX;
    const centerY = sourceHeight / 2 + offsetY * maxShiftY;

    const sx = clamp(centerX - cropWidth / 2, 0, sourceWidth - cropWidth);
    const sy = clamp(centerY - cropHeight / 2, 0, sourceHeight - cropHeight);

    context.clearRect(0, 0, cropCanvas.width, cropCanvas.height);
    context.drawImage(uploadedImage, sx, sy, cropWidth, cropHeight, 0, 0, cropCanvas.width, cropCanvas.height);
  };

  const applyCrop = async () => {
    if (!(cropCanvas instanceof HTMLCanvasElement) || !uploadedImage || !(imageUrlInput instanceof HTMLInputElement)) return;

    const zoom = Number(cropZoom?.value || 100) / 100;
    const offsetX = Number(cropX?.value || 0) / 100;
    const offsetY = Number(cropY?.value || 0) / 100;

    const sourceWidth = uploadedImage.naturalWidth;
    const sourceHeight = uploadedImage.naturalHeight;
    const cropWidth = sourceWidth / zoom;
    const cropHeight = sourceHeight / zoom;
    const maxShiftX = (sourceWidth - cropWidth) / 2;
    const maxShiftY = (sourceHeight - cropHeight) / 2;

    const centerX = sourceWidth / 2 + offsetX * maxShiftX;
    const centerY = sourceHeight / 2 + offsetY * maxShiftY;

    const sx = clamp(centerX - cropWidth / 2, 0, sourceWidth - cropWidth);
    const sy = clamp(centerY - cropHeight / 2, 0, sourceHeight - cropHeight);

    const outputCanvas = document.createElement("canvas");
    outputCanvas.width = Math.max(1, Math.round(cropWidth));
    outputCanvas.height = Math.max(1, Math.round(cropHeight));

    const outputContext = outputCanvas.getContext("2d");
    if (!outputContext) return;

    outputContext.drawImage(
      uploadedImage,
      sx,
      sy,
      cropWidth,
      cropHeight,
      0,
      0,
      outputCanvas.width,
      outputCanvas.height
    );

    const result = outputCanvas.toDataURL("image/png");
    imageUrlInput.value = result;
    refreshPreview(result);

    const nextImage = new Image();
    nextImage.onload = () => {
      uploadedImage = nextImage;
      uploadedImageDataUrl = result;
      if (cropZoom instanceof HTMLInputElement) cropZoom.value = "100";
      if (cropX instanceof HTMLInputElement) cropX.value = "0";
      if (cropY instanceof HTMLInputElement) cropY.value = "0";
      renderCropPreview();
    };
    nextImage.src = result;
  };

  imageUrlInput?.addEventListener("input", () => {
    refreshPreview(imageUrlInput.value);
  });

  fileInput?.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      imageUrlInput.value = dataUrl;
      refreshPreview(dataUrl);
      uploadedImageDataUrl = dataUrl;

      const image = new Image();
      image.onload = () => {
        uploadedImage = image;
        if (cropZoom instanceof HTMLInputElement) cropZoom.value = "100";
        if (cropX instanceof HTMLInputElement) cropX.value = "0";
        if (cropY instanceof HTMLInputElement) cropY.value = "0";
        renderCropPreview();
      };
      image.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });

  [cropZoom, cropX, cropY].forEach((input) => {
    input?.addEventListener("input", renderCropPreview);
  });

  root.querySelector("#about-use-original-btn")?.addEventListener("click", () => {
    if (!(imageUrlInput instanceof HTMLInputElement) || !uploadedImageDataUrl) return;
    imageUrlInput.value = uploadedImageDataUrl;
    refreshPreview(uploadedImageDataUrl);
    const image = new Image();
    image.onload = () => {
      uploadedImage = image;
      renderCropPreview();
    };
    image.src = uploadedImageDataUrl;
  });

  root.querySelector("#about-apply-crop-btn")?.addEventListener("click", () => {
    applyCrop();
  });

  root.querySelector("#about-toolbar")?.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)) return;
    const cmd = target.dataset.cmd;
    if (!cmd || !(editor instanceof HTMLElement)) return;
    editor.focus();

    if (cmd === "createLink") {
      const url = window.prompt("Enter URL", "https://");
      if (url) document.execCommand("createLink", false, url);
      return;
    }

    if (cmd === "formatBlock") {
      document.execCommand("formatBlock", false, target.dataset.value || "p");
      return;
    }

    document.execCommand(cmd, false);
  });

  root.querySelector("#about-cancel-btn")?.addEventListener("click", close);
  root.querySelector(".modal-backdrop")?.addEventListener("click", (event) => {
    if (event.target instanceof HTMLElement && event.target.classList.contains("modal-backdrop")) {
      close();
    }
  });

  root.querySelector("#about-edit-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!(form instanceof HTMLFormElement) || !(editor instanceof HTMLElement)) return;

    const formData = new FormData(form);
    const savedAbout = await saveAboutProfile({
      imageUrl: String(formData.get("imageUrl") || "").trim(),
      contentHtml: editor.innerHTML,
      highlights: String(formData.get("highlights") || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    });

    applySiteFavicon(savedAbout.imageUrl || "");

    close();
    await renderRoute();
  });
}

function setupAboutActions() {
  const editBtn = document.getElementById("edit-about-btn");
  if (!editBtn) return;
  editBtn.addEventListener("click", () => {
    openAboutEditor();
  });
}

function skillFormRow(item = {}) {
  const name = String(item.name || "").trim();
  const levelRaw = Number(item.level);
  const level = Number.isFinite(levelRaw) ? Math.max(0, Math.min(100, Math.round(levelRaw))) : 0;
  const iconUrl = String(item.iconUrl || "").trim();

  return `
    <article class="skill-edit-row panel" data-skill-row>
      <div class="skill-edit-grid">
        <div>
          <label class="field-label">Skill name</label>
          <input class="exp-form-control" data-skill-name type="text" value="${escapeHtml(name)}" placeholder="Python" />
        </div>
        <div>
          <label class="field-label">Proficiency (%)</label>
          <input class="exp-form-control" data-skill-level type="number" min="0" max="100" value="${level}" />
        </div>
      </div>

      <label class="field-label">Icon URL (optional)</label>
      <input class="exp-form-control" data-skill-icon-url type="url" value="${escapeHtml(iconUrl)}" placeholder="https://... or data:image/..." />

      <label class="field-label">Or upload icon (optional)</label>
      <input class="exp-form-control" data-skill-icon-file type="file" accept="image/*" />

      <div class="skill-icon-preview-wrap">
        <img class="skill-icon-preview" data-skill-icon-preview src="${escapeHtml(iconUrl)}" alt="Skill icon preview" />
      </div>

      <div class="exp-edit-actions">
        <span></span>
        <button class="btn" type="button" data-skill-remove>Remove Skill</button>
      </div>
    </article>
  `;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Unable to read icon file"));
    reader.readAsDataURL(file);
  });
}

async function openSkillSectionEditor(sectionId = "") {
  const sections = await getEditableSkills();
  const isNewSection = !sectionId;
  const currentSection = isNewSection
    ? createEmptySkillSection()
    : sections.find((item) => String(item.id) === String(sectionId));

  if (!currentSection) return;

  const root = document.getElementById("linkedin-modal-root");
  if (!root) return;

  root.innerHTML = `
    <div class="modal-backdrop" role="dialog" aria-modal="true" aria-label="${isNewSection ? "Add skill section" : "Edit skill section"}">
      <section class="modal panel glass exp-edit-modal">
        <h2>${isNewSection ? "Add Skill Section" : "Edit Skill Section"}</h2>
        <form id="skills-section-form" class="exp-edit-form">
          <label class="field-label" for="skills-section-title">Section title</label>
          <input id="skills-section-title" class="exp-form-control" type="text" value="${escapeHtml(currentSection.category || "")}" placeholder="Languages/Frameworks" required />

          <div class="actions-row">
            <button class="btn" type="button" id="add-skill-row-btn">Add Skill</button>
          </div>

          <div id="skills-rows-container" class="skills-edit-list"></div>

          <div class="exp-edit-actions">
            ${
              isNewSection
                ? "<span></span>"
                : '<button class="btn" type="button" id="skills-section-delete-btn">Delete Section</button>'
            }
            <div class="exp-edit-actions-right">
              <button class="btn" type="button" id="skills-section-cancel-btn">Cancel</button>
              <button class="btn primary" type="submit">Save</button>
            </div>
          </div>
        </form>
      </section>
    </div>
  `;

  const close = () => {
    root.innerHTML = "";
  };

  const rowsContainer = root.querySelector("#skills-rows-container");
  if (!(rowsContainer instanceof HTMLElement)) return;

  const addRow = (item = {}) => {
    rowsContainer.insertAdjacentHTML("beforeend", skillFormRow(item));
    const row = rowsContainer.lastElementChild;
    if (!(row instanceof HTMLElement)) return;

    const fileInput = row.querySelector("[data-skill-icon-file]");
    const iconInput = row.querySelector("[data-skill-icon-url]");
    const preview = row.querySelector("[data-skill-icon-preview]");
    const removeButton = row.querySelector("[data-skill-remove]");

    const refreshPreview = () => {
      if (!(iconInput instanceof HTMLInputElement) || !(preview instanceof HTMLImageElement)) return;
      const src = String(iconInput.value || "").trim();
      if (!src) {
        preview.removeAttribute("src");
        return;
      }
      preview.src = src;
    };

    iconInput?.addEventListener("input", refreshPreview);

    fileInput?.addEventListener("change", async () => {
      if (!(fileInput instanceof HTMLInputElement) || !(iconInput instanceof HTMLInputElement)) return;
      const file = fileInput.files?.[0];
      if (!file) return;
      const dataUrl = await readFileAsDataUrl(file);
      iconInput.value = dataUrl;
      refreshPreview();
    });

    removeButton?.addEventListener("click", () => {
      const rows = rowsContainer.querySelectorAll("[data-skill-row]");
      if (rows.length <= 1) {
        const nameInput = row.querySelector("[data-skill-name]");
        const levelInput = row.querySelector("[data-skill-level]");
        if (nameInput instanceof HTMLInputElement) nameInput.value = "";
        if (levelInput instanceof HTMLInputElement) levelInput.value = "80";
        if (iconInput instanceof HTMLInputElement) iconInput.value = "";
        refreshPreview();
        return;
      }
      row.remove();
    });

    refreshPreview();
  };

  (currentSection.items || []).forEach((item) => addRow(item));
  if (!(currentSection.items || []).length) addRow();

  root.querySelector("#add-skill-row-btn")?.addEventListener("click", () => addRow());
  root.querySelector("#skills-section-cancel-btn")?.addEventListener("click", close);

  root.querySelector("#skills-section-delete-btn")?.addEventListener("click", async () => {
    if (isNewSection) return;

    const shouldDelete = window.confirm(`Delete section "${currentSection.category}"?`);
    if (!shouldDelete) return;

    const nextSkills = sections.filter((item) => String(item.id) !== String(currentSection.id));
    await saveEditableSkills(nextSkills);
    close();
    await renderRoute();
  });

  root.querySelector(".modal-backdrop")?.addEventListener("click", (event) => {
    if (event.target instanceof HTMLElement && event.target.classList.contains("modal-backdrop")) {
      close();
    }
  });

  root.querySelector("#skills-section-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();

    const titleInput = root.querySelector("#skills-section-title");
    if (!(titleInput instanceof HTMLInputElement)) return;

    const items = Array.from(rowsContainer.querySelectorAll("[data-skill-row]"))
      .map((row) => {
        const nameInput = row.querySelector("[data-skill-name]");
        const levelInput = row.querySelector("[data-skill-level]");
        const iconInput = row.querySelector("[data-skill-icon-url]");

        const rawLevel = Number(levelInput instanceof HTMLInputElement ? levelInput.value : 0);

        return {
          name: String(nameInput instanceof HTMLInputElement ? nameInput.value : "").trim(),
          level: Number.isFinite(rawLevel) ? Math.max(0, Math.min(100, Math.round(rawLevel))) : 0,
          iconUrl: String(iconInput instanceof HTMLInputElement ? iconInput.value : "").trim()
        };
      })
      .filter((item) => item.name);

    if (!items.length) {
      window.alert("Please add at least one skill name before saving.");
      return;
    }

    const nextSection = {
      ...currentSection,
      category: String(titleInput.value || "").trim() || "New Section",
      items
    };

    const nextSkills = isNewSection
      ? [...sections, nextSection]
      : sections.map((item) => (String(item.id) === String(currentSection.id) ? nextSection : item));

    await saveEditableSkills(nextSkills);
    close();
    await renderRoute();
  });
}

function setupSkillsActions() {
  const addSectionButton = document.getElementById("add-skill-section-btn");
  const categoriesContainer = document.querySelector(".skills-categories");

  addSectionButton?.addEventListener("click", () => {
    openSkillSectionEditor();
  });

  categoriesContainer?.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const actionButton = target.closest("[data-skill-action='edit-section']");
    if (actionButton instanceof HTMLElement) {
      const sectionId = actionButton.dataset.skillSectionId;
      if (sectionId) openSkillSectionEditor(sectionId);
      return;
    }

    const section = target.closest("[data-skill-section-id]");
    if (!(section instanceof HTMLElement)) return;
    const sectionId = section.dataset.skillSectionId;
    if (!sectionId) return;
    openSkillSectionEditor(sectionId);
  });

  categoriesContainer?.addEventListener("keydown", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (!target.matches("[data-skill-section-id]")) return;
    if (!["Enter", " "].includes(event.key)) return;

    event.preventDefault();
    const sectionId = target.dataset.skillSectionId;
    if (sectionId) openSkillSectionEditor(sectionId);
  });
}

const MONTH_OPTIONS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December"
];

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function parseMonthYear(value = "") {
  const text = String(value || "").trim();
  if (!text || /^present$/i.test(text)) return { month: "", year: "" };

  const isoMatch = text.match(/^(\d{4})-(\d{2})$/);
  if (isoMatch) {
    const monthIndex = Math.max(0, Math.min(11, Number(isoMatch[2]) - 1));
    return { month: MONTH_OPTIONS[monthIndex], year: isoMatch[1] };
  }

  const monthYearMatch = text.match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (monthYearMatch) {
    const month = MONTH_OPTIONS.find(
      (item) => item.toLowerCase().slice(0, 3) === monthYearMatch[1].toLowerCase().slice(0, 3)
    );
    return { month: month || "", year: monthYearMatch[2] };
  }

  const yearMatch = text.match(/^(\d{4})$/);
  if (yearMatch) return { month: "", year: yearMatch[1] };

  return { month: "", year: "" };
}

function composeMonthYear(month = "", year = "") {
  const m = String(month).trim();
  const y = String(year).trim();
  if (m && y) return `${m} ${y}`;
  if (y) return y;
  return m;
}

async function openExperienceEditor(experienceId) {
  const payload = await getEditableLinkedinPayload(siteConfig.socials.linkedin || "");
  const exp = payload.experiences.find((item) => item.id === experienceId);
  if (!exp) return;

  const root = document.getElementById("linkedin-modal-root");
  if (!root) return;

  const start = parseMonthYear(exp.start);
  const end = parseMonthYear(exp.end);
  const currentRole = /^present$/i.test(exp.end || "") || !exp.end;

  const monthSelect = (id, selected) => `
    <select id="${id}" class="exp-form-control">
      <option value="">Month</option>
      ${MONTH_OPTIONS.map(
        (m) => `<option value="${m}" ${selected === m ? "selected" : ""}>${m}</option>`
      ).join("")}
    </select>
  `;

  root.innerHTML = `
    <div class="modal-backdrop" role="dialog" aria-modal="true" aria-label="Edit experience">
      <section class="modal panel glass exp-edit-modal">
        <h2>Edit experience</h2>
        <form id="experience-edit-form" class="exp-edit-form">
          <label class="field-label" for="exp-role">Title*</label>
          <input id="exp-role" name="role" class="exp-form-control" type="text" required value="${escapeHtml(exp.role || "")}" />

          <label class="field-label" for="exp-employmentType">Employment type</label>
          <select id="exp-employmentType" name="employmentType" class="exp-form-control">
            <option value="" ${!exp.employmentType ? "selected" : ""}>Select</option>
            ${["Full-time", "Part-time", "Internship", "Freelance", "Contract"]
              .map((item) => `<option value="${item}" ${exp.employmentType === item ? "selected" : ""}>${item}</option>`)
              .join("")}
          </select>

          <label class="field-label" for="exp-company">Company or organization*</label>
          <input id="exp-company" name="company" class="exp-form-control" type="text" required value="${escapeHtml(exp.company || "")}" />

          <label class="exp-checkbox-row">
            <input id="exp-current-role" type="checkbox" ${currentRole ? "checked" : ""} />
            <span>I am currently working in this role</span>
          </label>

          <label class="field-label">Start date*</label>
          <div class="exp-date-grid">
            ${monthSelect("exp-start-month", start.month)}
            <input id="exp-start-year" class="exp-form-control" type="number" min="1950" max="2100" value="${escapeHtml(start.year || "")}" placeholder="Year" />
          </div>

          <label class="field-label">End date*</label>
          <div class="exp-date-grid">
            ${monthSelect("exp-end-month", end.month)}
            <input id="exp-end-year" class="exp-form-control" type="number" min="1950" max="2100" value="${escapeHtml(end.year || "")}" placeholder="Year" />
          </div>

          <label class="field-label" for="exp-location">Location</label>
          <input id="exp-location" name="location" class="exp-form-control" type="text" value="${escapeHtml(exp.location || "")}" />

          <label class="field-label" for="exp-location-type">Location type</label>
          <select id="exp-location-type" name="locationType" class="exp-form-control">
            <option value="" ${!exp.locationType ? "selected" : ""}>Select</option>
            ${["On-site", "Hybrid", "Remote"]
              .map((item) => `<option value="${item}" ${exp.locationType === item ? "selected" : ""}>${item}</option>`)
              .join("")}
          </select>

          <label class="field-label" for="exp-description">Description</label>
          <textarea id="exp-description" name="description" rows="6" class="exp-form-control">${escapeHtml(exp.description || "")}</textarea>

          <label class="field-label" for="exp-skills">Skills</label>
          <input id="exp-skills" name="skills" class="exp-form-control" type="text" value="${escapeHtml((exp.skills || []).join(", "))}" placeholder="Project Management, PMO, Agile" />

          <label class="field-label" for="exp-logo-url">Organization logo URL</label>
          <input id="exp-logo-url" name="logoUrl" class="exp-form-control" type="url" value="${escapeHtml(exp.logoUrl || "")}" />

          <div class="exp-edit-actions">
            <button class="btn" type="button" id="exp-delete-btn">Delete experience</button>
            <div class="exp-edit-actions-right">
              <button class="btn" type="button" id="exp-cancel-btn">Cancel</button>
              <button class="btn primary" type="submit">Save</button>
            </div>
          </div>
        </form>
      </section>
    </div>
  `;

  const close = () => {
    root.innerHTML = "";
  };

  const currentCheckbox = root.querySelector("#exp-current-role");
  const endMonth = root.querySelector("#exp-end-month");
  const endYear = root.querySelector("#exp-end-year");

  const toggleEndDate = () => {
    const disabled = Boolean(currentCheckbox?.checked);
    if (endMonth instanceof HTMLSelectElement) endMonth.disabled = disabled;
    if (endYear instanceof HTMLInputElement) endYear.disabled = disabled;
  };

  currentCheckbox?.addEventListener("change", toggleEndDate);
  toggleEndDate();

  root.querySelector("#exp-cancel-btn")?.addEventListener("click", close);

  root.querySelector("#exp-delete-btn")?.addEventListener("click", async () => {
    await deleteLinkedinExperience(exp.id, siteConfig.socials.linkedin || "");
    close();
    await renderRoute();
  });

  root.querySelector(".modal-backdrop")?.addEventListener("click", (event) => {
    if (event.target instanceof HTMLElement && event.target.classList.contains("modal-backdrop")) {
      close();
    }
  });

  root.querySelector("#experience-edit-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!(form instanceof HTMLFormElement)) return;

    const formData = new FormData(form);
    const current = Boolean(currentCheckbox?.checked);

    const startValue = composeMonthYear(
      String((root.querySelector("#exp-start-month") || {}).value || ""),
      String((root.querySelector("#exp-start-year") || {}).value || "")
    );
    const endValue = current
      ? "Present"
      : composeMonthYear(
          String((root.querySelector("#exp-end-month") || {}).value || ""),
          String((root.querySelector("#exp-end-year") || {}).value || "")
        );

    await updateLinkedinExperience(
      exp.id,
      {
        role: String(formData.get("role") || "").trim(),
        employmentType: String(formData.get("employmentType") || "").trim(),
        company: String(formData.get("company") || "").trim(),
        start: startValue,
        end: endValue,
        location: String(formData.get("location") || "").trim(),
        locationType: String(formData.get("locationType") || "").trim(),
        description: String(formData.get("description") || "").trim(),
        skills: String(formData.get("skills") || "").trim(),
        logoUrl: String(formData.get("logoUrl") || "").trim()
      },
      siteConfig.socials.linkedin || ""
    );

    close();
    await renderRoute();
  });
}

function setupExperienceActions() {
  const importButton = document.getElementById("import-linkedin-btn");
  const addButton = document.getElementById("add-experience-btn");
  const syncButton = document.getElementById("sync-linkedin-btn");
  const content = document.getElementById("experience-content");

  if (importButton) {
    importButton.addEventListener("click", () => {
      openLinkedinImportModal({
        onSaved: renderRoute,
        defaultProfileUrl: siteConfig.socials.linkedin || ""
      });
    });
  }

  if (addButton) {
    addButton.addEventListener("click", async () => {
      const updated = await addLinkedinExperience(siteConfig.socials.linkedin || "");
      await renderRoute();
      const newExp = updated?.experiences?.[0];
      if (newExp?.id) {
        await openExperienceEditor(newExp.id);
      }
    });
  }

  if (syncButton) {
    const syncConfig = getSyncConfig(siteConfig);
    syncButton.disabled = !syncConfig.enabled;
    if (!syncConfig.enabled) {
      syncButton.title = "Enable linkedinSync in site.config.js to use OAuth sync";
    }

    syncButton.addEventListener("click", async () => {
      try {
        await startLinkedinOAuth(siteConfig);
      } catch (error) {
        experienceSyncStatus = {
          ok: false,
          message: error instanceof Error ? error.message : "Unable to start LinkedIn OAuth",
          warnings: []
        };
        await renderRoute();
      }
    });
  }

  if (content) {
    content.addEventListener("click", async (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const action = target.getAttribute("data-exp-action");
      if (!action) return;

      const card = target.closest("[data-exp-id]");
      if (!(card instanceof HTMLElement)) return;

      const experienceId = card.dataset.expId;
      if (!experienceId) return;

      if (action === "edit") {
        await openExperienceEditor(experienceId);
        return;
      }

      if (action === "delete") {
        await deleteLinkedinExperience(experienceId, siteConfig.socials.linkedin || "");
        await renderRoute();
      }
    });
  }

  document.querySelectorAll(".drag-row").forEach((row) => setupDragRow(row));
}

function openLightbox(hobby, startId) {
  const root = document.getElementById("lightbox-root");
  if (!root || !hobby) return;

  let idx = Math.max(
    0,
    hobby.gallery.findIndex((img) => String(img.id) === String(startId))
  );

  const render = () => {
    const active = hobby.gallery[idx];
    root.innerHTML = `
      <div class="lightbox" role="dialog" aria-modal="true" aria-label="Image viewer">
        <section class="lightbox-card panel glass">
          <img src="${active.src}" alt="${active.caption || hobby.name}" style="width:100%;max-height:70vh;object-fit:contain;border-radius:12px;" />
          <p>${active.caption || ""}</p>
          <div class="actions-row">
            <button class="btn" id="lb-prev">Prev</button>
            <button class="btn" id="lb-next">Next</button>
            <button class="btn" id="lb-close">Close</button>
          </div>
        </section>
      </div>
    `;

    root.querySelector("#lb-prev")?.addEventListener("click", () => {
      idx = (idx - 1 + hobby.gallery.length) % hobby.gallery.length;
      render();
    });

    root.querySelector("#lb-next")?.addEventListener("click", () => {
      idx = (idx + 1) % hobby.gallery.length;
      render();
    });

    root.querySelector("#lb-close")?.addEventListener("click", () => {
      root.innerHTML = "";
    });

    root.querySelector(".lightbox")?.addEventListener("click", (event) => {
      if (event.target.classList.contains("lightbox")) root.innerHTML = "";
    });
  };

  render();
}

function setupHobbyPageActions(hobby) {
  const upload = document.getElementById("hobby-upload");

  if (upload) {
    upload.addEventListener("change", async () => {
      const files = Array.from(upload.files || []);
      for (const file of files) {
        await addHobbyImage(hobby.slug, file);
      }
      await renderRoute();
    });
  }

  document.querySelectorAll("[data-caption-id]").forEach((input) => {
    input.addEventListener("change", async (event) => {
      const target = event.currentTarget;
      if (!(target instanceof HTMLInputElement)) return;
      await updateHobbyCaption(hobby.slug, target.dataset.captionId, target.value);
    });
  });

  document.querySelectorAll("[data-lightbox]").forEach((img) => {
    img.addEventListener("click", (event) => {
      const target = event.currentTarget;
      if (!(target instanceof HTMLElement)) return;
      openLightbox(hobby, target.dataset.lightbox);
    });
  });
}

async function renderRoute() {
  const route = parseRoute(location.hash || getLastRoute());
  const container = document.getElementById("route-container");
  const header = document.getElementById("hero-header");
  if (!container) return;

  header?.classList.toggle("on-hero", route.page === "home");

  if (!document.startViewTransition) {
    setupFallbackTransition(container);
  }

  if (route.page === "experience") {
    const payload = await getEditableLinkedinPayload(siteConfig.socials.linkedin || "");
    container.innerHTML = pageTemplate("experience", {
      experienceHtml: experienceHtmlFromPayload(payload),
      syncStatus: experienceSyncStatus
    });
    setupExperienceActions();
    experienceSyncStatus = null;
  } else if (route.page === "about") {
    const about = await getAboutProfile();
    container.innerHTML = pageTemplate("about", { about });
    setupAboutActions();
  } else if (route.page === "projects") {
    container.innerHTML = pageTemplate("projects", { projectHtml: projectSkeletons() });
    setupProjectsActions();
    await renderProjects(document.getElementById("project-content"));
  } else if (route.page === "skills") {
    const skills = await getEditableSkills();
    container.innerHTML = pageTemplate("skills", { skills });
    setupSkillsActions();
  } else if (route.page === "hobbies") {
    container.innerHTML = pageTemplate("hobbies", { hobbies: hobbiesCache });
  } else if (route.page === "hobby") {
    const hobby = await getHobby(route.slug);
    container.innerHTML = pageTemplate("hobby", { hobby });
    if (hobby) setupHobbyPageActions(hobby);
  } else {
    container.innerHTML = pageTemplate(route.page);
  }

  setLastRoute(location.hash || "#/home");
  syncActiveNav(route.page === "hobby" ? "hobbies" : route.page);
  setupReveals();
  setupHeroParallax();
  document.getElementById("main-content")?.focus();
}

function setupGlobalHashListener() {
  window.addEventListener("hashchange", renderRoute);
}

function setupReducedMotionHotkey() {
  window.addEventListener("keydown", (event) => {
    if (event.altKey && event.key.toLowerCase() === "m") {
      const next = !prefersReducedMotion();
      setReducedMotionOverride(next);
      renderRoute();
    }
  });
}

async function init() {
  document.documentElement.setAttribute("data-theme", getPrefTheme());

  const startupAbout = await getAboutProfile();
  applySiteFavicon(startupAbout.imageUrl || "");

  buildRouteLinks();
  buildSocialRow({ socials: siteConfig.socials, resumeUrl: siteConfig.resumeUrl });
  buildMobileNav();
  setupThemeToggle();
  setTheme(getPrefTheme());
  setupMobileMenu();

  if (siteConfig.githubSync?.enabled) {
    const tokenFromConfig = String(siteConfig.githubSync?.token || "").trim();
    if (tokenFromConfig) {
      setGithubSyncToken(tokenFromConfig);
    }

    try {
      await setupGithubSync(siteConfig.githubSync);
    } catch {
      // continue with local persistence even if GitHub sync setup fails
    }
  }

  hobbiesCache = await ensureHobbies(siteConfig.hobbies);

  setupScrollProgress();
  setupPageDragNavigation();
  setupGlobalHashListener();
  setupReducedMotionHotkey();

  const oauthResult = await handleLinkedinOAuthCallback(siteConfig);
  if (oauthResult) {
    experienceSyncStatus = oauthResult;
    location.hash = "#/experience";
  }

  if (!location.hash) {
    location.hash = getLastRoute() || "#/home";
  }

  await renderRoute();

  if (siteConfig.githubSync?.enabled && siteConfig.githubSync?.token) {
    try {
      await forceGithubSync("initial-bootstrap");
    } catch {
      // keep UX uninterrupted; next edits retry sync automatically
    }
  }
}

init();
