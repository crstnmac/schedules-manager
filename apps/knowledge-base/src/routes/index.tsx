import { createFileRoute } from '@tanstack/react-router';
import { DocsRoutePage, docsHead, loadDocsPage } from '@/components/docs-page';
import { docs } from '@/lib/source';

export const Route = createFileRoute('/')({
  component: Page,
  loader: async () => {
    const data = await loadDocsPage({ data: [] });
    await docs.getPage(data.path)?.preload();
    return data;
  },
  head: ({ loaderData }) => docsHead(loaderData),
});

function Page() {
  return <DocsRoutePage routeData={Route.useLoaderData()} />;
}
