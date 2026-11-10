/**
 * Configuración de Remotion (Studio y CLI). Los vídeos reutilizan los componentes reales de la oficina
 * (../src) con datos de ejemplo: ver webpack-override.ts. Las fotos de la escena se copian de
 * ../public/scenes a public/scenes con scripts/preparar.mjs.
 */
import { Config } from "@remotion/cli/config";
import { ajustarWebpack } from "./webpack-override";

Config.setVideoImageFormat("jpeg");
Config.setJpegQuality(92);
Config.setConcurrency("50%");
Config.overrideWebpackConfig(ajustarWebpack);
