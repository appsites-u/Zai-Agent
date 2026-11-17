import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { roleAllows, type Access } from './roles';
import { agentSchema, departmentSchema, projectSchema, taskSchema, integrationSchema, mutationSchema, requiredAccess } from './workspace-schema';
import type { Database } from '@/integrations/supabase/types';
import type { SupabaseClient } from '@supabase/supabase-js';

export async function enforceAccess(client: SupabaseClient<Database>, userId: string, access: Access) {
  const { data, error } = await client.from('user_roles').select('role').eq('user_id', userId);
  if (error || !roleAllows(data?.map(r => r.role), access)) throw new Error('Access denied. Contact your workspace administrator.');
  return data?.map(r => r.role) ?? [];
}
function unwrap<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error('The workspace could not save or load this record. Check access and try again.');
  if (result.data === null) throw new Error('Record not found or unavailable.');
  return result.data;
}
export const getWorkspace = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { supabase: s, userId } = context;
  const { data: roleRows, error } = await s.from('user_roles').select('role').eq('user_id', userId);
  if (error) throw new Error('Could not verify workspace access.');
  const roles = roleRows?.map(r => r.role) ?? [];
  const profile = unwrap(await s.from('profiles').select('id,display_name,email').eq('id',userId).single());
  if (!roleAllows(roles,'member')) return { roles, profile, departments: [], agents: [], projects: [], tasks: [], runs: [], integrations: [], approvals: [], audit: [], usage: [], people: [], roleRows: [], settings: [], conversations: [] };
  const [departments,agents,projects,tasks,runs,integrations,approvals,usage,conversations] = await Promise.all([
    s.from('departments').select('*').order('created_at',{ascending:false}), s.from('agents').select('*').order('created_at',{ascending:false}), s.from('projects').select('*').order('created_at',{ascending:false}), s.from('tasks').select('*').order('created_at',{ascending:false}), s.from('task_runs').select('*').order('created_at',{ascending:false}).limit(100), s.from('integrations').select('*').order('created_at'), s.from('approvals').select('*').order('created_at',{ascending:false}).limit(100), s.from('ai_usage').select('*').order('created_at',{ascending:false}).limit(100), s.from('conversations').select('*').order('updated_at',{ascending:false}),
  ]);
  const admin = roleAllows(roles,'admin');
  const [audit,people,allRoles,settings] = admin ? await Promise.all([s.from('audit_logs').select('*').order('created_at',{ascending:false}).limit(100),s.from('profiles').select('*'),s.from('user_roles').select('*'),s.from('app_settings').select('*')]) : [null,null,null,null];
  return { roles,profile,departments:unwrap(departments),agents:unwrap(agents),projects:unwrap(projects),tasks:unwrap(tasks),runs:unwrap(runs),integrations:unwrap(integrations),approvals:unwrap(approvals),usage:unwrap(usage),conversations:unwrap(conversations),audit:audit?unwrap(audit):[],people:people?unwrap(people):[],roleRows:allRoles?unwrap(allRoles):[],settings:settings?unwrap(settings):[] };
});
export const saveEntity = createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(input => mutationSchema.parse(input)).handler(async ({data,context}) => {
  const {supabase:s,userId} = context;
  await enforceAccess(s,userId,requiredAccess(data.entity));
  switch(data.entity) {
    case 'departments': { const v=departmentSchema.parse(data.values); return unwrap(data.id?await s.from('departments').update(v).eq('id',data.id).select().single():await s.from('departments').insert(v).select().single()); }
    case 'agents': { const v=agentSchema.parse(data.values); return unwrap(data.id?await s.from('agents').update(v).eq('id',data.id).select().single():await s.from('agents').insert(v).select().single()); }
    case 'projects': { const v=projectSchema.parse(data.values); return unwrap(data.id?await s.from('projects').update(v).eq('id',data.id).select().single():await s.from('projects').insert(v).select().single()); }
    case 'tasks': { const v=taskSchema.parse(data.values); return unwrap(data.id?await s.from('tasks').update(v).eq('id',data.id).select().single():await s.from('tasks').insert(v).select().single()); }
    case 'integrations': { const v=integrationSchema.parse(data.values); return unwrap(data.id?await s.from('integrations').update(v).eq('id',data.id).select().single():await s.from('integrations').insert(v).select().single()); }
  }
});
export const requestDeletion = createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(input=>z.object({entity:z.enum(['department','agent','project']),id:z.string().uuid(),summary:z.string().max(500)}).parse(input)).handler(async ({data,context})=>{
  await enforceAccess(context.supabase,context.userId,'writer');
  const action=`delete_${data.entity}`;
  const existing=unwrap(await context.supabase.from('approvals').select('id').eq('action',action).eq('target_id',data.id).eq('status','pending'));
  if(existing.length) throw new Error('An approval request is already pending.');
  return unwrap(await context.supabase.from('approvals').insert({action,target_id:data.id,summary:data.summary}).select().single());
});
export const decideApproval = createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(input=>z.object({id:z.string().uuid(),approve:z.boolean(),note:z.string().max(2000)}).parse(input)).handler(async ({data,context})=>{
  await enforceAccess(context.supabase,context.userId,'admin');
  const {error}=await context.supabase.rpc('decide_approval',{_id:data.id,_approve:data.approve,_note:data.note});
  if(error) throw new Error('Approval could not be decided. It may already be resolved.');
  return {ok:true};
});
export const manageRole = createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(input=>z.object({userId:z.string().uuid(),role:z.enum(['admin','operator','viewer','revoke'])}).parse(input)).handler(async ({data,context})=>{
  await enforceAccess(context.supabase,context.userId,'admin');
  const result=data.role==='revoke'?await context.supabase.rpc('revoke_user_access',{_user_id:data.userId}):await context.supabase.rpc('set_user_role',{_user_id:data.userId,_role:data.role});
  if(result.error) throw new Error('Access could not be changed. You cannot remove or demote yourself.');
  return {ok:true};
});
export const saveSettings = createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(input=>z.object({default_model:agentSchema.shape.model_id,ai_timeout_ms:z.coerce.number().int().min(1000).max(60000)}).parse(input)).handler(async ({data,context})=>{
  await enforceAccess(context.supabase,context.userId,'admin');
  unwrap(await context.supabase.from('app_settings').upsert([{key:'default_model',value:data.default_model},{key:'ai_timeout_ms',value:data.ai_timeout_ms}]).select());
  return {ok:true};
});
