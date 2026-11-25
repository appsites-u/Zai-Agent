import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { enforceAccess } from './workspace.functions';
import { decideRunAction, RUN_ERROR_TEXT, buildTaskPrompt } from './tasks';
import { AiError, messageFor, toAiError } from './ai/errors';
import { getConfiguredProvider } from './ai/cloudflare';
import type { ChatMessage } from './ai/provider';
import type { Database } from '@/integrations/supabase/types';
import type { SupabaseClient } from '@supabase/supabase-js';

type Db = SupabaseClient<Database>;

async function timeoutSetting(s: Db) {
  const { data } = await s.from('app_settings').select('value').eq('key', 'ai_timeout_ms').maybeSingle();
  const n = Number(data?.value);
  return Number.isFinite(n) && n >= 1000 && n <= 60000 ? n : 30000;
}

/** Runs one completion and normalises failures to AiError. Credentials are read from server secrets only. */
export async function runCompletion(messages: ChatMessage[], model: string, temperature: number, timeoutMs: number) {
  const provider = getConfiguredProvider();
  if (!provider) throw new AiError('not_configured', messageFor('not_configured'));
  const started = Date.now();
  try {
    const { text } = await provider.complete({ model, messages, temperature, timeoutMs });
    return { text, latency: Date.now() - started };
  } catch (e) {
    throw toAiError(e);
  }
}

export const runTask = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ taskId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase: s, userId } = context;
    await enforceAccess(s, userId, 'writer');
    const { data: task } = await s.from('tasks').select('*').eq('id', data.taskId).maybeSingle();
    if (!task) throw new Error('Task not found.');
    const [{ data: agent }, { data: project }, { data: pending }] = await Promise.all([
      task.agent_id ? s.from('agents').select('*').eq('id', task.agent_id).maybeSingle() : Promise.resolve({ data: null }),
      s.from('projects').select('name').eq('id', task.project_id).maybeSingle(),
      s.from('approvals').select('id').eq('action', 'run_task').eq('target_id', task.id).eq('status', 'pending'),
    ]);
    const decision = decideRunAction(task, agent, (pending?.length ?? 0) > 0);
    if (decision.kind === 'error') throw new Error(RUN_ERROR_TEXT[decision.reason]);
    if (decision.kind === 'awaiting_approval') return { outcome: 'awaiting_approval' as const };
    if (decision.kind === 'request_approval') {
      const { error } = await s.from('approvals').insert({ action: 'run_task', target_id: task.id, summary: `Run task “${task.title}”` });
      if (error) throw new Error('Could not request approval.');
      await s.from('tasks').update({ status: 'awaiting_approval' }).eq('id', task.id);
      return { outcome: 'approval_requested' as const };
    }
    const a = agent!;
    const { count } = await s.from('task_runs').select('id', { count: 'exact', head: true }).eq('task_id', task.id);
    const { data: run, error: runErr } = await s.from('task_runs').insert({ task_id: task.id, agent_id: a.id, model_id: a.model_id, status: 'running', attempt: (count ?? 0) + 1, started_at: new Date().toISOString() }).select().single();
    if (runErr || !run) throw new Error('Could not start the run.');
    await s.from('tasks').update({ status: 'in_progress' }).eq('id', task.id);
    const messages: ChatMessage[] = [
      ...(a.system_instructions ? [{ role: 'system' as const, content: a.system_instructions }] : []),
      { role: 'user', content: buildTaskPrompt(task, project?.name ?? 'Untitled project') },
    ];
    const started = Date.now();
    try {
      const { text, latency } = await runCompletion(messages, a.model_id, Number(a.temperature), await timeoutSetting(s));
      await s.from('task_runs').update({ status: 'succeeded', output: text, latency_ms: latency, finished_at: new Date().toISOString() }).eq('id', run.id);
      await s.from('tasks').update({ status: 'done' }).eq('id', task.id);
      await s.from('ai_usage').insert({ user_id: userId, source: 'task_run', model_id: a.model_id, status: 'ok', latency_ms: latency });
      return { outcome: 'succeeded' as const, runId: run.id };
    } catch (e) {
      const err = toAiError(e);
      const latency = Date.now() - started;
      await s.from('task_runs').update({ status: 'failed', error_code: err.code, error: err.message, latency_ms: latency, finished_at: new Date().toISOString() }).eq('id', run.id);
      await s.from('tasks').update({ status: 'failed' }).eq('id', task.id);
      await s.from('ai_usage').insert({ user_id: userId, source: 'task_run', model_id: a.model_id, status: 'error', error_code: err.code, latency_ms: latency });
      return { outcome: 'failed' as const, runId: run.id, error: err.message, code: err.code };
    }
  });

