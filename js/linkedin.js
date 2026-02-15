import { idbGet, idbSet, storage } from "./storage.js";

const LINKEDIN_LS_KEY = "portfolio.linkedinTimeline";

const FALLBACK_SCHEMA = {
  required: ["experiences"],
  itemRequired: ["company", "role", "start", "end", "description"]
};

async function loadSchema() {
  try {
    const res = await fetch("./data/linkedin.schema.json");
    if (!res.ok) throw new Error("schema not found");
    return await res.json();
  } catch {
    return FALLBACK_SCHEMA;
  }
}

export async function getLinkedinPayload() {
  try {
    const stored = await idbGet("linkedin", "timeline");
    if (stored?.value) return stored.value;
  } catch {
    // fallback to localStorage below
  }

  return storage.get(LINKEDIN_LS_KEY, null);
}

export async function saveLinkedinPayload(payload) {
  storage.set(LINKEDIN_LS_KEY, payload);

  try {
    await idbSet("linkedin", { key: "timeline", value: payload, updatedAt: Date.now() });
  } catch {
    // localStorage already contains the durable fallback copy
  }
}

function experienceId() {
  return `exp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeExperience(item = {}) {
  return {
    id: item.id || experienceId(),
    company: item.company || "",
    role: item.role || "",
    employmentType: item.employmentType || "",
    location: item.location || "",
    locationType: item.locationType || "",
    start: item.start || "",
    end: item.end || "Present",
    description: item.description || "",
    skills: Array.isArray(item.skills)
      ? item.skills
      : typeof item.skills === "string"
      ? item.skills
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [],
    logoUrl: item.logoUrl || ""
  };
}

function normalizePayload(payload = {}) {
  const experiences = Array.isArray(payload.experiences) ? payload.experiences : [];
  return {
    profileUrl: payload.profileUrl || "",
    fullName: payload.fullName || "",
    experiences: experiences.map((item) => normalizeExperience(item))
  };
}

export async function getEditableLinkedinPayload(fallbackProfileUrl = "") {
  const payload = await getLinkedinPayload();
  if (!payload) {
    return {
      profileUrl: fallbackProfileUrl,
      fullName: "",
      experiences: []
    };
  }
  return normalizePayload(payload);
}

export async function addLinkedinExperience(fallbackProfileUrl = "") {
  const payload = await getEditableLinkedinPayload(fallbackProfileUrl);
  payload.experiences.unshift(
    normalizeExperience({
      company: "Organization",
      role: "Position",
      description: "Describe your impact, outcomes, and key contributions.",
      skills: ["Skill A", "Skill B"]
    })
  );
  await saveLinkedinPayload(payload);
  return payload;
}

export async function updateLinkedinExperience(experienceIdToUpdate, patch = {}, fallbackProfileUrl = "") {
  const payload = await getEditableLinkedinPayload(fallbackProfileUrl);
  payload.experiences = payload.experiences.map((item) => {
    if (item.id !== experienceIdToUpdate) return item;
    const merged = {
      ...item,
      ...patch
    };

    if (typeof merged.skills === "string") {
      merged.skills = merged.skills
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }

    return normalizeExperience(merged);
  });

  await saveLinkedinPayload(payload);
  return payload;
}

export async function deleteLinkedinExperience(experienceIdToDelete, fallbackProfileUrl = "") {
  const payload = await getEditableLinkedinPayload(fallbackProfileUrl);
  payload.experiences = payload.experiences.filter((item) => item.id !== experienceIdToDelete);
  await saveLinkedinPayload(payload);
  return payload;
}

export async function validateLinkedinPayload(payload) {
  const schema = await loadSchema();

  if (!payload || typeof payload !== "object") {
    return { valid: false, errors: ["Payload must be a JSON object"] };
  }

  if (!Array.isArray(payload.experiences)) {
    return { valid: false, errors: ["experiences must be an array"] };
  }

  const itemRequired = schema.itemRequired || FALLBACK_SCHEMA.itemRequired;
  const errors = [];

  payload.experiences.forEach((item, index) => {
    itemRequired.forEach((field) => {
      if (!item[field]) errors.push(`experiences[${index}].${field} is required`);
    });
  });

  return { valid: errors.length === 0, errors };
}

export function openLinkedinImportModal({ onSaved, defaultProfileUrl = "" }) {
  const root = document.getElementById("linkedin-modal-root");
  if (!root) return;

  root.innerHTML = `
    <div class="modal-backdrop" role="dialog" aria-modal="true" aria-label="Import LinkedIn Data">
      <section class="modal panel glass">
        <h2>Import LinkedIn Data</h2>
        <p>Paste LinkedIn JSON (or upload file), then edit jobs inline in Experience. Direct LinkedIn API sync needs a backend OAuth flow.</p>
        <label for="linkedin-profile-url">LinkedIn Profile URL / ID Link</label>
        <input id="linkedin-profile-url" type="url" placeholder="https://www.linkedin.com/in/your-id" value="${defaultProfileUrl}" />
        <div class="actions-row">
          <button class="btn" id="sample-fill-btn">Load sample</button>
        </div>
        <label for="linkedin-json">Paste JSON</label>
        <textarea id="linkedin-json" rows="12" placeholder='{"experiences": [...]}'></textarea>
        <label for="linkedin-file">Upload JSON file</label>
        <input id="linkedin-file" type="file" accept="application/json,.json" />
        <p id="linkedin-validation" aria-live="polite"></p>
        <div class="actions-row">
          <button class="btn" id="linkedin-cancel">Cancel</button>
          <button class="btn primary" id="linkedin-save">Validate & Save</button>
        </div>
      </section>
    </div>
  `;

  const close = () => {
    root.innerHTML = "";
  };

  const textArea = root.querySelector("#linkedin-json");
  const fileInput = root.querySelector("#linkedin-file");
  const message = root.querySelector("#linkedin-validation");
  const profileInput = root.querySelector("#linkedin-profile-url");

  root.querySelector("#sample-fill-btn")?.addEventListener("click", async () => {
    try {
      const sampleRes = await fetch("./data/linkedin.sample.json");
      if (!sampleRes.ok) throw new Error("Sample not found");
      textArea.value = JSON.stringify(await sampleRes.json(), null, 2);
    } catch {
      textArea.value = JSON.stringify(
        {
          profileUrl: "https://www.linkedin.com/in/imsuryasen",
          experiences: [
            {
              company: "Example Corp",
              role: "Frontend Developer",
              location: "Remote",
              start: "2024-01",
              end: "Present",
              description: "Built performant interfaces using modern web standards."
            }
          ]
        },
        null,
        2
      );
    }
  });

  fileInput?.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      textArea.value = String(reader.result || "");
    };
    reader.readAsText(file);
  });

  root.querySelector("#linkedin-cancel")?.addEventListener("click", close);

  root.querySelector("#linkedin-save")?.addEventListener("click", async () => {
    try {
      const parsed = JSON.parse(textArea.value || "{}");
      if (!parsed.profileUrl && profileInput?.value) {
        parsed.profileUrl = profileInput.value;
      }
      const result = await validateLinkedinPayload(parsed);
      if (!result.valid) {
        message.textContent = result.errors.join(" | ");
        return;
      }

      await saveLinkedinPayload(normalizePayload(parsed));
      message.textContent = "Saved successfully to IndexedDB.";
      if (typeof onSaved === "function") onSaved();
      setTimeout(close, 250);
    } catch (error) {
      message.textContent = `Invalid JSON: ${error.message}`;
    }
  });

  root.querySelector(".modal-backdrop")?.addEventListener("click", (event) => {
    if (event.target.classList.contains("modal-backdrop")) close();
  });
}
