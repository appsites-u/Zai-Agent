import { createFileRoute } from '@tanstack/react-router';
import { IntegrationsPage } from '@/components/workspace/pages';
import { WorkspaceError } from '@/components/workspace/route-state';
export const Route = createFileRoute('/_authenticated/integrations')({
  head: () => ({ meta: [{ title: 'Integrations — Zai Agent' }, { name: 'description', content: 'Truthful status of connected services.' }, { property: 'og:title', content: 'Integrations — Zai Agent' }, { property: 'og:description', content: 'Truthful status of connected services.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' }, { name: 'robots', content: 'noindex' }] }),
  component: IntegrationsPage,
  errorComponent: WorkspaceError,
});
