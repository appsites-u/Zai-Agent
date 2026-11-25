import { createFileRoute } from '@tanstack/react-router';
import { ApprovalsPage } from '@/components/workspace/pages';
import { WorkspaceError } from '@/components/workspace/route-state';
export const Route = createFileRoute('/_authenticated/approvals')({
  head: () => ({ meta: [{ title: 'Approvals — Zai Agent' }, { name: 'description', content: 'Admin decisions on deletions and gated runs.' }, { property: 'og:title', content: 'Approvals — Zai Agent' }, { property: 'og:description', content: 'Admin decisions on deletions and gated runs.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' }, { name: 'robots', content: 'noindex' }] }),
  component: ApprovalsPage,
  errorComponent: WorkspaceError,
});
