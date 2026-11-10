import { ImageResponse } from "next/og";

export const alt = "Oficina Virtual IA: tu equipo de IA por departamentos";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Imagen social común de la web pública. No contiene métricas, testimonios ni marcas de clientes. */
export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          alignItems: "center",
          background: "radial-gradient(circle at 75% 28%, #315fa8 0, #101728 28%, #07090f 68%)",
          color: "white",
          display: "flex",
          fontFamily: "sans-serif",
          height: "100%",
          overflow: "hidden",
          padding: "72px",
          position: "relative",
          width: "100%",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", maxWidth: "760px" }}>
          <div style={{ alignItems: "center", display: "flex", fontSize: 28, fontWeight: 600, gap: 16, letterSpacing: 1 }}>
            <span style={{ alignItems: "center", background: "linear-gradient(135deg, #4F8CFF, #8B5CF6)", borderRadius: 999, display: "flex", fontSize: 17, height: 48, justifyContent: "center", width: 48 }}>IA</span>
            Oficina Virtual IA
          </div>
          <div style={{ fontSize: 74, fontWeight: 600, letterSpacing: -3, lineHeight: 1.02, marginTop: 50 }}>Tu equipo de IA, organizado por departamentos.</div>
          <div style={{ color: "#d1d9e8", fontSize: 29, lineHeight: 1.35, marginTop: 28 }}>Tú apruebas lo importante. Los agentes se ocupan del resto.</div>
        </div>
        <div style={{ border: "2px solid rgba(255,255,255,.8)", borderRadius: 999, height: 300, opacity: 0.52, position: "absolute", right: -60, top: 155, transform: "rotate(-20deg)", width: 300 }} />
        <div style={{ background: "rgba(255,255,255,.13)", border: "1px solid rgba(255,255,255,.22)", borderRadius: 32, bottom: 62, display: "flex", height: 90, position: "absolute", right: 100, width: 335 }} />
      </div>
    ),
    size,
  );
}
