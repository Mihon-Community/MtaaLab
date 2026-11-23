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
insert into public.missions (id,title,description,subject,grade_band,status) values ('40000000-0000-4000-8000-000000000001','Mtoni water resilience','A fictional community plans for a prolonged water shortage.','Systems science','Grade 7','published') on conflict do nothing;
insert into public.scenario_versions (id,mission_id,version,initial_state,rules_version,learning_objectives,approved_by) values
 ('50000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001',1,
  '{"reservoir_level": 60, "reservoir_capacity": 100, "rainfall_inflow": 5, "demand_by_sector": {"households": 20, "school": 8, "clinic": 6, "farms": 15}, "leakage": 4, "budget_remaining": 100, "service_levels": {"households": 1, "school": 1, "clinic": 1, "farms": 1}, "crop_health": 70, "wellbeing": 70}'::jsonb,
  'placeholder-v1','["Explain interactions among sector water needs", "Compare trade-offs using evidence"]'::jsonb,'00000000-0000-4000-8000-000000000101') on conflict do nothing;
update public.missions set published_version_id='50000000-0000-4000-8000-000000000001' where id='40000000-0000-4000-8000-000000000001';
