import { notFound } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { useFumadocsLoader } from 'fumadocs-core/source/client';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
  MarkdownCopyButton,
} from 'fumadocs-ui/layouts/docs/page';
import { Suspense, use } from 'react';
import { useMDXComponents } from '@/components/mdx';
import { baseOptions } from '@/lib/layout.shared';
import { getPageMarkdownUrl } from '@/lib/shared';
import { docs, source } from '@/lib/source';

export const loadDocsPage = createServerFn({ method: 'GET' })
  .validator((slugs: string[]) => slugs)
  .handler(async ({ data: slugs }) => {
    const page = source.getPage(slugs);
    if (!page) throw notFound();

    return {
      title: page.data.title,
      description: page.data.description,
      path: page.path,
      markdownUrl: getPageMarkdownUrl(page).url,
      pageTree: await source.serializePageTree(source.getPageTree()),
    };
  });

export function docsHead(loaderData?: {
  title?: string;
  description?: string;
}) {
  return {
    meta: [
      { title: `${loaderData?.title ?? 'Help'} · jooling Knowledge Base` },
      {
        name: 'description',
        content:
          loaderData?.description ??
          'End-user guides for managers and workers.',
      },
    ],
  };
}

function Content({ path, markdownUrl }: { path: string; markdownUrl: string }) {
  const page = docs.getPage(path);
  if (!page) throw new Error(`unknown page: ${path}`);

  const { toc } = use(page.load());
  const MDX = page.body;

  return (
    <DocsPage toc={toc}>
      <DocsTitle>{page.title}</DocsTitle>
      <DocsDescription>{page.description}</DocsDescription>
      <div className="-mt-4 flex flex-row items-center gap-2 border-b pb-6">
        <MarkdownCopyButton markdownUrl={markdownUrl} />
      </div>
      <DocsBody>
        <MDX components={useMDXComponents()} />
      </DocsBody>
    </DocsPage>
  );
}

export function DocsRoutePage({
  routeData,
}: {
  routeData: Awaited<ReturnType<typeof loadDocsPage>>;
}) {
  const { path, pageTree, markdownUrl } = useFumadocsLoader(routeData);

  return (
    <DocsLayout {...baseOptions()} tree={pageTree}>
      <Suspense>
        <Content path={path} markdownUrl={markdownUrl} />
      </Suspense>
    </DocsLayout>
  );
}
