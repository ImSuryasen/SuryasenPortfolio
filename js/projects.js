import { idbGet, idbSet } from "./storage.js";
import { getGithubRepos } from "./github.js";
import { storage } from "./storage.js";

const PROJECTS_KEY = "projectsProfile";
const PROJECTS_LS_KEY = "portfolio.projectsProfile";

function defaultState() {
  return {
    overrides: {},
    customProjects: [],
    hiddenIds: []
  };
}

function parseTechStacks(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

async function getState() {
  let storedValue = null;

  try {
    const stored = await idbGet("profile", PROJECTS_KEY);
    storedValue = stored?.value || null;
  } catch {
    storedValue = null;
  }

  if (!storedValue || typeof storedValue !== "object") {
    storedValue = storage.get(PROJECTS_LS_KEY, defaultState());
  }

  return {
    overrides: storedValue.overrides && typeof storedValue.overrides === "object" ? storedValue.overrides : {},
    customProjects: Array.isArray(storedValue.customProjects) ? storedValue.customProjects : [],
    hiddenIds: Array.isArray(storedValue.hiddenIds) ? storedValue.hiddenIds : []
  };
}

async function saveState(next) {
  storage.set(PROJECTS_LS_KEY, next);

  try {
    await idbSet("profile", {
      key: PROJECTS_KEY,
      value: next,
      updatedAt: Date.now()
    });
  } catch {
    // localStorage already has a durable fallback copy
  }
}

function normalizeProject(project) {
  const nowIso = new Date().toISOString();
  return {
    id: String(project.id || `custom_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`),
    source: project.source || "custom",
    name: String(project.name || "Untitled Project").trim(),
    description: String(project.description || "No description yet.").trim(),
    html_url: String(project.html_url || "").trim(),
    language: String(project.language || "").trim() || "Unknown",
    stargazers_count: Number(project.stargazers_count || 0),
    forks_count: Number(project.forks_count || 0),
    updated_at: project.updated_at || nowIso,
    techStacks: parseTechStacks(project.techStacks || (project.language ? [project.language] : []))
  };
}

function toProjectId(repo) {
  const raw = repo.id || repo.node_id || repo.html_url || repo.name;
  return `gh_${String(raw)}`;
}

function sortProjects(list, sortBy) {
  const projects = [...list];
  if (sortBy === "updated") {
    return projects.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
  }
  return projects.sort((a, b) => (b.stargazers_count || 0) - (a.stargazers_count || 0));
}

export async function getEditableProjects(username, sortBy = "stars") {
  const state = await getState();
  const githubResult = await getGithubRepos(username, "updated");

  const hiddenSet = new Set(state.hiddenIds || []);

  const githubProjects = (githubResult.repos || [])
    .map((repo) => {
      const id = toProjectId(repo);
      const override = state.overrides[id] || {};

      return normalizeProject({
        ...repo,
        ...override,
        id,
        source: "github",
        html_url: override.html_url || repo.html_url,
        techStacks: override.techStacks || (repo.language ? [repo.language] : [])
      });
    })
    .filter((item) => !hiddenSet.has(item.id));

  const customProjects = (state.customProjects || []).map((item) =>
    normalizeProject({
      ...item,
      source: "custom"
    })
  );

  const projects = sortProjects([...customProjects, ...githubProjects], sortBy);

  return {
    projects,
    error: githubResult.error,
    fromCache: githubResult.fromCache
  };
}

export async function addCustomProject() {
  const state = await getState();
  const project = normalizeProject({
    source: "custom",
    name: "New Project",
    description: "Describe the project, impact, and key outcomes.",
    html_url: "",
    language: "Unknown",
    techStacks: ["Tech Stack"]
  });

  state.customProjects.unshift(project);
  await saveState(state);
  return project;
}

export async function updateEditableProject(projectId, patch = {}) {
  const state = await getState();
  const id = String(projectId);

  if (id.startsWith("custom_")) {
    state.customProjects = state.customProjects.map((item) => {
      if (String(item.id) !== id) return item;
      return normalizeProject({
        ...item,
        ...patch,
        id,
        source: "custom",
        techStacks: patch.techStacks !== undefined ? parseTechStacks(patch.techStacks) : item.techStacks
      });
    });
  } else {
    const prev = state.overrides[id] || {};
    state.overrides[id] = {
      ...prev,
      ...patch,
      techStacks: patch.techStacks !== undefined ? parseTechStacks(patch.techStacks) : prev.techStacks
    };

    state.hiddenIds = state.hiddenIds.filter((item) => item !== id);
  }

  await saveState(state);
}

export async function deleteEditableProject(projectId) {
  const state = await getState();
  const id = String(projectId);

  if (id.startsWith("custom_")) {
    state.customProjects = state.customProjects.filter((item) => String(item.id) !== id);
  } else if (!state.hiddenIds.includes(id)) {
    state.hiddenIds.push(id);
  }

  await saveState(state);
}
