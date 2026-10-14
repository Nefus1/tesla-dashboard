/** Custom vehicle image: stored as a downscaled data URL in localStorage. */

const KEY = "teslaDashboard.vehicleImage";
const MAX_EDGE = 1600;
const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;
export const DEFAULT_IMAGE = "assets/model-y-juniper-default-cropped.png";

export function loadImage() {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function saveImage(dataUrl) {
  try {
    if (dataUrl) localStorage.setItem(KEY, dataUrl);
    else localStorage.removeItem(KEY);
    return true;
  } catch {
    return false;
  }
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result));
    reader.addEventListener("error", () => reject(new Error("Could not read that image")));
    reader.readAsDataURL(file);
  });
}

function decode(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("That file is not a supported image"));
    img.src = src;
  });
}

/** Validate, downscale and encode an uploaded file. Resolves to a data URL. */
export async function prepareImage(file) {
  if (!file || !/^image\/(png|jpeg|webp|svg\+xml)$/.test(file.type)) throw new Error("Choose a PNG, JPEG, WebP or SVG image");
  if (file.size > MAX_UPLOAD_BYTES) throw new Error("Choose an image under 12 MB");

  const original = await readAsDataUrl(file);
  if (file.type === "image/svg+xml") {
    if (original.length > 1_000_000) throw new Error("SVG is too large");
    return original;
  }

  const img = await decode(original);
  const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
  const webp = canvas.toDataURL("image/webp", 0.88);
  return webp.startsWith("data:image/webp") ? webp : canvas.toDataURL("image/png");
}
