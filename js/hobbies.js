import { idbGet, idbSet } from "./storage.js";

function slugify(value) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function seedFromName(name) {
  return name.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
}

function defaultImages(name) {
  const seed = seedFromName(name);
  return [1, 2, 3].map((offset, i) => ({
    id: `${seed}-${offset}`,
    src: `https://picsum.photos/seed/${encodeURIComponent(name)}-${offset}/900/650`,
    caption: `Moments of ${name} ${i + 1}`
  }));
}

export async function ensureHobbies(configHobbies) {
  const prepared = [];

  for (const hobby of configHobbies) {
    const slug = slugify(hobby.name);
    const existing = await idbGet("hobbies", slug);
    if (existing) {
      prepared.push(existing);
      continue;
    }

    const fresh = {
      slug,
      name: hobby.name,
      description: hobby.description || "",
      gallery: defaultImages(hobby.name)
    };

    await idbSet("hobbies", fresh);
    prepared.push(fresh);
  }

  return prepared;
}

export async function getHobby(slug) {
  return idbGet("hobbies", slug);
}

export async function updateHobbyCaption(slug, imageId, caption) {
  const hobby = await getHobby(slug);
  if (!hobby) return null;
  hobby.gallery = hobby.gallery.map((img) => (img.id === imageId ? { ...img, caption } : img));
  await idbSet("hobbies", hobby);
  return hobby;
}

export async function addHobbyImage(slug, file) {
  const hobby = await getHobby(slug);
  if (!hobby) return null;

  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Unable to read image file"));
    reader.readAsDataURL(file);
  });

  hobby.gallery.unshift({
    id: `${Date.now()}-${Math.round(Math.random() * 10000)}`,
    src: dataUrl,
    caption: "New image"
  });

  await idbSet("hobbies", hobby);
  return hobby;
}

export function hobbySlug(name) {
  return slugify(name);
}
