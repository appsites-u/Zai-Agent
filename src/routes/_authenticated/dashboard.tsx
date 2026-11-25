import { createFileRoute } from '@tanstack/react-router';
import { Dashboard } from '@/components/workspace/dashboard';
import { WorkspaceError } from '@/components/workspace/route-state';
export const Route = createFileRoute('/_authenticated/dashboard')({
  head: () => ({ meta: [{ title: 'Overview — Zai Agent' }, { name: 'description', content: 'Workspace overview of agents, tasks and approvals.' }, { property: 'og:title', content: 'Overview — Zai Agent' }, { property: 'og:description', content: 'Workspace overview of agents, tasks and approvals.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' }, { name: 'robots', content: 'noindex' }] }),
  component: Dashboard,
  errorComponent: WorkspaceError,
});
