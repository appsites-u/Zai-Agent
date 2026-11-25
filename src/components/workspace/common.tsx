import { useState, type ReactNode } from 'react';
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { workspaceQuery } from '@/lib/workspace-query';
import { saveEntity, requestDeletion } from '@/lib/workspace.functions';
import { roleAllows, type Access } from '@/lib/roles';
import type { Entity } from '@/lib/workspace-schema';

export function useWorkspace() { return useSuspenseQuery(workspaceQuery).data; }
export function useCan(need: Access) { return roleAllows(useWorkspace().roles, need); }

export function PageHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <div className="mb-8 flex flex-wrap items-end justify-between gap-5"><div><p className="mb-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{eyebrow}</p><h1 className="text-3xl font-semibold">{title}</h1><p className="mt-3 max-w-2xl text-sm text-muted-foreground">{description}</p></div>{action}</div>;
}
export function Empty({ title, text }: { title: string; text: string }) {
  return <div className="rounded-md border border-dashed border-border py-14 text-center"><h3 className="text-sm font-medium">{title}</h3><p className="mt-2 text-xs text-muted-foreground">{text}</p></div>;
}
export function errText(e: unknown) { return e instanceof Error ? e.message : 'Something went wrong.'; }

export type Field = { name: string; label: string; type?: 'text' | 'textarea' | 'number' | 'select' | 'checkbox'; options?: { value: string; label: string }[]; required?: boolean };

export function EntityDialog({ entity, id, initial, fields, trigger, title }: { entity: Entity; id?: string; initial: Record<string, unknown>; fields: Field[]; trigger: ReactNode; title: string }) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, unknown>>(initial);
  const save = useServerFn(saveEntity); const qc = useQueryClient();
  const m = useMutation({
    mutationFn: () => save({ data: { entity, ...(id ? { id } : {}), values: Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v === '' && fields.find(f => f.name === k)?.type === 'select' ? null : v])) } }),
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ['workspace'] }); toast.success('Saved'); setOpen(false); },
    onError: (e) => toast.error(errText(e)),
  });
  const set = (k: string, v: unknown) => setValues(p => ({ ...p, [k]: v }));
  return <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) setValues(initial); }}><DialogTrigger asChild>{trigger}</DialogTrigger><DialogContent className="max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
      {fields.map(f => <label key={f.name} className={f.type === 'checkbox' ? 'flex items-center gap-2 text-sm' : 'block text-sm font-medium'}>
        {f.type === 'checkbox' ? <><input type="checkbox" checked={Boolean(values[f.name])} onChange={e => set(f.name, e.target.checked)} />{f.label}</> : <>{f.label}
          {f.type === 'textarea' ? <Textarea className="mt-2" rows={4} value={String(values[f.name] ?? '')} onChange={e => set(f.name, e.target.value)} />
            : f.type === 'select' ? <select className="mt-2 h-10 w-full rounded-md border border-input bg-background px-3 text-sm" required={f.required} value={String(values[f.name] ?? '')} onChange={e => set(f.name, e.target.value)}>{!f.required && <option value="">None</option>}{f.required && <option value="" disabled>Select…</option>}{f.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
            : <Input className="mt-2" type={f.type === 'number' ? 'number' : 'text'} step="0.1" required={f.required} value={String(values[f.name] ?? '')} onChange={e => set(f.name, f.type === 'number' ? Number(e.target.value) : e.target.value)} />}</>}
      </label>)}
      <Button type="submit" className="w-full" disabled={m.isPending}>{m.isPending && <Loader2 className="animate-spin" />}Save</Button>
    </form></DialogContent></Dialog>;
}

export function DeleteRequest({ entity, id, name }: { entity: 'department' | 'agent' | 'project'; id: string; name: string }) {
  const req = useServerFn(requestDeletion); const qc = useQueryClient();
  const pending = useWorkspace().approvals.some(a => a.target_id === id && a.status === 'pending');
  const m = useMutation({ mutationFn: () => req({ data: { entity, id, summary: `Delete ${entity} “${name}”` } }), onSuccess: async () => { await qc.invalidateQueries({ queryKey: ['workspace'] }); toast.success('Deletion sent for admin approval'); }, onError: e => toast.error(errText(e)) });
  return <Button size="sm" variant="ghost" className="text-destructive" disabled={pending || m.isPending} onClick={() => { if (confirm(`Request deletion of “${name}”? An admin must approve it.`)) m.mutate(); }}>{pending ? 'Deletion pending' : 'Request delete'}</Button>;
}
