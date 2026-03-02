import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";
import pngToIco from "png-to-ico";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const sourceSvg = path.join(rootDir, "assets", "icons", "app-icon.svg");
const publicDir = path.join(rootDir, "public");
const outPng = path.join(publicDir, "favicon.png");
const outIco = path.join(publicDir, "favicon.ico");

async function main() {
  await mkdir(publicDir, { recursive: true });
  const svg = await readFile(sourceSvg, "utf8");

  const render = new Resvg(svg, {
    fitTo: {
      mode: "width",
      value: 256,
    },
  }).render();
  const pngBuffer = render.asPng();
  await writeFile(outPng, pngBuffer);

  const icoBuffer = await pngToIco(outPng);
  await writeFile(outIco, icoBuffer);

  process.stdout.write(`Generated ${path.relative(rootDir, outPng)} and ${path.relative(rootDir, outIco)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
