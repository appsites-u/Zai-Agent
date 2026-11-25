import { createFileRoute } from '@tanstack/react-router';
import { SettingsPage } from '@/components/workspace/pages';
import { WorkspaceError } from '@/components/workspace/route-state';
import { useCan } from '@/components/workspace/common';
export const Route = createFileRoute('/_authenticated/settings')({
  head: () => ({ meta: [{ title: 'Settings — Zai Agent' }, { name: 'description', content: 'Team access and AI defaults.' }, { property: 'og:title', content: 'Settings — Zai Agent' }, { property: 'og:description', content: 'Team access and AI defaults.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' }, { name: 'robots', content: 'noindex' }] }),
  component: Gate,
  errorComponent: WorkspaceError,
});
function Gate(){return useCan('admin')?<SettingsPage/>:<p className="py-24 text-center text-muted-foreground">Admins only.</p>;}
