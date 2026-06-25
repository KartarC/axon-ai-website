-- ============================================================
-- Billet — Demo Shop seed enrichment (idempotent)
-- Account: 7c8c1b40-bd36-47a8-b392-d73ba409e53f (Demo Shop)
-- User:    113c5705-0a1c-46c9-bd25-4958141f10a5 (demo@axon.ai)
--
-- Adds customers, jobs J-005..J-014, quotes, cost entries, board
-- entries, and traveler steps. Engineered so the budget alerts fire:
--   J-006 = OVER budget (red), J-005 & J-010 = at-risk (amber),
--   J-014 = no quote, J-009/J-011/J-012 = complete (margin history).
-- Safe to re-run: every insert is guarded by NOT EXISTS.
-- ============================================================

-- 1) Customers
INSERT INTO public.customers (account_id, name, contact_name, email)
SELECT '7c8c1b40-bd36-47a8-b392-d73ba409e53f'::uuid, v.name, v.contact, v.email
FROM (VALUES
  ('Meridian Aerospace','Dana Holt','dana@meridian-aero.com'),
  ('Forge Dynamics','Sam Ruiz','sruiz@forgedynamics.com'),
  ('Polaris Medical','Lena Park','lpark@polarismed.com')
) AS v(name,contact,email)
WHERE NOT EXISTS (SELECT 1 FROM public.customers c WHERE c.account_id='7c8c1b40-bd36-47a8-b392-d73ba409e53f' AND c.name=v.name);

-- 2) Jobs J-005..J-014
WITH acct AS (SELECT '7c8c1b40-bd36-47a8-b392-d73ba409e53f'::uuid id, '113c5705-0a1c-46c9-bd25-4958141f10a5'::uuid usr),
d(job_number,part_name,material,revision,quantity,due_date,priority,status,cust_name) AS (VALUES
  ('J-005','Hydraulic Manifold','6061-T6 Aluminum','B',8,DATE '2026-06-27','normal','in_progress','Meridian Aerospace'),
  ('J-006','Landing Gear Bracket','Ti-6Al-4V','C',5,DATE '2026-06-20','high','in_progress','Meridian Aerospace'),
  ('J-007','Valve Body','316 Stainless','A',12,DATE '2026-07-02','normal','in_progress','Acme Corp'),
  ('J-008','Knurled Fitting','C360 Brass','A',50,DATE '2026-07-10','low','open','Forge Dynamics'),
  ('J-009','Wing Rib','7075-T6 Aluminum','D',20,DATE '2026-06-10','normal','complete','Meridian Aerospace'),
  ('J-010','Turbine Spacer','Inconel 718','B',6,DATE '2026-06-25','rush','in_progress','DynaTech'),
  ('J-011','Drive Gear Blank','4140 Steel','A',30,DATE '2026-06-12','normal','complete','Vertex Inc'),
  ('J-012','Motor Mount','6061-T6 Aluminum','C',15,DATE '2026-06-15','normal','complete','Forge Dynamics'),
  ('J-013','Surgical Guide','316L Stainless','A',25,DATE '2026-07-18','high','open','Polaris Medical'),
  ('J-014','Sensor Housing','6061-T6 Aluminum','A',40,DATE '2026-07-22','normal','open','Polaris Medical')
)
INSERT INTO public.jobs (account_id, customer_id, job_number, part_name, material, revision, quantity, due_date, priority, status, public_token, created_by)
SELECT a.id, c.id, d.job_number, d.part_name, d.material, d.revision, d.quantity, d.due_date, d.priority, d.status,
       replace(gen_random_uuid()::text,'-',''), a.usr
FROM d CROSS JOIN acct a
JOIN public.customers c ON c.account_id=a.id AND c.name=d.cust_name
WHERE NOT EXISTS (SELECT 1 FROM public.jobs j WHERE j.account_id=a.id AND j.job_number=d.job_number);

-- 3) Quotes (J-014 intentionally has none)
WITH acct AS (SELECT '7c8c1b40-bd36-47a8-b392-d73ba409e53f'::uuid id),
q(job_number,quoted_price,target_margin) AS (VALUES
  ('J-005',4200,40),('J-006',3800,38),('J-007',6800,42),('J-008',2200,45),
  ('J-009',5400,40),('J-010',5200,40),('J-011',3600,40),('J-012',2400,40),('J-013',4800,42)
)
INSERT INTO public.job_quotes (account_id, job_id, quoted_price, target_margin)
SELECT a.id, j.id, q.quoted_price, q.target_margin
FROM q CROSS JOIN acct a
JOIN public.jobs j ON j.account_id=a.id AND j.job_number=q.job_number
WHERE NOT EXISTS (SELECT 1 FROM public.job_quotes x WHERE x.job_id=j.id);

