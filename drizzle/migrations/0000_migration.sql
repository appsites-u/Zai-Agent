-- Roles
create type public.app_role as enum ('admin','operator','viewer');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  created_at timestamptz not null default now()
);
grant select, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role public.app_role not null,
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

-- member = any role; writer = admin or operator
create or replace function public.is_member(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id)
$$;
create or replace function public.can_write(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role in ('admin','operator'))
$$;

create policy "members read profiles" on public.profiles for select to authenticated using (public.is_member(auth.uid()) or id = auth.uid());
create policy "own profile update" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy "read own or admin roles" on public.user_roles for select to authenticated using (user_id = auth.uid() or public.has_role(auth.uid(),'admin'));

-- First user becomes admin; others get no role until an admin grants one.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email,'@',1)));
  if not exists (select 1 from public.user_roles) then
    insert into public.user_roles (user_id, role) values (new.id, 'admin');
  end if;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- Admin role management
create or replace function public.set_user_role(_user_id uuid, _role public.app_role)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role(auth.uid(),'admin') then raise exception 'Forbidden: admin only'; end if;
  if _user_id = auth.uid() and _role <> 'admin' then raise exception 'You cannot demote yourself'; end if;
  delete from public.user_roles where user_id = _user_id;
  insert into public.user_roles (user_id, role) values (_user_id, _role);
  insert into public.audit_logs(actor_id, action, entity, entity_id, details)
    values (auth.uid(), 'role.set', 'user', _user_id::text, jsonb_build_object('role', _role));
