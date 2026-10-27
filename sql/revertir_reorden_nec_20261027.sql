-- REVERTIR el reordenamiento de cobros de NEC del 27/10/2026 (vuelve las fechas a como estaban antes).
-- Correr en el proyecto wfiunzglndquuygenepp. Después hay que restaurar también las fechas del código de la obra 678 (ver nota al final).
UPDATE public.movimientos SET fecha_pago='2026-11-02', fecha_pago_original=NULL, estado_proyeccion='normal' WHERE id='a69cf9cc-acf9-4083-aec6-881301aa8e99'; -- Fac A 0002-00010140
UPDATE public.movimientos SET fecha_pago='2026-12-07', fecha_pago_original=NULL, estado_proyeccion='normal' WHERE id='7072fe8c-eb07-4f26-8511-d14691f68aad'; -- A 0002-00010171
UPDATE public.movimientos SET fecha_pago='2026-11-02', fecha_pago_original=NULL, estado_proyeccion='normal' WHERE id='07a9033a-5b65-4cd9-976f-b807e30822e5'; -- Fac A 0002-00010141
UPDATE public.movimientos SET fecha_pago='2026-11-02', fecha_pago_original=NULL, estado_proyeccion='normal' WHERE id='22bebee7-ab78-4365-8af1-2fd52ec72077'; -- Fac A 0002-00010138
UPDATE public.movimientos SET fecha_pago='2026-11-02', fecha_pago_original=NULL, estado_proyeccion='normal' WHERE id='ca541e93-a555-434c-a766-38bdeae005d9'; -- Fac A 0002-00010137
UPDATE public.movimientos SET fecha_pago='2026-11-30', fecha_pago_original=NULL, estado_proyeccion='normal' WHERE id='2ba7306f-17be-4bbe-be74-5ec0cdd3f8ef'; -- Fac A 0002-00010144
UPDATE public.movimientos SET fecha_pago='2026-11-17', fecha_pago_original='2026-10-05', estado_proyeccion='reprogramado' WHERE id='cba957cf-eec7-40cd-ae3c-e64b5f4a34cf'; -- Fac A 0002-00010131
UPDATE public.movimientos SET fecha_pago='2026-11-09', fecha_pago_original=NULL, estado_proyeccion='normal' WHERE id='de46b76c-92a9-4c17-b64d-4c1040158507'; -- Fac A 0002-00010150
UPDATE public.movimientos SET fecha_pago='2026-11-02', fecha_pago_original=NULL, estado_proyeccion='normal' WHERE id='836b828e-dee5-435c-99ff-8963f2924cff'; -- Fac A 0002-00010149
UPDATE public.movimientos SET fecha_pago='2026-11-16', fecha_pago_original=NULL, estado_proyeccion='normal' WHERE id='07d5022d-e2a4-49e7-b5f8-5edc7ef2f24f'; -- Fac A 0002-00010151
UPDATE public.movimientos SET fecha_pago='2026-11-16', fecha_pago_original=NULL, estado_proyeccion='normal' WHERE id='ba5ce388-affa-40a3-b662-ed76d9c0666c'; -- Fac A 0002-00010151
UPDATE public.movimientos SET fecha_pago='2026-11-16', fecha_pago_original=NULL, estado_proyeccion='normal' WHERE id='9302107d-6c57-4146-ac56-9220852fa7f1'; -- Fac A 0002-00010152
UPDATE public.movimientos SET fecha_pago='2026-11-16', fecha_pago_original=NULL, estado_proyeccion='normal' WHERE id='a0c5a607-20d2-42ae-bd76-ad93ffc39bdd'; -- Fac A 0002-00010152
UPDATE public.movimientos SET fecha_pago='2026-11-30', fecha_pago_original=NULL, estado_proyeccion='normal' WHERE id='0c368944-3fb1-41ee-8ca3-cdb00e59d550'; -- fc 10156 fc 10157
UPDATE public.movimientos SET fecha_pago='2026-11-30', fecha_pago_original=NULL, estado_proyeccion='normal' WHERE id='a7066554-c217-439d-b843-3e339f5d4016'; -- Fac A 0002-00010148
UPDATE public.movimientos SET fecha_pago='2026-11-30', fecha_pago_original=NULL, estado_proyeccion='normal' WHERE id='bf3d4008-0cd5-4f5a-96f2-a85d0e3ff3ac'; -- Fac A 0002-00010154
UPDATE public.movimientos SET fecha_pago='2026-12-01', fecha_pago_original=NULL, estado_proyeccion='normal' WHERE id='e0ca3dcf-62ec-46be-9773-06c29ff7cfcf'; -- A 0002-00010177
UPDATE public.movimientos SET fecha_pago='2026-11-27', fecha_pago_original=NULL, estado_proyeccion='normal' WHERE id='3e506679-6b62-430f-817d-1585c9fbca37'; -- A 0002-00010182
UPDATE public.movimientos SET fecha_pago='2026-11-27', fecha_pago_original=NULL, estado_proyeccion='normal' WHERE id='f05428ad-3580-4302-8cb0-6975444130de'; -- A 0002-00010183
UPDATE public.movimientos SET fecha_pago='2026-12-01', fecha_pago_original=NULL, estado_proyeccion='normal' WHERE id='0bdbf98c-fa93-4369-8fc3-91179b9dbfb7'; -- A 0002-00010174
UPDATE public.movimientos SET fecha_pago='2026-12-01', fecha_pago_original=NULL, estado_proyeccion='normal' WHERE id='41519d0f-f411-47eb-a87b-bd5221be2091'; -- A 0002-00010174
UPDATE public.movimientos SET fecha_pago='2026-12-01', fecha_pago_original=NULL, estado_proyeccion='normal' WHERE id='20f93a5b-753c-44bb-8213-d757208c04e8'; -- A 0002-00010175
UPDATE public.movimientos SET fecha_pago='2026-12-01', fecha_pago_original=NULL, estado_proyeccion='normal' WHERE id='54f1ef5b-a83a-4cab-a921-dd61b0394c66'; -- A 0002-00010176
UPDATE public.movimientos SET fecha_pago='2026-12-01', fecha_pago_original=NULL, estado_proyeccion='normal' WHERE id='6c3f6fff-81d7-4248-89e2-313eef76767f'; -- A 0002-00010176
UPDATE public.movimientos SET fecha_pago='2026-12-01', fecha_pago_original=NULL, estado_proyeccion='normal' WHERE id='d841f4fa-df9f-4bcf-8b2e-3025b6ecfdf8'; -- A 0002-00010181
UPDATE public.movimientos SET fecha_pago='2026-12-07', fecha_pago_original=NULL, estado_proyeccion='normal' WHERE id='1041cbac-ddd3-4240-9448-9ef58230d77b'; -- A 0002-00010172
UPDATE public.movimientos SET fecha_pago='2026-12-07', fecha_pago_original=NULL, estado_proyeccion='normal' WHERE id='52934069-a7a5-4966-89f9-94a2b5d1dc57'; -- A EMITIR
UPDATE public.movimientos SET fecha_pago='2026-12-07', fecha_pago_original=NULL, estado_proyeccion='normal' WHERE id='b008f79f-2212-4150-b8d4-42f98fd7b9ca'; -- A EMITIR
UPDATE public.movimientos SET fecha_pago='2026-12-23', fecha_pago_original=NULL, estado_proyeccion='normal' WHERE id='4988f08c-95da-49b2-867c-9352da697e80'; -- N° A 0002-00010180
UPDATE public.movimientos SET fecha_pago='2026-12-15', fecha_pago_original=NULL, estado_proyeccion='normal' WHERE id='5f0d59fd-36a8-43f8-b9b0-7fbfc99f9aee'; -- A 0002-00010170
UPDATE public.venta_proyectada_fecha_estimada SET fecha_estimada='2026-12-30' WHERE obra_id='73d04582-7e33-4f88-ad55-d4e588bf2bca' AND periodo='2026-10-01'; -- obra 658 2026-10
UPDATE public.venta_proyectada_fecha_estimada SET fecha_estimada='2027-01-04' WHERE obra_id='3c41f26d-faaf-4a06-a3b9-9a21ff544159' AND periodo='2026-10-01'; -- obra 659 2026-10
UPDATE public.venta_proyectada_fecha_estimada SET fecha_estimada='2027-01-06' WHERE obra_id='663fd050-547e-4b6d-bd8c-d147f73fc21c' AND periodo='2026-10-01'; -- obra 661 2026-10
UPDATE public.venta_proyectada_fecha_estimada SET fecha_estimada='2027-01-06' WHERE obra_id='5ce93992-3111-47fc-a4cc-fdd00c9c28cc' AND periodo='2026-10-01'; -- obra 680 2026-10
UPDATE public.venta_proyectada_fecha_estimada SET fecha_estimada='2027-01-08' WHERE obra_id='6a98b467-9eb1-4a4f-a592-cf11de89f27a' AND periodo='2026-10-01'; -- obra 677 2026-10
UPDATE public.venta_proyectada_fecha_estimada SET fecha_estimada='2027-02-01' WHERE obra_id='73d04582-7e33-4f88-ad55-d4e588bf2bca' AND periodo='2026-11-01'; -- obra 658 2026-11
UPDATE public.venta_proyectada_fecha_estimada SET fecha_estimada='2027-02-02' WHERE obra_id='3c41f26d-faaf-4a06-a3b9-9a21ff544159' AND periodo='2026-11-01'; -- obra 659 2026-11
UPDATE public.venta_proyectada_fecha_estimada SET fecha_estimada='2027-02-03' WHERE obra_id='5ce93992-3111-47fc-a4cc-fdd00c9c28cc' AND periodo='2026-11-01'; -- obra 680 2026-11
UPDATE public.venta_proyectada_fecha_estimada SET fecha_estimada='2027-02-04' WHERE obra_id='663fd050-547e-4b6d-bd8c-d147f73fc21c' AND periodo='2026-11-01'; -- obra 661 2026-11
UPDATE public.venta_proyectada_fecha_estimada SET fecha_estimada='2027-02-05' WHERE obra_id='6a98b467-9eb1-4a4f-a592-cf11de89f27a' AND periodo='2026-11-01'; -- obra 677 2026-11
UPDATE public.venta_proyectada_fecha_estimada SET fecha_estimada='2027-03-02' WHERE obra_id='3c41f26d-faaf-4a06-a3b9-9a21ff544159' AND periodo='2026-12-01'; -- obra 659 2026-12
UPDATE public.venta_proyectada_fecha_estimada SET fecha_estimada='2027-03-03' WHERE obra_id='73d04582-7e33-4f88-ad55-d4e588bf2bca' AND periodo='2026-12-01'; -- obra 658 2026-12
UPDATE public.venta_proyectada_fecha_estimada SET fecha_estimada='2027-03-05' WHERE obra_id='6a98b467-9eb1-4a4f-a592-cf11de89f27a' AND periodo='2026-12-01'; -- obra 677 2026-12
UPDATE public.venta_proyectada_fecha_estimada SET fecha_estimada='2027-04-05' WHERE obra_id='6a98b467-9eb1-4a4f-a592-cf11de89f27a' AND periodo='2027-01-01'; -- obra 677 2027-01
UPDATE public.venta_proyectada_fecha_estimada SET fecha_estimada='2027-04-05' WHERE obra_id='73d04582-7e33-4f88-ad55-d4e588bf2bca' AND periodo='2027-01-01'; -- obra 658 2027-01
UPDATE public.venta_proyectada_fecha_estimada SET fecha_estimada='2026-11-10' WHERE obra_id='70be9f6d-fc01-423a-a978-24ec9f8cbe27' AND periodo='2026-10-01'; -- obra 678 oct (tercera parte)
-- NOTA: en src/lib/proyeccionPresupuesto.js, DIVIDIR_VENTA_EN_FECHAS de la 678 octubre tenía ['2026-11-24', '2026-12-22', null].