-- 4) Cost entries
WITH acct AS (SELECT '7c8c1b40-bd36-47a8-b392-d73ba409e53f'::uuid id, '113c5705-0a1c-46c9-bd25-4958141f10a5'::uuid usr),
ce(job_number,type,description,quantity,unit_cost) AS (VALUES
  ('J-005','material','6061-T6 bar stock',8,45),('J-005','labor','Milling — Haas VF-2',18,95),('J-005','labor','Turning — Mazak QT-250',6,85),('J-005','labor','CMM inspection',2,65),
  ('J-006','material','Ti-6Al-4V plate',5,220),('J-006','labor','Milling — Haas VF-2',24,95),('J-006','labor','CMM inspection',4,65),('J-006','outside','Anodize / hardcoat finish',1,320),
  ('J-007','material','316 SS bar',12,55),('J-007','labor','Turning — Mazak QT-250',14,85),('J-007','labor','Milling — Haas VF-2',6,95),('J-007','labor','CMM inspection',2,65),
  ('J-008','material','C360 brass rod',50,6),('J-008','labor','Turning — Mazak QT-250',4,85),
  ('J-009','material','7075-T6 plate',20,38),('J-009','labor','Milling — Haas VF-2',12,95),('J-009','labor','CMM inspection',3,65),
  ('J-010','material','Inconel 718 bar',6,180),('J-010','labor','Turning — Mazak QT-250',16,85),('J-010','labor','CMM inspection',4,65),
  ('J-011','material','4140 steel bar',30,22),('J-011','labor','Turning — Mazak QT-250',10,85),('J-011','labor','Milling — Haas VF-2',4,95),
  ('J-012','material','6061-T6 bar stock',15,16),('J-012','labor','Milling — Haas VF-2',8,95),
  ('J-013','material','316L SS bar',25,9),
  ('J-014','material','6061-T6 bar stock',40,12)
)
INSERT INTO public.job_cost_entries (account_id, job_id, type, description, quantity, unit_cost, source, recorded_by)
SELECT a.id, j.id, ce.type, ce.description, ce.quantity, ce.unit_cost, 'manual', a.usr
FROM ce CROSS JOIN acct a
JOIN public.jobs j ON j.account_id=a.id AND j.job_number=ce.job_number
WHERE NOT EXISTS (SELECT 1 FROM public.job_cost_entries x WHERE x.job_id=j.id AND x.description=ce.description);

-- 5) Board entries (queue / setup / running / complete)
WITH acct AS (SELECT '7c8c1b40-bd36-47a8-b392-d73ba409e53f'::uuid id),
m(mname,mid) AS (VALUES
  ('haas','fc93bbd5-ce57-4b79-9084-fefca416a850'::uuid),
  ('mazak','adaf66e7-3b4e-4dfe-b60a-33610853bd7b'::uuid),
  ('flow','fd150a1e-63f2-42e3-be06-bca828b88255'::uuid)),
be(job_number,machine,operation,op_sequence,status,board_col,est_hours,started_off,completed_off) AS (VALUES
  ('J-005','haas','Op 10 — Mill housing',10,'running','running',18, INTERVAL '6 hours', NULL),
  ('J-006','haas','Op 10 — Mill bracket',10,'running','running',24, INTERVAL '30 hours', NULL),
  ('J-007','mazak','Op 10 — Turn valve body',10,'setup','setup',14, NULL, NULL),
  ('J-008','mazak','Op 10 — Turn fitting',10,'queue','queue',4, NULL, NULL),
  ('J-010','mazak','Op 10 — Turn spacer',10,'running','running',16, INTERVAL '4 hours', NULL),
  ('J-013','flow','Op 10 — Waterjet blanks',10,'queue','queue',3, NULL, NULL),
  ('J-014','haas','Op 10 — Mill housing',10,'queue','queue',9, NULL, NULL),
  ('J-009','haas','Op 10 — Mill wing rib',10,'complete','complete',12, INTERVAL '60 hours', INTERVAL '40 hours'),
  ('J-011','mazak','Op 10 — Turn gear blank',10,'complete','complete',10, INTERVAL '70 hours', INTERVAL '52 hours'),
  ('J-012','haas','Op 10 — Mill motor mount',10,'complete','complete',8, INTERVAL '90 hours', INTERVAL '72 hours')
)
INSERT INTO public.board_entries (account_id, job_id, machine_id, operation, op_sequence, status, board_col, sort_order, est_hours, started_at, completed_at)
SELECT a.id, j.id, m.mid, be.operation, be.op_sequence, be.status, be.board_col, be.op_sequence, be.est_hours,
       CASE WHEN be.started_off IS NULL THEN NULL ELSE now()-be.started_off END,
       CASE WHEN be.completed_off IS NULL THEN NULL ELSE now()-be.completed_off END
