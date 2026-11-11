-- La marca pasa de SAMGPLE a MyOfia.
--
-- Varias funciones SQL (créditos regalados, pausa, suspensión, reactivación…) escriben «SAMGPLE» en el
-- título o el cuerpo de los avisos que reciben las empresas. En vez de reescribir cada función, un
-- disparador sustituye el nombre al guardar el aviso. Los identificadores internos (admin_samgple, etc.)
-- no cambian: no los ve nadie de fuera.

create or replace function public.notifications_marca()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.titulo := replace(new.titulo, 'SAMGPLE', 'MyOfia');
  new.cuerpo := replace(new.cuerpo, 'SAMGPLE', 'MyOfia');
  return new;
end;
$$;

drop trigger if exists notifications_marca on public.notifications;
create trigger notifications_marca
  before insert or update of titulo, cuerpo on public.notifications
  for each row execute function public.notifications_marca();

-- Los avisos que ya existían.
update public.notifications
set titulo = replace(titulo, 'SAMGPLE', 'MyOfia'), cuerpo = replace(cuerpo, 'SAMGPLE', 'MyOfia')
where titulo like '%SAMGPLE%' or cuerpo like '%SAMGPLE%';
