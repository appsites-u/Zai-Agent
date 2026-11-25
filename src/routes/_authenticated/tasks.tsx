import { createFileRoute } from '@tanstack/react-router';
import { TasksPage } from '@/components/workspace/pages';
import { WorkspaceError } from '@/components/workspace/route-state';
export const Route = createFileRoute('/_authenticated/tasks')({
  head: () => ({ meta: [{ title: 'Tasks & runs — Zai Agent' }, { name: 'description', content: 'Run tasks with AI agents and review every attempt.' }, { property: 'og:title', content: 'Tasks & runs — Zai Agent' }, { property: 'og:description', content: 'Run tasks with AI agents and review every attempt.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' }, { name: 'robots', content: 'noindex' }] }),
  component: TasksPage,
  errorComponent: WorkspaceError,
});