FROM be CROSS JOIN acct a
JOIN public.jobs j ON j.account_id=a.id AND j.job_number=be.job_number
JOIN m ON m.mname=be.machine
WHERE NOT EXISTS (SELECT 1 FROM public.board_entries x WHERE x.job_id=j.id AND x.op_sequence=be.op_sequence);

-- 6) Traveler steps for J-005 (progressing) and J-006 (flagged)
WITH acct AS (SELECT '7c8c1b40-bd36-47a8-b392-d73ba409e53f'::uuid id),
ts(job_number,step_number,title,instructions,requires_dimension,dimension_label,dimension_unit,dimension_value,requires_sign_off,status,flag_note,completed_off) AS (VALUES
  ('J-005',1,'Material prep & saw cut','Cut 6061-T6 bar to 4.25 in lengths. Deburr ends.',false,NULL,'in',NULL,false,'complete',NULL,INTERVAL '8 hours'),
  ('J-005',2,'Op 10 — Mill datums & pockets','Haas VF-2, program O1005. Indicate from datum B.',true,'Pocket depth','in','0.502',false,'complete',NULL,INTERVAL '6 hours'),
  ('J-005',3,'Op 20 — Turn bore','Mazak QT-250. Hold bore ID per print.',true,'Bore ID','in',NULL,false,'in_progress',NULL,NULL),
  ('J-005',4,'Deburr & clean','Break all edges 0.005-0.010. Ultrasonic clean.',false,NULL,'in',NULL,false,'pending',NULL,NULL),
  ('J-005',5,'CMM inspection','Full layout per balloon drawing. First article.',false,NULL,'in',NULL,true,'pending',NULL,NULL),
  ('J-006',1,'Material prep','Saw cut Ti-6Al-4V plate. Stress relieve.',false,NULL,'in',NULL,false,'complete',NULL,INTERVAL '34 hours'),
  ('J-006',2,'Op 10 — Mill profile','Haas VF-2. Climb mill profile, 4 passes.',true,'Web thickness','in','0.248',false,'complete',NULL,INTERVAL '30 hours'),
  ('J-006',3,'Op 20 — Drill & ream','Drill and ream 5x bores to print.',true,'Bore ID','in',NULL,false,'flagged','Reamer chatter on 2 of 5 parts — bore oversize 0.0008. Re-running with new reamer; extra setup + tooling cost added.',NULL),
  ('J-006',4,'Anodize (outside service)','Send to Pioneer Finishing. Type III hardcoat.',false,NULL,'in',NULL,false,'pending',NULL,NULL),
  ('J-006',5,'Final CMM','Full inspection. Manager sign-off required before ship.',false,NULL,'in',NULL,true,'pending',NULL,NULL)
)
INSERT INTO public.traveler_steps (account_id, job_id, step_number, title, instructions, requires_dimension, dimension_label, dimension_unit, dimension_value, requires_sign_off, status, flag_note, completed_at, sort_order)
SELECT a.id, j.id, ts.step_number, ts.title, ts.instructions, ts.requires_dimension, ts.dimension_label, ts.dimension_unit, ts.dimension_value, ts.requires_sign_off, ts.status, ts.flag_note,
       CASE WHEN ts.completed_off IS NULL THEN NULL ELSE now()-ts.completed_off END, ts.step_number
FROM ts CROSS JOIN acct a
JOIN public.jobs j ON j.account_id=a.id AND j.job_number=ts.job_number
WHERE NOT EXISTS (SELECT 1 FROM public.traveler_steps x WHERE x.job_id=j.id AND x.step_number=ts.step_number);
