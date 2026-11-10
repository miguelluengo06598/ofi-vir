# Despliegue en Vercel y Supabase

Esta guía prepara un entorno de producción separado del desarrollo. No copies `.env.local`, ni ejecutes el seed o `db reset` contra producción.

## Bloqueadores antes de abrir el producto al público

1. **Inicio de sesión:** las rutas de la API exigen un JWT de Supabase en producción y las variables `DEV_*` quedan anuladas. Aún no existe un cliente de autenticación en el navegador, por lo que un usuario no puede iniciar sesión ni obtener ese token desde la interfaz. Se puede publicar una previsualización técnica privada, pero no un servicio utilizable hasta implementar y probar el flujo de Supabase Auth.
2. **Pagos:** no hay cobro real con Stripe. `PAGOS_SIMULADOS` no se debe definir fuera de local.
3. **Cron:** la configuración incluye nueve trabajos. El plan Hobby admite como máximo dos; se necesita Vercel Pro o equivalente antes de activar esta configuración.
4. **Integraciones:** HubSpot, Google Calendar, Meta Ads y WhatsApp son marcos de conexión; configura y valida cada proveedor antes de habilitar sus herramientas a clientes.

## 1. Crear Supabase de producción

1. Crea un proyecto nuevo de Supabase en la región que corresponda a la residencia de datos contratada (preferiblemente UE si los datos y clientes están en la UE).
2. Guarda en un gestor de secretos la URL del proyecto, su clave anónima/publicable y la `service_role`. Esta última solo vive en Vercel y en una sesión administrativa temporal: jamás en el navegador, Git o un ticket.
3. Instala la CLI de Supabase, inicia sesión y vincula el proyecto:

   ```bash
   supabase login
   supabase link --project-ref <project-ref-produccion>
   supabase db push --dry-run --remote
   supabase db push --remote
   ```

   Revisa el resultado de `--dry-run` antes de aplicar nada. No ejecutes `supabase db reset`, `--include-seed` ni `npm run db:reset` contra producción.
4. Sincroniza exclusivamente las plantillas, sin datos de prueba, desde una sesión controlada que tenga las tres variables de Supabase de producción:

   ```bash
   npm run plantillas:sync -- --simular
   npm run plantillas:sync
   ```

5. Configura en Supabase Auth el `Site URL` definitivo y las `Redirect URLs` de cada dominio de producción y preproducción. No uses comodines amplios. Cuando se implemente el login, habilita solo los métodos de autenticación que se hayan revisado.
6. Crea el primer usuario, empresa y roles mediante un procedimiento administrativo auditado; no reutilices los UUID ni los usuarios de la semilla local.

## 2. Variables de Vercel

Define las variables en el entorno **Production** (y crea valores diferentes para Preview si se habilita). Nunca subas un archivo `.env` a Git ni pegues valores en esta guía.

| Variable | Uso | Obligatoria |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | URL pública del proyecto Supabase | Sí |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clave pública de Supabase | Sí |
| `SUPABASE_SERVICE_ROLE_KEY` | Operaciones servidor; secreto | Sí |
| `APP_URL` | `https://<dominio-definitivo>` sin barra final | Sí |
| `CRON_SECRET` | Secreto aleatorio de al menos 16 caracteres para los Cron | Sí |
| `CONEXIONES_STATE_SECRET` | Secreto aleatorio de al menos 32 caracteres para OAuth | Si se habilita OAuth |
| `ANTHROPIC_API_KEY` | Ejecución de agentes | Si se habilitan agentes |
| `VOYAGE_API_KEY` | Búsqueda semántica de memoria | Si se habilita esa función |
| `RESEND_*` | Envío y webhooks de correo | Si se habilita correo |
| `CONEXION_<ID>_*` | OAuth de HubSpot, Google Calendar o Meta Ads | Por proveedor |

Genera secretos localmente, por ejemplo `openssl rand -hex 32`, y cárgalos con el panel o la CLI de Vercel; no los muestres en una terminal compartida. Tras cambiar variables, redepliega: las instancias ya creadas no las reciben automáticamente.

No definas en Vercel: `DEV_COMPANY_ID`, `DEV_USER_ID`, `DEV_REVISOR_USER_ID`, `DEV_ADMIN_USER_ID`, `CONEXIONES_DEMO`, `EMAIL_DEV_ALLOWLIST` ni `PAGOS_SIMULADOS`.

## 3. Dominio, OAuth y webhooks

1. Añade y verifica el dominio en Vercel; después fija `APP_URL` al dominio canónico HTTPS.
2. Para cada proveedor OAuth registra exactamente el callback `https://<dominio>/api/conexiones/<id>/callback`. Usa secretos y aplicaciones distintos de desarrollo, solicita solo los scopes necesarios y completa la verificación de Meta y Google antes de abrirla a clientes.
3. En Resend verifica el dominio remitente y registra los endpoints HTTPS `/api/webhooks/resend` y, si se usa recepción separada, `/api/webhooks/resend-inbound`. Configura sus secretos de firma correspondientes.
4. Deja deshabilitados los proveedores que no estén configurados y probados. Una conexión no convierte automáticamente una herramienta en permitida: los permisos del agente y las aprobaciones siguen siendo obligatorios.

## 4. Publicar

No hay remoto Git configurado todavía. Crea un repositorio privado en la organización propietaria, añade el remoto y haz un primer push revisado. Después impórtalo en Vercel, selecciona el directorio raíz del repositorio y conecta el proyecto a `main`.

La configuración [`vercel.json`](../vercel.json) registra los nueve Cron protegidos con `CRON_SECRET`. Vercel los invoca con autenticación; no expongas esas rutas mediante servicios externos sin ese secreto.

Antes de promover a producción ejecuta:

```bash
npx tsc --noEmit
npm run test -- --test-concurrency=1
git diff --check
```

Y después del despliegue, con dos empresas y usuarios distintos, repite las pruebas de aislamiento, roles, certificación, límites, secretos, OAuth y webhooks. Conserva los resultados y las trazas de auditoría.

## 5. Operación continua

- Activa copias de seguridad, prueba una restauración y documenta RPO/RTO antes de almacenar datos reales.
- Confirma el cifrado en tránsito y en reposo de Supabase, Vercel y del gestor de secretos; limita el acceso de producción por mínimo privilegio y MFA.
- Configura alertas por errores de Cron, fallos de webhook, costes/créditos, renovación OAuth y errores de proveedor.
- Programa revisiones de las aplicaciones de Meta/Google, dominios, scopes, claves y certificaciones. Rota secretos si se sospecha exposición.
