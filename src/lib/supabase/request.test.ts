/** Localización del token de acceso en la petición (sin red). Ejecutar: npm test */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { tokenDeAcceso, verificarToken } from "./request.ts";

const cabeceras = (h: Record<string, string>) => ({ get: (k: string) => h[k.toLowerCase()] ?? null });
const cookieDeSesion = (sesion: object) => `base64-${Buffer.from(JSON.stringify(sesion)).toString("base64url")}`;

describe("tokenDeAcceso", () => {
  it("usa el Bearer y no mira las cookies si hay cabecera Authorization", () => {
    assert.equal(tokenDeAcceso(cabeceras({ authorization: "Bearer abc.def.ghi", cookie: `sb-x-auth-token=${cookieDeSesion({ access_token: "otro" })}` })), "abc.def.ghi");
    assert.equal(tokenDeAcceso(cabeceras({ authorization: "Basic xxx", cookie: `sb-x-auth-token=${cookieDeSesion({ access_token: "otro" })}` })), null);
  });

  it("lee el token de la cookie de sesión, también si viene troceada", () => {
    const valor = cookieDeSesion({ access_token: "tok.de.cookie", refresh_token: "r" });
    assert.equal(tokenDeAcceso(cabeceras({ cookie: `otra=1; sb-x-auth-token=${valor}` })), "tok.de.cookie");
    const mitad = Math.floor(valor.length / 2);
    assert.equal(tokenDeAcceso(cabeceras({ cookie: `sb-x-auth-token.1=${valor.slice(mitad)}; sb-x-auth-token.0=${valor.slice(0, mitad)}` })), "tok.de.cookie");
  });

  it("sin sesión o con una cookie ilegible devuelve null", () => {
    assert.equal(tokenDeAcceso(cabeceras({})), null);
    assert.equal(tokenDeAcceso(cabeceras({ cookie: "sb-x-auth-token=base64-%%%" })), null);
    assert.equal(tokenDeAcceso(cabeceras({ cookie: `sb-x-auth-token=${cookieDeSesion({ refresh_token: "r" })}` })), null);
  });
});

describe("verificarToken", () => {
  it("sin token no hay persona (no llama a nadie)", async () => {
    assert.equal(await verificarToken(null), null);
    assert.equal(await verificarToken(""), null);
  });
});
