-- Keep direct authenticated reads aligned with the API's school-scoped assignment checks.
drop policy if exists mission_assignments_select_class_members
  on public.mission_assignments;

create policy mission_assignments_select_class_members
  on public.mission_assignments for select to authenticated
  using (
    exists (
      select 1
      from public.classes c
      join public.profiles p on p.id = c.teacher_id
      where c.id = mission_assignments.class_id
        and c.teacher_id = (select auth.uid())
        and p.role = 'teacher'
        and p.school_id = c.school_id
    )
    or exists (
      select 1
      from public.class_memberships cm
      join public.classes c on c.id = cm.class_id
      join public.profiles p on p.id = cm.student_id
      where cm.class_id = mission_assignments.class_id
        and cm.student_id = (select auth.uid())
        and cm.membership_status = 'active'
        and p.role = 'student'
        and p.school_id = c.school_id
    )
  );