end $$;
create or replace function public.revoke_user_access(_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role(auth.uid(),'admin') then raise exception 'Forbidden: admin only'; end if;
  if _user_id = auth.uid() then raise exception 'You cannot revoke yourself'; end if;
  delete from public.user_roles where user_id = _user_id;
  insert into public.audit_logs(actor_id, action, entity, entity_id, details)
    values (auth.uid(), 'role.revoke', 'user', _user_id::text, '{}'::jsonb);
end $$;

-- Audit logs (created early so functions above compile at call time)
create table public.audit_logs (
  id bigserial primary key,
  actor_id uuid,
  action text not null,
  entity text not null,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
grant select on public.audit_logs to authenticated;
grant all on public.audit_logs to service_role;
alter table public.audit_logs enable row level security;
create policy "admins read audit" on public.audit_logs for select to authenticated using (public.has_role(auth.uid(),'admin'));

create or replace function public.audit_trigger()
returns trigger language plpgsql security definer set search_path = public as $$
declare rec jsonb; eid text;
begin
  if tg_op = 'DELETE' then rec := to_jsonb(old); else rec := to_jsonb(new); end if;
  eid := rec->>'id';
  insert into public.audit_logs(actor_id, action, entity, entity_id, details)
  values (auth.uid(), lower(tg_op), tg_table_name, eid,
    jsonb_strip_nulls(jsonb_build_object('name', coalesce(rec->>'name', rec->>'title'), 'status', rec->>'status')));
  return null;
end $$;

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$ begin new.updated_at := now(); return new; end $$;

-- Departments
create table public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  description text not null default '',
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Agents
create table public.agents (
  id uuid primary key default gen_random_uuid(),
  department_id uuid references public.departments(id) on delete set null,
  name text not null check (char_length(name) between 1 and 80),
  role text not null default '',
  system_instructions text not null default '',
  model_id text not null default '@cf/meta/llama-3.1-8b-instruct',
  temperature numeric not null default 0.4 check (temperature >= 0 and temperature <= 2),
  enabled boolean not null default true,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Projects
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  department_id uuid references public.departments(id) on delete set null,
  name text not null check (char_length(name) between 1 and 120),
  description text not null default '',
  status text not null default 'active' check (status in ('active','paused','completed','archived')),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Tasks
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade not null,
  agent_id uuid references public.agents(id) on delete set null,
  title text not null check (char_length(title) between 1 and 200),
  description text not null default '',
  status text not null default 'todo' check (status in ('todo','in_progress','awaiting_approval','done','failed','cancelled')),
  priority text not null default 'medium' check (priority in ('low','medium','high','urgent')),
  requires_approval boolean not null default false,
  approved_at timestamptz,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Task runs
create table public.task_runs (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references public.tasks(id) on delete cascade not null,
  agent_id uuid references public.agents(id) on delete set null,
  model_id text,
  status text not null default 'queued' check (status in ('queued','running','succeeded','failed')),
  attempt int not null default 1,
  output text,
  error_code text,
  error text,
  latency_ms int,
  triggered_by uuid default auth.uid(),
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

-- Conversations & messages
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid references public.agents(id) on delete set null,
  title text not null default 'New conversation',
  owner_id uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.conversations(id) on delete cascade not null,
  role text not null check (role in ('user','assistant','system')),
  content text not null,
  model_id text,
  error_code text,
  created_at timestamptz not null default now()
);

-- Integrations registry
create table public.integrations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  kind text not null default 'other',
  status text not null default 'not_configured' check (status in ('not_configured','configured','error','disabled')),
  env_vars text[] not null default '{}',
  notes text not null default '',
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Approvals
create table public.approvals (
  id uuid primary key default gen_random_uuid(),
  action text not null check (action in ('delete_agent','delete_project','delete_department','run_task')),
  target_id uuid not null,
  summary text not null default '',
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  requested_by uuid not null default auth.uid(),
  decided_by uuid,
  decision_note text,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

-- Settings
create table public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- AI usage / errors
create table public.ai_usage (
  id bigserial primary key,
  user_id uuid default auth.uid(),
  source text not null check (source in ('chat','task_run','setup_test')),
  model_id text,
  status text not null check (status in ('ok','error')),
  error_code text,
  latency_ms int,
  created_at timestamptz not null default now()
);

-- Grants
grant select, insert, update, delete on public.departments, public.agents, public.projects, public.tasks, public.task_runs, public.conversations, public.messages, public.integrations, public.approvals, public.app_settings to authenticated;
grant select, insert on public.ai_usage to authenticated;
grant usage on sequence public.ai_usage_id_seq to authenticated;
grant all on public.departments, public.agents, public.projects, public.tasks, public.task_runs, public.conversations, public.messages, public.integrations, public.approvals, public.app_settings, public.ai_usage to service_role;

alter table public.departments enable row level security;
alter table public.agents enable row level security;
alter table public.projects enable row level security;
alter table public.tasks enable row level security;
alter table public.task_runs enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.integrations enable row level security;
alter table public.approvals enable row level security;
alter table public.app_settings enable row level security;
alter table public.ai_usage enable row level security;

-- Shared read for members; writes for operators/admins; deletes go through approvals (no DELETE policy).
create policy "members read" on public.departments for select to authenticated using (public.is_member(auth.uid()));
create policy "writers insert" on public.departments for insert to authenticated with check (public.can_write(auth.uid()));
create policy "writers update" on public.departments for update to authenticated using (public.can_write(auth.uid()));

create policy "members read" on public.agents for select to authenticated using (public.is_member(auth.uid()));
create policy "admins insert" on public.agents for insert to authenticated with check (public.has_role(auth.uid(),'admin'));
create policy "admins update" on public.agents for update to authenticated using (public.has_role(auth.uid(),'admin'));

create policy "members read" on public.projects for select to authenticated using (public.is_member(auth.uid()));
create policy "writers insert" on public.projects for insert to authenticated with check (public.can_write(auth.uid()));
create policy "writers update" on public.projects for update to authenticated using (public.can_write(auth.uid()));

create policy "members read" on public.tasks for select to authenticated using (public.is_member(auth.uid()));
create policy "writers insert" on public.tasks for insert to authenticated with check (public.can_write(auth.uid()) and approved_at is null);
create policy "writers update" on public.tasks for update to authenticated using (public.can_write(auth.uid()));
create policy "writers delete" on public.tasks for delete to authenticated using (public.can_write(auth.uid()));

create policy "members read" on public.task_runs for select to authenticated using (public.is_member(auth.uid()));
create policy "writers insert" on public.task_runs for insert to authenticated with check (public.can_write(auth.uid()));
create policy "writers update" on public.task_runs for update to authenticated using (public.can_write(auth.uid()));

create policy "owner read" on public.conversations for select to authenticated using (owner_id = auth.uid() and public.is_member(auth.uid()));
create policy "owner insert" on public.conversations for insert to authenticated with check (owner_id = auth.uid() and public.is_member(auth.uid()));
create policy "owner update" on public.conversations for update to authenticated using (owner_id = auth.uid());
create policy "owner delete" on public.conversations for delete to authenticated using (owner_id = auth.uid());

create policy "owner read" on public.messages for select to authenticated using (exists (select 1 from public.conversations c where c.id = conversation_id and c.owner_id = auth.uid()));
create policy "owner insert" on public.messages for insert to authenticated with check (public.is_member(auth.uid()) and exists (select 1 from public.conversations c where c.id = conversation_id and c.owner_id = auth.uid()));

create policy "members read" on public.integrations for select to authenticated using (public.is_member(auth.uid()));
create policy "admins insert" on public.integrations for insert to authenticated with check (public.has_role(auth.uid(),'admin'));
create policy "admins update" on public.integrations for update to authenticated using (public.has_role(auth.uid(),'admin'));
create policy "admins delete" on public.integrations for delete to authenticated using (public.has_role(auth.uid(),'admin'));

create policy "members read" on public.approvals for select to authenticated using (public.is_member(auth.uid()));
create policy "writers request" on public.approvals for insert to authenticated with check (public.can_write(auth.uid()) and requested_by = auth.uid() and status = 'pending');

create policy "members read" on public.app_settings for select to authenticated using (public.is_member(auth.uid()));
create policy "admins insert" on public.app_settings for insert to authenticated with check (public.has_role(auth.uid(),'admin'));
create policy "admins update" on public.app_settings for update to authenticated using (public.has_role(auth.uid(),'admin'));

create policy "admins read usage" on public.ai_usage for select to authenticated using (public.has_role(auth.uid(),'admin') or user_id = auth.uid());
create policy "members insert usage" on public.ai_usage for insert to authenticated with check (public.is_member(auth.uid()) and user_id = auth.uid());

-- Approval decision: admin-only, executes approved destructive actions server-side.
create or replace function public.decide_approval(_id uuid, _approve boolean, _note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare a public.approvals;
begin
  if not public.has_role(auth.uid(),'admin') then raise exception 'Forbidden: admin only'; end if;
  select * into a from public.approvals where id = _id for update;
  if a.id is null then raise exception 'Approval not found'; end if;
  if a.status <> 'pending' then raise exception 'Approval already decided'; end if;
  update public.approvals set status = case when _approve then 'approved' else 'rejected' end,
    decided_by = auth.uid(), decided_at = now(), decision_note = _note where id = _id;
  if _approve then
    if a.action = 'delete_agent' then delete from public.agents where id = a.target_id;
    elsif a.action = 'delete_project' then delete from public.projects where id = a.target_id;
    elsif a.action = 'delete_department' then delete from public.departments where id = a.target_id;
    elsif a.action = 'run_task' then update public.tasks set approved_at = now(), status = 'todo' where id = a.target_id;
    end if;
  elsif a.action = 'run_task' then
    update public.tasks set status = 'cancelled' where id = a.target_id;
  end if;
  insert into public.audit_logs(actor_id, action, entity, entity_id, details)
    values (auth.uid(), case when _approve then 'approval.approve' else 'approval.reject' end, 'approval', _id::text,
      jsonb_build_object('action', a.action, 'target_id', a.target_id, 'note', _note));
end $$;

-- Prevent non-admins from self-approving tasks via update
create or replace function public.guard_task_approval()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.approved_at is distinct from old.approved_at and not public.has_role(auth.uid(),'admin') and current_user <> 'postgres' then
    if auth.uid() is not null then raise exception 'Only admins can approve tasks'; end if;
  end if;
  return new;
end $$;
create trigger tasks_guard_approval before update on public.tasks for each row execute function public.guard_task_approval();

-- updated_at triggers
create trigger t_upd before update on public.departments for each row execute function public.touch_updated_at();
create trigger t_upd before update on public.agents for each row execute function public.touch_updated_at();
create trigger t_upd before update on public.projects for each row execute function public.touch_updated_at();
create trigger t_upd before update on public.tasks for each row execute function public.touch_updated_at();
create trigger t_upd before update on public.conversations for each row execute function public.touch_updated_at();
create trigger t_upd before update on public.integrations for each row execute function public.touch_updated_at();

-- audit triggers
create trigger t_audit after insert or update or delete on public.departments for each row execute function public.audit_trigger();
create trigger t_audit after insert or update or delete on public.agents for each row execute function public.audit_trigger();
create trigger t_audit after insert or update or delete on public.projects for each row execute function public.audit_trigger();
create trigger t_audit after insert or update or delete on public.tasks for each row execute function public.audit_trigger();
create trigger t_audit after insert or update or delete on public.integrations for each row execute function public.audit_trigger();
create trigger t_audit after insert or update on public.app_settings for each row execute function public.audit_trigger();
create trigger t_audit after insert on public.approvals for each row execute function public.audit_trigger();
create trigger t_audit after insert or update on public.task_runs for each row execute function public.audit_trigger();

create index on public.tasks(project_id);
create index on public.task_runs(task_id, created_at desc);
create index on public.messages(conversation_id, created_at);
create index on public.audit_logs(created_at desc);
create index on public.ai_usage(created_at desc);

-- Seed baseline registry rows (honest status: not configured until verified)
insert into public.integrations (name, kind, status, env_vars, notes) values
  ('Cloudflare Workers AI', 'ai_provider', 'not_configured', array['CLOUDFLARE_ACCOUNT_ID','CLOUDFLARE_API_TOKEN'], 'Model provider for chat and task runs. Status updates when an admin runs the connection test on the Setup page.');
insert into public.app_settings (key, value) values
  ('default_model', '"@cf/meta/llama-3.1-8b-instruct"'),
  ('ai_timeout_ms', '30000');