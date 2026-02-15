const BASE_ROUTES = ["home", "about", "experience", "projects", "skills", "hobbies"];

export function normalizeHash(rawHash) {
  const hash = rawHash?.startsWith("#/") ? rawHash : "#/home";
  const cleaned = hash.replace(/^#\//, "").trim();
  if (!cleaned) return "#/home";

  const parts = cleaned.split("/");
  if (parts[0] === "hobby" && parts[1]) return `#/hobby/${parts[1]}`;
  if (BASE_ROUTES.includes(parts[0])) return `#/${parts[0]}`;
  return "#/home";
}

export function parseRoute(hash = location.hash) {
  const normalized = normalizeHash(hash);
  const parts = normalized.replace(/^#\//, "").split("/");

  if (parts[0] === "hobby") {
    return {
      page: "hobby",
      slug: decodeURIComponent(parts[1] || "")
    };
  }

  return { page: parts[0] || "home", slug: "" };
}

export function routeSequence(currentRoute) {
  const page = parseRoute(currentRoute).page;
  const idx = BASE_ROUTES.indexOf(page);
  return {
    prev: idx > 0 ? `#/${BASE_ROUTES[idx - 1]}` : null,
    next: idx >= 0 && idx < BASE_ROUTES.length - 1 ? `#/${BASE_ROUTES[idx + 1]}` : null
  };
}

export function navigate(hash) {
  const target = normalizeHash(hash);
  if (location.hash === target) {
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    return;
  }

  const render = () => {
    location.hash = target;
  };

  if (document.startViewTransition) {
    document.startViewTransition(render);
  } else {
    render();
  }
}