export const getMessages = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ conversationId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await enforceAccess(context.supabase, context.userId, 'member');
    const { data: rows, error } = await context.supabase.from('messages').select('*').eq('conversation_id', data.conversationId).order('created_at');
    if (error) throw new Error('Could not load messages.');
    return rows ?? [];
  });

export const sendChatMessage = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ conversationId: z.string().uuid().nullable(), agentId: z.string().uuid(), content: z.string().trim().min(1).max(8000) }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase: s, userId } = context;
    await enforceAccess(s, userId, 'member');
    const { data: agent } = await s.from('agents').select('*').eq('id', data.agentId).maybeSingle();
    if (!agent) throw new Error('Agent not found.');
    if (!agent.enabled) throw new Error('This agent is disabled.');
    let conversationId = data.conversationId;
    if (!conversationId) {
      const { data: conv, error } = await s.from('conversations').insert({ agent_id: agent.id, title: data.content.slice(0, 60), owner_id: userId }).select('id').single();
      if (error || !conv) throw new Error('Could not start the conversation.');
      conversationId = conv.id;
    }
    const { error: insErr } = await s.from('messages').insert({ conversation_id: conversationId, role: 'user', content: data.content });
    if (insErr) throw new Error('Could not save your message.');
    const { data: history } = await s.from('messages').select('role,content,error_code').eq('conversation_id', conversationId).order('created_at', { ascending: false }).limit(20);
    const turns: ChatMessage[] = (history ?? []).reverse().filter((m) => !m.error_code && m.role !== 'system').map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));
    const messages: ChatMessage[] = [...(agent.system_instructions ? [{ role: 'system' as const, content: agent.system_instructions }] : []), ...turns];
    const started = Date.now();
    try {
      const { text, latency } = await runCompletion(messages, agent.model_id, Number(agent.temperature), await timeoutSetting(s));
      await s.from('messages').insert({ conversation_id: conversationId, role: 'assistant', content: text, model_id: agent.model_id });
      await s.from('ai_usage').insert({ user_id: userId, source: 'chat', model_id: agent.model_id, status: 'ok', latency_ms: latency });
    } catch (e) {
      const err = toAiError(e);
      // Persist the failure as a flagged system notice, never as an assistant reply.
      await s.from('messages').insert({ conversation_id: conversationId, role: 'system', content: err.message, model_id: agent.model_id, error_code: err.code });
      await s.from('ai_usage').insert({ user_id: userId, source: 'chat', model_id: agent.model_id, status: 'error', error_code: err.code, latency_ms: Date.now() - started });
    }
    await s.from('conversations').update({ agent_id: agent.id }).eq('id', conversationId);
    return { conversationId };
  });

export const testAiConnection = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase: s, userId } = context;
    await enforceAccess(s, userId, 'admin');
    const { data: modelRow } = await s.from('app_settings').select('value').eq('key', 'default_model').maybeSingle();
    const model = typeof modelRow?.value === 'string' ? modelRow.value : '@cf/meta/llama-3.1-8b-instruct';
    let status: 'configured' | 'error' | 'not_configured' = 'configured';
    let message = 'Connection verified: the provider returned a completion.';
    const started = Date.now();
    try {
      await runCompletion([{ role: 'user', content: 'Reply with the single word: ok' }], model, 0, 15000);
    } catch (e) {
      const err = toAiError(e);
      status = err.code === 'not_configured' ? 'not_configured' : 'error';
      message = err.message;
      await s.from('ai_usage').insert({ user_id: userId, source: 'setup_test', model_id: model, status: 'error', error_code: err.code, latency_ms: Date.now() - started });
    }
    if (status === 'configured') await s.from('ai_usage').insert({ user_id: userId, source: 'setup_test', model_id: model, status: 'ok', latency_ms: Date.now() - started });
    await s.from('integrations').update({ status, last_checked_at: new Date().toISOString() }).eq('kind', 'ai_provider');
    return { status, message };
  });
