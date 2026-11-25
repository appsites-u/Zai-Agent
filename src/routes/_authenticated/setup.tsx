import { createFileRoute } from '@tanstack/react-router';
import { SetupPage } from '@/components/workspace/pages';
import { WorkspaceError } from '@/components/workspace/route-state';
export const Route = createFileRoute('/_authenticated/setup')({
  head: () => ({ meta: [{ title: 'Workspace setup — Zai Agent' }, { name: 'description', content: 'Steps to connect Cloudflare Workers AI.' }, { property: 'og:title', content: 'Workspace setup — Zai Agent' }, { property: 'og:description', content: 'Steps to connect Cloudflare Workers AI.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' }, { name: 'robots', content: 'noindex' }] }),
  component: SetupPage,
  errorComponent: WorkspaceError,
});
