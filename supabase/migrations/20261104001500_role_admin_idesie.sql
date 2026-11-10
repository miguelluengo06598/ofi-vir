-- Rol interno del equipo de IDESIE. Va en su propia migración: un valor nuevo de un enum no se puede usar en la transacción que lo crea.
-- Una persona con este rol NO gana acceso a datos de ninguna empresa cliente (las políticas RLS comprueban 'owner'/'admin'/empresa);
-- solo la reconoce el panel interno /admin (src/lib/admin/acceso.ts), que consulta con la clave de servicio.
alter type public.user_role add value if not exists 'admin_idesie';
