import { createFileRoute } from '@tanstack/react-router';
import { ProjectsPage } from '@/components/workspace/pages';
import { WorkspaceError } from '@/components/workspace/route-state';
export const Route = createFileRoute('/_authenticated/projects')({
  head: () => ({ meta: [{ title: 'Projects — Zai Agent' }, { name: 'description', content: 'Projects and their tasks.' }, { property: 'og:title', content: 'Projects — Zai Agent' }, { property: 'og:description', content: 'Projects and their tasks.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' }, { name: 'robots', content: 'noindex' }] }),
  component: ProjectsPage,
  errorComponent: WorkspaceError,
});
