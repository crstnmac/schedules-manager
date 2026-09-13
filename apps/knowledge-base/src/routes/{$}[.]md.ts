import { decodeMarkdownUrl } from '@/lib/shared';
import { docsLlms, source } from '@/lib/source';
import { createFileRoute, notFound } from '@tanstack/react-router';

export const Route = createFileRoute('/{$}.md')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const slugs = decodeMarkdownUrl(params._splat?.split('/') ?? []);
        const page = source.getPage(slugs);
        if (!page) throw notFound();

        return new Response(await docsLlms.page(page), {
          headers: {
            'Content-Type': 'text/markdown',
          },
        });
      },
    },
  },
});
