import { createFileRoute } from '@tanstack/react-router';
import { AgentsPage } from '@/components/workspace/pages';
import { WorkspaceError } from '@/components/workspace/route-state';
export const Route = createFileRoute('/_authenticated/agents')({
  head: () => ({ meta: [{ title: 'Agents — Zai Agent' }, { name: 'description', content: 'Registry of AI agents and their models.' }, { property: 'og:title', content: 'Agents — Zai Agent' }, { property: 'og:description', content: 'Registry of AI agents and their models.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' }, { name: 'robots', content: 'noindex' }] }),
  component: AgentsPage,
  errorComponent: WorkspaceError,
});
