import { createFileRoute, Link } from '@tanstack/react-router';
import { HomeLayout } from 'fumadocs-ui/layouts/home';
import { baseOptions } from '@/lib/layout.shared';

export const Route = createFileRoute('/')({
  component: Home,
});

function Home() {
  return (
    <HomeLayout {...baseOptions()}>
      <div className="flex flex-col flex-1 justify-center px-4 py-8 text-center">
        <p className="mb-2 text-sm text-fd-muted-foreground">jooling</p>
        <h1 className="font-medium text-2xl mb-3">Knowledge Base</h1>
        <p className="mx-auto mb-6 max-w-xl text-fd-muted-foreground">
          Learn the complete scheduling workflow, from workplace setup to published
          schedules, time tracking, coverage, and day-to-day operations.
        </p>
        <Link
          to="/docs/$"
          params={{
            _splat: '',
          }}
          className="px-3 py-2 rounded-lg bg-fd-primary text-fd-primary-foreground font-medium text-sm mx-auto"
        >
          Browse the knowledge base
        </Link>
      </div>
    </HomeLayout>
  );
}
