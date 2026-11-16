import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Zai Agent — Internal AI command center" },
      { name: "description", content: "App Sites' internal command center for AI agents, tasks and approvals." },
      { property: "og:title", content: "Zai Agent — Internal AI command center" },
      { property: "og:description", content: "App Sites' internal command center for AI agents, tasks and approvals." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background bg-glow px-6">
      <div className="max-w-lg text-center">
        <p className="font-mono text-xs uppercase tracking-widest text-primary">App Sites · Internal use only</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-foreground">Zai Agent</h1>
        <p className="mt-3 text-muted-foreground">
          AI agent command center. Sign-in and the dashboard are being built next.
        </p>
      </div>
    </main>
  );
}
