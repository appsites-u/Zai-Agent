import { createFileRoute } from '@tanstack/react-router';
import { DepartmentsPage } from '@/components/workspace/pages';
import { WorkspaceError } from '@/components/workspace/route-state';
export const Route = createFileRoute('/_authenticated/departments')({
  head: () => ({ meta: [{ title: 'Departments — Zai Agent' }, { name: 'description', content: 'Manage App Sites departments.' }, { property: 'og:title', content: 'Departments — Zai Agent' }, { property: 'og:description', content: 'Manage App Sites departments.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' }, { name: 'robots', content: 'noindex' }] }),
  component: DepartmentsPage,
  errorComponent: WorkspaceError,
});
