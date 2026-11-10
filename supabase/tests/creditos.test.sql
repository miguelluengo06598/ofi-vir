-- Tests del sistema de créditos: el saldo nunca es negativo, el libro es de solo inserción,
-- se gasta primero lo que caduca antes, las operaciones son idempotentes y cada empresa solo ve lo suyo.
-- Se deshace al terminar. Ejecutar: npm run test:db

begin;
create extension if not exists pgtap with schema extensions;
select plan(35);

create temp table ids as select
  'a64499d1-7f43-4a43-abc8-41a313dc4018'::uuid as company_a,   -- Hogar Mediterráneo (seed, usuario Marcos)
  '0c33590a-4c2a-4b32-a388-2008558688f7'::uuid as marcos,
  'b0000000-0000-4000-8000-0000000000c1'::uuid as b;           -- empresa de prueba, sin movimientos previos
insert into public.companies (id, name) values ((select b from ids), 'Taller Delta (créditos)');
grant select on ids to authenticated, service_role;

select is((select count(*)::int from public.credit_packs), 5, 'el catálogo tiene los 5 packs');
select is((select creditos_bono_mensual from public.credit_packs where id = 'pro'), 17600, 'Pro: bono mensual 17.600');
select is((select saldo_disponible from public.company_credit_balance where company_id = (select b from ids)), 0, 'empresa nueva: saldo 0');

-- Lotes: uno que caduca pronto (regalo) y otro después (pack Inicio).
select public.anadir_lote((select b from ids), 'regalo', null, 100, 5, null, 'k:regalo');
select public.anadir_lote((select b from ids), 'pack', 'inicio', null, null, 'pi_test_1', 'k:inicio');
select is((select saldo_disponible from public.company_credit_balance where company_id = (select b from ids)), 5100, 'saldo = 100 + 5.000');
select is((public.anadir_lote((select b from ids), 'pack', 'inicio', null, null, 'pi_test_1', 'k:inicio') ->> 'duplicado')::boolean, true, 'misma clave al añadir lote: no duplica');
select is((select count(*)::int from public.credit_lots where company_id = (select b from ids)), 2, '...y sigue habiendo 2 lotes');

-- Prueba: solo una vez.
select public.anadir_lote((select b from ids), 'prueba', 'prueba');
select throws_ok(format($q$select public.anadir_lote(%L, 'prueba', 'prueba')$q$, (select b from ids)), 'CR006', null, 'el pack Prueba solo se puede usar una vez');
select is((select saldo_disponible from public.company_credit_balance where company_id = (select b from ids)), 7100, 'saldo = 5.100 + 2.000 de la prueba');

-- FIFO por caducidad: 150 créditos vacían el lote de 100 (caduca en 5 días) y toman 50 de la prueba (30 días).
select public.consumir_creditos((select b from ids), 150, 'tarea_experta', gen_random_uuid(), null, null, 'k:c1');
select is((select creditos_restantes from public.credit_lots where company_id = (select b from ids) and origen = 'regalo'), 0, 'FIFO: el lote que caduca antes se vacía primero');
select is((select creditos_restantes from public.credit_lots where company_id = (select b from ids) and origen = 'prueba'), 1950, 'FIFO: el resto sale del siguiente lote');
select is((select count(*)::int from public.credit_ledger where operacion_id = (select operacion_id from public.credit_ledger where clave_idempotencia = 'k:c1' and company_id = (select b from ids))), 2, 'una línea de libro por lote tocado');

-- Idempotencia.
select is((public.consumir_creditos((select b from ids), 150, 'tarea_experta', null, null, null, 'k:c1') ->> 'duplicado')::boolean, true, 'misma clave al consumir: devuelve el resultado anterior');
select is((select saldo_disponible from public.company_credit_balance where company_id = (select b from ids)), 6950, '...sin descontar otra vez');

-- El saldo nunca queda negativo: pedir de más falla y no descuenta nada.
select throws_ok(format($q$select public.consumir_creditos(%L, 6951, 'tarea_simple')$q$, (select b from ids)), 'CR001', null, 'consumir más que el saldo falla (SALDO_INSUFICIENTE)');
select is((select saldo_disponible from public.company_credit_balance where company_id = (select b from ids)), 6950, '...y el saldo queda intacto');
select throws_ok(format($q$select public.consumir_creditos(%L, 0, 'tarea_simple')$q$, (select b from ids)), '22023', null, 'consumir 0 es inválido');
select throws_ok(format($q$select public.consumir_creditos(%L, -5, 'tarea_simple')$q$, (select b from ids)), '22023', null, 'consumir un número negativo es inválido');
-- Vaciar exactamente el saldo es válido y deja 0.
select public.consumir_creditos((select b from ids), 6950, 'tarea_experta');
select is((select saldo_disponible from public.company_credit_balance where company_id = (select b from ids)), 0, 'consumir exactamente todo deja 0, no negativo');
select throws_ok(format($q$select public.consumir_creditos(%L, 1, 'traspaso')$q$, (select b from ids)), 'CR001', null, 'con saldo 0 no se puede consumir ni 1');

