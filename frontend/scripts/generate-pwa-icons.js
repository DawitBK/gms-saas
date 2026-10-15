// One-off script: generates public/icons/* from public/logo.png.
// Run manually (`node scripts/generate-pwa-icons.js`) whenever the source logo changes.
// Not wired into npm run build/CI.
const path = require("path");
const fs = require("fs");
const sharp = require("sharp");

const publicDir = path.join(__dirname, "..", "public");
const iconsDir = path.join(publicDir, "icons");
const logoPath = path.join(publicDir, "logo.png");
const THEME_BG = "#020617";

async function makeStandard(logo, size, outPath) {
  await sharp(logo)
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(outPath);
}

async function makeMaskable(logo, size, outPath) {
  const innerSize = Math.round(size * 0.8);
  const inner = await sharp(logo)
    .resize(innerSize, innerSize, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: THEME_BG } })
    .composite([{ input: inner, gravity: "center" }])
    .png()
    .toFile(outPath);
}

async function makeAppleTouchIcon(logo, outPath) {
  const size = 180;
  const innerSize = Math.round(size * 0.82);
  const inner = await sharp(logo)
    .resize(innerSize, innerSize, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: THEME_BG } })
    .composite([{ input: inner, gravity: "center" }])
    .flatten({ background: THEME_BG })
    .png()
    .toFile(outPath);
}

async function main() {
  fs.mkdirSync(iconsDir, { recursive: true });
  const logo = fs.readFileSync(logoPath);

  await makeStandard(logo, 192, path.join(iconsDir, "icon-192.png"));
  await makeStandard(logo, 512, path.join(iconsDir, "icon-512.png"));
  await makeMaskable(logo, 192, path.join(iconsDir, "icon-maskable-192.png"));
  await makeMaskable(logo, 512, path.join(iconsDir, "icon-maskable-512.png"));
  await makeAppleTouchIcon(logo, path.join(iconsDir, "apple-touch-icon.png"));
  await makeStandard(logo, 32, path.join(iconsDir, "favicon.png"));

  console.log("Generated PWA icons in", iconsDir);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
