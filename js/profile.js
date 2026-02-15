import siteConfig from "../site.config.js";
import { idbGet, idbSet, storage } from "./storage.js";

const ABOUT_KEY = "aboutProfile";
const ABOUT_LS_KEY = "portfolio.aboutProfile";

function defaultAboutProfile() {
  return {
    imageUrl: "",
    contentHtml: `<p>I am ${siteConfig.name}, a curious builder focused on shipping meaningful digital products, blending clean engineering with human-centered UI motion.</p>`,
    highlights: ["Frontend Engineering", "UI Motion Design", "Performance First", "Accessibility"]
  };
}

function sanitizeLink(href = "") {
  const value = String(href || "").trim();
  if (!value) return "";
  if (value.startsWith("#")) return value;

  try {
    const parsed = new URL(value, window.location.origin);
    if (["http:", "https:", "mailto:"].includes(parsed.protocol)) {
      return parsed.toString();
    }
  } catch {
    return "";
  }

  return "";
}

function sanitizeRichText(html = "") {
  const allowedTags = new Set(["P", "BR", "STRONG", "B", "EM", "I", "U", "UL", "OL", "LI", "A", "H3", "H4", "BLOCKQUOTE"]);
  const template = document.createElement("template");
  template.innerHTML = String(html || "");

  const walk = (node) => {
    const children = Array.from(node.children || []);
    children.forEach((child) => {
      if (!allowedTags.has(child.tagName)) {
        const fragment = document.createDocumentFragment();
        while (child.firstChild) {
          fragment.appendChild(child.firstChild);
        }
        child.replaceWith(fragment);
        return;
      }

      Array.from(child.attributes).forEach((attr) => {
        child.removeAttribute(attr.name);
      });

      if (child.tagName === "A") {
        const safeHref = sanitizeLink(child.getAttribute("href") || "");
        if (safeHref) {
          child.setAttribute("href", safeHref);
          child.setAttribute("target", "_blank");
          child.setAttribute("rel", "noopener noreferrer");
        } else {
          child.replaceWith(document.createTextNode(child.textContent || ""));
          return;
        }
      }

      walk(child);
    });
  };

  walk(template.content);
  return template.innerHTML.trim();
}

export async function getAboutProfile() {
  let storedValue = null;

  try {
    const stored = await idbGet("profile", ABOUT_KEY);
    storedValue = stored?.value || null;
  } catch {
    storedValue = null;
  }

  if (!storedValue || typeof storedValue !== "object") {
    storedValue = storage.get(ABOUT_LS_KEY, null);
  }

  if (!storedValue || typeof storedValue !== "object") {
    return defaultAboutProfile();
  }

  const value = storedValue;
  return {
    imageUrl: String(value.imageUrl || ""),
    contentHtml: sanitizeRichText(value.contentHtml || "") || defaultAboutProfile().contentHtml,
    highlights: Array.isArray(value.highlights)
      ? value.highlights.map((item) => String(item).trim()).filter(Boolean)
      : defaultAboutProfile().highlights
  };
}

export async function saveAboutProfile(patch = {}) {
  const current = await getAboutProfile();

  const next = {
    imageUrl: String(patch.imageUrl ?? current.imageUrl ?? "").trim(),
    contentHtml: sanitizeRichText(patch.contentHtml ?? current.contentHtml ?? "") || defaultAboutProfile().contentHtml,
    highlights: Array.isArray(patch.highlights)
      ? patch.highlights.map((item) => String(item).trim()).filter(Boolean)
      : current.highlights
  };

  storage.set(ABOUT_LS_KEY, next);

  try {
    await idbSet("profile", { key: ABOUT_KEY, value: next, updatedAt: Date.now() });
  } catch {
    // localStorage already contains the durable fallback copy
  }

  return next;
}
