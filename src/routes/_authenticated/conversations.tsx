import { createFileRoute } from '@tanstack/react-router';
import { ConversationsPage } from '@/components/workspace/pages';
import { WorkspaceError } from '@/components/workspace/route-state';
export const Route = createFileRoute('/_authenticated/conversations')({
  head: () => ({ meta: [{ title: 'Conversations — Zai Agent' }, { name: 'description', content: 'Private chat with your agents.' }, { property: 'og:title', content: 'Conversations — Zai Agent' }, { property: 'og:description', content: 'Private chat with your agents.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' }, { name: 'robots', content: 'noindex' }] }),
  component: ConversationsPage,
  errorComponent: WorkspaceError,
});
