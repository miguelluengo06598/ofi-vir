/**
 * npm run videos [-- id1 id2 …] [--maxima-calidad]
 *
 * Para cada vídeo del catálogo (o solo los indicados):
 *  1. Remotion renderiza un máster H.264 de alta calidad (videos/salida/, fuera de git).
 *  2. ffmpeg lo codifica en MP4 (H.264, -preset veryfast; slow con --maxima-calidad) y WebM (VP9), sin sonido.
 *  3. Se saca el póster del fotograma más representativo en AVIF y WebP (sharp).
 * Todo va a public/videos/ (en .gitignore). Al final avisa de los que pasen del objetivo de peso.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";
import { renderMedia, renderStill, selectComposition } from "@remotion/renderer";
import sharp from "sharp";
import { CATALOGO, FPS } from "../src/catalogo.ts";
import { ajustarWebpack } from "../webpack-override.ts";

const raiz = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const salida = path.join(raiz, "salida");
const destino = path.join(raiz, "..", "public", "videos");

const args = process.argv.slice(2);
const maxima = args.includes("--maxima-calidad");
const pedidos = args.filter((a) => !a.startsWith("--"));

/** Objetivo: menos de 3 MB por vídeo horizontal de 15 s (proporcional a la duración). */
const OBJETIVO_MB_POR_15S = 3;

const videos = CATALOGO.filter((v) => !v.pendiente && (pedidos.length === 0 || pedidos.includes(v.id)));
if (videos.length === 0) {
  console.error(`No hay vídeos que renderizar. Disponibles: ${CATALOGO.filter((v) => !v.pendiente).map((v) => v.id).join(", ")}`);
  process.exit(1);
}

mkdirSync(salida, { recursive: true });
mkdirSync(destino, { recursive: true });
execFileSync("node", [path.join(raiz, "scripts", "preparar.mjs")], { stdio: "inherit" });

console.log("Empaquetando el proyecto…");
const serveUrl = await bundle({ entryPoint: path.join(raiz, "src", "index.ts"), webpackOverride: ajustarWebpack });

const mb = (archivo: string) => statSync(archivo).size / 1024 / 1024;
const ffmpeg = (...a: string[]) => execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...a], { stdio: "inherit" });
const avisos: string[] = [];
const filas: string[] = [];

for (const v of videos) {
  const t0 = Date.now();
  console.log(`\n▶ ${v.id} (${v.segundos} s, ${v.formato})`);
  const composicion = await selectComposition({ serveUrl, id: v.id });
  const master = path.join(salida, `${v.id}-master.mp4`);
  const fotograma = path.join(salida, `${v.id}-poster.png`);

  await renderMedia({
    serveUrl, composition: composicion, codec: "h264", outputLocation: master, muted: true,
    crf: 12, x264Preset: "veryfast", imageFormat: "jpeg", jpegQuality: 95,
    onProgress: ({ progress }) => process.stdout.write(`\r  Fotogramas ${Math.round(progress * 100)} %   `),
  });
  process.stdout.write("\n");
  await renderStill({ serveUrl, composition: composicion, frame: Math.round(v.poster * FPS), output: fotograma, imageFormat: "png" });

  // Topes de bitrate: con CRF manda la calidad, y maxrate impide picos que disparen el peso.
  const mp4 = path.join(destino, `${v.id}.mp4`);
  const webm = path.join(destino, `${v.id}.webm`);
  ffmpeg("-i", master, "-an", "-c:v", "libx264", "-preset", maxima ? "slow" : "veryfast", "-crf", maxima ? "21" : "24",
    "-maxrate", "1.5M", "-bufsize", "3M", "-pix_fmt", "yuv420p", "-profile:v", "high", "-movflags", "+faststart", mp4);
  ffmpeg("-i", master, "-an", "-c:v", "libvpx-vp9", "-crf", maxima ? "31" : "34", "-b:v", "1.3M", "-row-mt", "1",
    "-deadline", "good", "-cpu-used", maxima ? "1" : "4", "-pix_fmt", "yuv420p", webm);

  const avif = path.join(destino, `${v.id}.avif`);
  const webp = path.join(destino, `${v.id}.webp`);
  await sharp(fotograma).avif({ quality: 52, effort: 6 }).toFile(avif);
  await sharp(fotograma).webp({ quality: 74 }).toFile(webp);
  rmSync(fotograma);

  const limite = (OBJETIVO_MB_POR_15S * v.segundos) / 15;
  const pesoMp4 = mb(mp4);
  const pesoWebm = mb(webm);
  filas.push(
    `${v.id.padEnd(36)} MP4 ${pesoMp4.toFixed(2)} MB · WebM ${pesoWebm.toFixed(2)} MB · póster AVIF ${(mb(avif) * 1024).toFixed(0)} KB / WebP ${(mb(webp) * 1024).toFixed(0)} KB · ${((Date.now() - t0) / 1000).toFixed(0)} s`,
  );
  if (v.formato === "horizontal" && Math.max(pesoMp4, pesoWebm) > limite) {
    avisos.push(`${v.id}: ${Math.max(pesoMp4, pesoWebm).toFixed(2)} MB supera el objetivo de ${limite.toFixed(1)} MB.`);
  }
}

console.log("\nResultado (public/videos/):");
filas.forEach((f) => console.log("  " + f));
if (avisos.length) {
  console.log("\n⚠️  Por encima del objetivo de peso:");
  avisos.forEach((a) => console.log("  " + a));
  console.log("  Opciones: bajar -maxrate (p. ej. 1.2M), quitar movimiento de cámara en ese vídeo, o reducir el desenfoque animado.");
} else {
  console.log("\nTodos los vídeos horizontales están dentro del objetivo de peso.");
}
