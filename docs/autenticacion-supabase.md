# Configuración de autenticación

La aplicación usa `@supabase/ssr`: las sesiones viajan en cookies `httpOnly` y el callback es `https://<sitio>/auth/callback`.

## Panel de Supabase

En **Authentication → Sign In / Providers → Email** activa Email, desactiva *Confirm email* solo si estás en una prueba aislada (en producción debe estar activado) y deja el registro permitido a nivel de Auth: la restricción de negocio la aplica `REGISTRO_ABIERTO=false` en la aplicación. En **Password security**, configura longitud mínima `10`; en Pro o superior activa **Leaked password protection**. Activa *Secure password change*.

En **Authentication → URL Configuration**:

| Entorno | Site URL | Redirect URLs que hay que añadir |
| --- | --- | --- |
| Local | `http://localhost:3000` | `http://localhost:3000/auth/callback`, `http://127.0.0.1:3000/auth/callback` |
| Vercel Preview | URL concreta de la preview | `https://*-<equipo>.vercel.app/auth/callback` (o cada URL de preview exacta) |
| Producción | `https://oficina.tu-dominio.com` | `https://oficina.tu-dominio.com/auth/callback` |

Define `NEXT_PUBLIC_SITE_URL` con el Site URL de cada entorno. No uses un comodín amplio fuera de previews controladas.

En **Authentication → SMTP** activa *Custom SMTP* con el dominio previamente verificado en Resend:

| Campo | Valor |
| --- | --- |
| Host | `smtp.resend.com` |
| Port | `465` (TLS) o `587` (STARTTLS) |
| Username | `resend` |
| Password | una API key SMTP de Resend |
| Sender email | `acceso@tu-dominio.com` |
| Sender name | `SAMGPLE · Oficina Virtual IA` |

En **Authentication → Rate Limits** deja el límite de login de Supabase activo y fija al menos 3 correos/hora mientras se prueba; súbelo solo tras verificar el dominio, SPF, DKIM y DMARC. La app suma 5 intentos de contraseña/15 min por IP y 3 peticiones de correo/10 min por IP. Desactiva el seguimiento de enlaces en Resend para el flujo de Auth.

Google está preparado como botón desactivado. Cuando se habilite, configura el provider Google en Supabase, sus redirect URI de Supabase y cambia `GOOGLE_OAUTH_ENABLED=true`; no hay que exponer ningún secreto al navegador.

## Plantillas de correo (en español)

En **Authentication → Email Templates**, usa asunto y cuerpo siguientes. Conserva `{{ .ConfirmationURL }}`: contiene el callback autorizado de cada operación.

### Confirm signup

Asunto: `Confirma tu cuenta de SAMGPLE`

```html
<div style="background:#101827;padding:32px;font-family:Arial,sans-serif;color:#fff">
  <div style="max-width:560px;margin:auto;border:1px solid #ffffff33;border-radius:20px;padding:32px;background:#ffffff12">
    <p style="color:#b9c4d6">SAMGPLE · Oficina Virtual IA</p>
    <h1>Confirma tu cuenta</h1><p>Para activar tu acceso, confirma tu correo electrónico.</p>
    <p><a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#fff;color:#101827;padding:12px 20px;border-radius:999px;text-decoration:none;font-weight:bold">Confirmar cuenta</a></p>
    <p style="color:#b9c4d6;font-size:13px">Si no has creado esta cuenta, puedes ignorar este mensaje.</p>
  </div>
</div>
```

### Magic link

Asunto: `Tu enlace para entrar en SAMGPLE`

Usa el mismo cuerpo anterior, cambia el título por `Entra en tu oficina` y el botón por `Entrar ahora`; el enlace sigue siendo `{{ .ConfirmationURL }}`.

### Reset password

Asunto: `Restablece tu contraseña de SAMGPLE`

Usa el mismo cuerpo, con título `Restablece tu contraseña`, texto `Hemos recibido una solicitud para cambiar tu contraseña.` y botón `Crear contraseña nueva` apuntando a `{{ .ConfirmationURL }}`. Añade: `Si no fuiste tú, no hagas nada.`

### Invite user (solo si se usa la invitación nativa de Supabase)

Asunto: `Te han invitado a SAMGPLE`

Usa el mismo cuerpo, con título `Tienes una invitación`, texto `Crea tu cuenta o entra con la existente para acceder a tu oficina.` y botón `Ver invitación` apuntando a `{{ .ConfirmationURL }}`. Las invitaciones de empresa de esta aplicación se envían por la API de Resend y usan su plantilla de cristal propia; no dependen de la invitación nativa de Auth.

## Auditoría de API

El Proxy bloquea sin sesión todas las rutas bajo `/api` y comprueba membresía activa antes de que llegue al handler. Los handlers de empresa, créditos, agentes, conexiones, conocimiento, rutinas, seguimientos, tareas y traspasos vuelven a validar la sesión y empresa mediante `autenticadorSupabase`.

Excepciones intencionadas:

- `/api/webhooks/resend` y `/api/webhooks/resend-inbound`: verifican firma Svix de Resend.
- `/api/cron/[tarea]`: exige `Authorization: Bearer $CRON_SECRET`.
- `/api/demo-oauth/*`: proveedor OAuth simulado para desarrollo externo; no pertenece a la oficina.
- `/api/empresas`, `/api/empresas/activa` y `/api/invitaciones/aceptar`: requieren sesión, pero permiten a una persona sin oficina listar/seleccionar sus empresas o aceptar su primera invitación. La selección y aceptación verifican la pertenencia/token dentro del handler.
- `/api/admin/*`: exige `platform_roles`; los datos de SAMGPLE no conceden pertenencia a empresas.

Rutas privadas cubiertas: `/api/agentes/**`, `/api/conexiones/**`, `/api/conocimiento/**`, `/api/creditos/**`, `/api/empresas/**`, `/api/invitaciones/aceptar`, `/api/oficina/pausa`, `/api/rutinas/**`, `/api/seguimientos/**`, `/api/tareas`, `/api/traspasos` y `/api/admin/**`.