-- Última defensa: los lotes no admiten restantes negativos ni mayores que lo comprado.
select throws_ok(format($q$update public.credit_lots set creditos_restantes = -1 where company_id = %L and origen = 'prueba'$q$, (select b from ids)), '23514', null, 'check: restantes no puede ser negativo');
select throws_ok(format($q$update public.credit_lots set creditos_restantes = 999999 where company_id = %L and origen = 'prueba'$q$, (select b from ids)), '23514', null, 'check: restantes no puede superar los iniciales');

-- Reservas.
select public.anadir_lote((select b from ids), 'pack', 'inicio', null, null, 'pi_test_2', 'k:inicio2');
create temp table res as select public.reservar_creditos((select b from ids), gen_random_uuid(), 1000) as r;
select is((select saldo_disponible from public.company_credit_balance where company_id = (select b from ids)), 4000, 'reservar 1.000 baja el saldo disponible a 4.000');
select throws_ok(format($q$select public.consumir_creditos(%L, 4001, 'tarea_simple')$q$, (select b from ids)), 'CR001', null, 'lo reservado no se puede gastar en otra cosa');
select public.confirmar_reserva((select b from ids), ((select r from res) ->> 'reserva_id')::uuid, 300, 'tarea_estandar');
select is((select saldo_disponible from public.company_credit_balance where company_id = (select b from ids)), 4700, 'confirmar con 300 gastados: se libera el resto (saldo 4.700)');
select throws_ok(format($q$select public.confirmar_reserva(%L, %L, 1, 'tarea_simple')$q$, (select b from ids), (select (r ->> 'reserva_id') from res)), 'CR003', null, 'una reserva confirmada no se puede confirmar otra vez');

-- Invariante contable: suma del libro = créditos en lotes − reservas activas.
select is(
  (select sum(creditos)::int from public.credit_ledger where company_id = (select b from ids)),
  (select creditos_en_lotes - creditos_reservados from public.company_credit_balance where company_id = (select b from ids)),
  'invariante: suma del libro = lotes − reservas activas');

-- Caducidad.
insert into public.credit_lots (company_id, origen, creditos_iniciales, creditos_restantes, caduca_en)
values ((select b from ids), 'regalo', 50, 50, now() - interval '1 day');
select is((select saldo_disponible from public.company_credit_balance where company_id = (select b from ids)), 4700, 'un lote caducado no cuenta en el saldo');
select public.caducar_lotes();
select is((select count(*)::int from public.credit_ledger where company_id = (select b from ids) and tipo = 'caducidad' and creditos = -50), 1, 'caducar_lotes registra una línea de caducidad');

-- Libro de solo inserción (incluso para el servicio).
select throws_ok(format($q$update public.credit_ledger set creditos = 1 where company_id = %L$q$, (select b from ids)), '42501', null, 'el libro no admite UPDATE');
select throws_ok(format($q$delete from public.credit_ledger where company_id = %L$q$, (select b from ids)), '42501', null, 'el libro no admite DELETE');

-- Permisos: el navegador no puede tocar créditos y solo ve lo suyo.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', (select marcos from ids), 'role', 'authenticated')::text, true);
select throws_ok(format($q$select public.consumir_creditos(%L, 1, 'tarea_simple')$q$, (select company_a from ids)), '42501', null, 'authenticated no puede ejecutar consumir_creditos');
select throws_ok($q$insert into public.credit_lots (company_id, origen, creditos_iniciales, creditos_restantes, caduca_en) values ('a64499d1-7f43-4a43-abc8-41a313dc4018', 'regalo', 9999, 9999, now() + interval '1 year')$q$, '42501', null, 'authenticated no puede crear lotes');
select is((select count(*)::int from public.credit_lots where company_id = (select b from ids)), 0, 'una empresa no ve los lotes de otra');
select is((select count(*)::int from public.credit_ledger where company_id = (select b from ids)), 0, 'una empresa no ve el libro de otra');
select throws_ok($q$select * from public.task_costs$q$, '42501', null, 'authenticated no ve el coste interno (task_costs)');
reset role;

select * from finish();
rollback;
