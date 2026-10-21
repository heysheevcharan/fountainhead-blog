// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';

/** Strips remark-rehype's default `user-content-` clobberPrefix from ids/hrefs (e.g. #user-content-fn-1 -> #fn-1). */
function rehypeCleanClobberPrefix() {
  const clean = (value) =>
    typeof value === 'string' ? value.replace(/user-content-(?=[^\s"'>/]+)/g, '') : value;

  const walk = (node) => {
    if (!node) return;
    const props = node.properties;
    if (props) {
      for (const key of Object.keys(props)) {
        const value = props[key];
        if (typeof value === 'string') {
          props[key] = clean(value);
        } else if (Array.isArray(value)) {
          props[key] = value.map(clean);
        }
      }
    }
    const children = node.children;
    if (Array.isArray(children)) {
      for (const child of children) walk(child);
    }
  };

  return (tree) => walk(tree);
}

// https://astro.build/config
export default defineConfig({
  site: 'https://sheevcharan.com',
  integrations: [
    mdx(),
    sitemap({
      filter: (page) => !page.includes('/admin'),
      changefreq: 'weekly',
      priority: 0.7,
    }),
  ],
  markdown: {
    rehypePlugins: [rehypeCleanClobberPrefix],
    shikiConfig: {
      theme: 'github-dark',
      wrap: true,
    },
  },
});
