import { getCollection } from 'astro:content';

const formatDate = (date: Date) => date.toISOString().split('T')[0];

export async function GET({ site }: { site: URL }) {
  const posts = await getCollection('blog');
  const base = site.toString();
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
  const path = (pathname: string) => `${basePath}${pathname}`;
  const urls = [
    { loc: new URL(path('/'), base).toString(), lastmod: formatDate(new Date()) },
    ...posts.map((post) => ({
      loc: new URL(path(`/blog/${post.slug}/`), base).toString(),
      lastmod: formatDate(post.data.updatedDate ?? post.data.pubDate)
    }))
  ];

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (url) => `  <url>
    <loc>${url.loc}</loc>
    <lastmod>${url.lastmod}</lastmod>
  </url>`
  )
  .join('\n')}
</urlset>`;

  return new Response(body, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8'
    }
  });
}
