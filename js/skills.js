import siteConfig from "../site.config.js";
import { idbGet, idbSet, storage } from "./storage.js";

const SKILLS_KEY = "skillsProfile";
const SKILLS_LS_KEY = "portfolio.skillsProfile";

function createId(prefix = "skill") {
  return `${prefix}-${Date.now()}-${Math.round(Math.random() * 1_000_000)}`;
}

function clampLevel(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(100, Math.round(numeric)));
}

function normalizeItem(item = {}) {
  return {
    name: String(item.name || "").trim(),
    level: clampLevel(item.level),
    iconUrl: String(item.iconUrl || "").trim()
  };
}

function normalizeGroup(group = {}) {
  const items = Array.isArray(group.items)
    ? group.items.map((item) => normalizeItem(item)).filter((item) => item.name)
    : [];

  return {
    id: String(group.id || "").trim() || createId("skill-section"),
    category: String(group.category || "").trim() || "New Section",
    items
  };
}

function normalizeSkills(groups = []) {
  return (Array.isArray(groups) ? groups : [])
    .map((group) => normalizeGroup(group))
    .filter((group) => group.category);
}

function defaultSkills() {
  return normalizeSkills(siteConfig.skills || []);
}

export async function getEditableSkills() {
  let storedValue = null;

  try {
    const stored = await idbGet("profile", SKILLS_KEY);
    storedValue = stored?.value || null;
  } catch {
    storedValue = null;
  }

  if (!storedValue) {
    storedValue = storage.get(SKILLS_LS_KEY, null);
  }

  const next = storedValue ? normalizeSkills(storedValue) : defaultSkills();

  storage.set(SKILLS_LS_KEY, next);
  try {
    await idbSet("profile", { key: SKILLS_KEY, value: next, updatedAt: Date.now() });
  } catch {
    // localStorage already contains fallback data
  }

  return next;
}

export async function saveEditableSkills(groups = []) {
  const next = normalizeSkills(groups);

  storage.set(SKILLS_LS_KEY, next);
  try {
    await idbSet("profile", { key: SKILLS_KEY, value: next, updatedAt: Date.now() });
  } catch {
    // localStorage already contains fallback data
  }

  return next;
}

export function createEmptySkillSection() {
  return {
    id: createId("skill-section"),
    category: "",
    items: [{ name: "", level: 80, iconUrl: "" }]
  };
}
