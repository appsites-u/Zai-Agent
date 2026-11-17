import { z } from 'zod';
import { isValidModelId, DEFAULT_MODEL } from './ai/provider';
const name = z.string().trim().min(1).max(80);
const nullableId = z.string().uuid().nullable().default(null);
export const entityNames = ['departments', 'agents', 'projects', 'tasks', 'integrations'] as const;
export type Entity = typeof entityNames[number];
export const departmentSchema = z.object({ name, description: z.string().max(10000).default('') });
export const agentSchema = z.object({ name, department_id: nullableId, role: z.string().max(500).default(''), system_instructions: z.string().max(20000).default(''), model_id: z.string().refine(isValidModelId, 'Enter a valid Cloudflare model ID').default(DEFAULT_MODEL), temperature: z.coerce.number().min(0).max(2).default(0.4), enabled: z.boolean().default(true) });
export const projectSchema = z.object({ name: z.string().trim().min(1).max(120), description: z.string().max(10000).default(''), department_id: nullableId, status: z.enum(['active', 'paused', 'completed', 'archived']).default('active') });
export const taskSchema = z.object({ title: z.string().trim().min(1).max(200), description: z.string().max(20000).default(''), project_id: z.string().uuid(), agent_id: nullableId, priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'), status: z.enum(['todo','in_progress','awaiting_approval','done','failed','cancelled']).default('todo'), requires_approval: z.boolean().default(false) });
// Connection status and credential values are never editable registry fields.
export const integrationSchema = z.object({ name, kind: z.string().max(80).default('other'), notes: z.string().max(10000).default('') });
export const mutationSchema = z.object({ entity: z.enum(entityNames), id: z.string().uuid().optional(), values: z.unknown() });
export function requiredAccess(entity: Entity) { return entity === 'agents' || entity === 'integrations' ? 'admin' : 'writer'; }
