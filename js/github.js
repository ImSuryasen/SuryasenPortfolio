import { getGithubCache, setGithubCache } from "./storage.js";

const MAX_AGE = 1000 * 60 * 60 * 6;

function sortRepos(repos, sortBy) {
  const list = [...repos];
  if (sortBy === "updated") {
    return list.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
  }
  return list.sort((a, b) => (b.stargazers_count || 0) - (a.stargazers_count || 0));
}

function mapRepo(repo) {
  return {
    name: repo.name,
    description: repo.description || "No description",
    html_url: repo.html_url,
    language: repo.language || "Unknown",
    stargazers_count: repo.stargazers_count || 0,
    forks_count: repo.forks_count || 0,
    updated_at: repo.updated_at
  };
}

export async function getGithubRepos(username, sortBy = "stars") {
  if (!username) return { repos: [], error: "Missing GitHub username", fromCache: false };

  const cache = getGithubCache();
  const isFresh =
    cache &&
    cache.username === username &&
    Array.isArray(cache.repos) &&
    Date.now() - cache.timestamp < MAX_AGE;

  if (isFresh) {
    return { repos: sortRepos(cache.repos, sortBy), error: null, fromCache: true };
  }

  try {
    const response = await fetch(`https://api.github.com/users/${encodeURIComponent(username)}/repos?per_page=100&sort=updated`);
    if (!response.ok) {
      throw new Error(`GitHub API failed (${response.status})`);
    }

    const json = await response.json();
    const repos = json.map(mapRepo);

    setGithubCache({ username, repos, timestamp: Date.now() });

    return { repos: sortRepos(repos, sortBy), error: null, fromCache: false };
  } catch (error) {
    if (cache?.repos?.length && cache.username === username) {
      return { repos: sortRepos(cache.repos, sortBy), error: String(error.message), fromCache: true };
    }
    return { repos: [], error: String(error.message), fromCache: false };
  }
}
