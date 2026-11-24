-- Synthetic fixtures only. Passwords are not seeded; create test auth identities separately.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
 ('00000000-0000-4000-8000-000000000101','00000000-0000-0000-0000-000000000000','authenticated','authenticated','teacher@example.test','',now(),'{}','{}',now(),now()),
 ('00000000-0000-4000-8000-000000000102','00000000-0000-0000-0000-000000000000','authenticated','authenticated','student@example.test','',now(),'{}','{}',now(),now())
on conflict (id) do nothing;

insert into public.schools (id,name,country,timezone) values ('10000000-0000-4000-8000-000000000001','Mtoni Demo School','Kenya','Africa/Nairobi') on conflict do nothing;
insert into public.profiles (id,display_name,role,school_id,grade_level) values
 ('00000000-0000-4000-8000-000000000101','Demo Teacher','teacher','10000000-0000-4000-8000-000000000001',null),
 ('00000000-0000-4000-8000-000000000102','Demo Student','student','10000000-0000-4000-8000-000000000001','Grade 7') on conflict do nothing;
insert into public.classes (id,school_id,name,grade_level,teacher_id) values ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Mtoni Demo Class','Grade 7','00000000-0000-4000-8000-000000000101') on conflict do nothing;
insert into public.class_memberships (id,class_id,student_id) values ('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000102') on conflict do nothing;
insert into public.missions (id,slug,title,description,subject,grade_band,status) values
 ('40000000-0000-4000-8000-000000000001','mtoni-water-resilience','Mtoni water resilience','A fictional community plans for a prolonged water shortage.','Systems science','Teacher assigned','published'),
 ('40000000-0000-4000-8000-000000000002','mama-mboga-market','Mama Mboga Market','Run a fictional market stall. Balance order size, selling price and cash across six market days.','Mathematics, Social Studies','Teacher assigned','published'),
 ('40000000-0000-4000-8000-000000000003','mtoni-fever-response','Mtoni Fever Response','Plan fictional community prevention and clinic readiness improvements with delayed effects.','Integrated Science, Mathematics, Social Studies','Teacher assigned','published'),
 ('40000000-0000-4000-8000-000000000004','chama-trust-circle','Chama Trust Circle','A fictional group weighs savings, a reserve and requests using transparent token accounts.','Mathematics, Social Studies','Teacher assigned','published')
on conflict do nothing;
insert into public.scenario_versions (id,mission_id,version,initial_state,rules_version,learning_objectives,approved_by) values
 ('50000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001',1,
  '{"reservoir_level": 60, "reservoir_capacity": 100, "rainfall_inflow": 5, "demand_by_sector": {"households": 20, "school": 8, "clinic": 6, "farms": 15}, "leakage": 4, "budget_remaining": 100, "service_levels": {"households": 1, "school": 1, "clinic": 1, "farms": 1}, "crop_health": 70, "wellbeing": 70}'::jsonb,
  'placeholder-v1','["Explain interactions among sector water needs", "Compare trade-offs using evidence"]'::jsonb,'00000000-0000-4000-8000-000000000101') on conflict do nothing;
update public.missions set published_version_id='50000000-0000-4000-8000-000000000001' where id='40000000-0000-4000-8000-000000000001';

insert into public.scenario_versions (id,mission_id,version,initial_state,rules_version,learning_objectives,approved_by) values
 ('50000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000002',1,
  '{"current_turn":0,"cash_credits":100,"stock_units":10,"selling_price":8,"total_sold":0,"total_spoiled":0,"completed_actions":[]}'::jsonb,
  'soko-market-v1','["Distinguish sales revenue from cash remaining after an order.","Explain how price, demand, stock and spoilage interact.","Compare plans using values from the market-day record."]'::jsonb,null),
 ('50000000-0000-4000-8000-000000000003','40000000-0000-4000-8000-000000000003',1,
  '{"current_turn":0,"budget_tokens":100,"safe_water_points":60,"handwashing_points":20,"clinic_readiness":20,"pending_effects":[],"completed_actions":[]}'::jsonb,
  'mtoni-fever-v1','["Explain why infrastructure improvements may have delayed effects.","Compare safe-water, handwashing and clinic-readiness trade-offs.","Use the event log to distinguish a game index from health data."]'::jsonb,null),
 ('50000000-0000-4000-8000-000000000004','40000000-0000-4000-8000-000000000004',1,
  '{"current_turn":0,"pool_tokens":100,"reserve_tokens":20,"outstanding_tokens":0,"repayments_received":0,"delayed_tokens":0,"scheduled_repayments":[],"completed_actions":[]}'::jsonb,
  'chama-circle-v1','["Distinguish the group pool from the amount available to lend.","Calculate a simple fictional percentage fee and total due.","Explain how a reserve changes the group\u0027s choices under uncertainty."]'::jsonb,null)
on conflict do nothing;

update public.missions m set published_version_id=v.id
from public.scenario_versions v
where (m.id,v.id) in (
 ('40000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000002'),
 ('40000000-0000-4000-8000-000000000003','50000000-0000-4000-8000-000000000003'),
 ('40000000-0000-4000-8000-000000000004','50000000-0000-4000-8000-000000000004')
);

insert into public.mission_assignments(class_id,mission_id,assigned_by) values
 ('20000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000101'),
 ('20000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000101'),
 ('20000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000101')
on conflict (class_id,mission_id) do nothing;
