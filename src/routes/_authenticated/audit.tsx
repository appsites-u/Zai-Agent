import { createFileRoute } from '@tanstack/react-router';
import { AuditPage } from '@/components/workspace/pages';
import { WorkspaceError } from '@/components/workspace/route-state';
import { useCan } from '@/components/workspace/common';
export const Route = createFileRoute('/_authenticated/audit')({
  head: () => ({ meta: [{ title: 'Audit log — Zai Agent' }, { name: 'description', content: 'Recorded workspace changes.' }, { property: 'og:title', content: 'Audit log — Zai Agent' }, { property: 'og:description', content: 'Recorded workspace changes.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' }, { name: 'robots', content: 'noindex' }] }),
  component: Gate,
  errorComponent: WorkspaceError,
});
function Gate(){return useCan('admin')?<AuditPage/>:<p className="py-24 text-center text-muted-foreground">Admins only.</p>;}
