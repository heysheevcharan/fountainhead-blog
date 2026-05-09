import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const blog = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),

    image: z.string().optional(),
    tags: z.array(z.string()).optional(),
    draft: z.boolean().optional().default(false),
  }),
});

const pages = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/site-pages' }),
  schema: z.object({
    title: z.string(),
    slug: z.string(),
    description: z.string().optional(),
    showInNav: z.boolean().default(true),
    navOrder: z.number().default(99),
  }),
});

const home = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/home' }),
  schema: z.object({
    title: z.string(),
    slug: z.string(),
    showInNav: z.boolean().default(true),
    navOrder: z.number().default(1),
    name: z.string().optional(),
    tagline: z.string().optional(),
    email: z.string().optional(),
    github: z.string().optional(),
    twitter: z.string().optional(),
    linkedin: z.string().optional(),
  }),
});

const travel = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/travel' }),
  schema: z.object({
    location: z.string(),
    country: z.string(),
    dateRange: z.string().optional(),
    sortDate: z.coerce.date(),
    images: z.array(z.string()),
    description: z.string().optional(),
  }),
});

export const collections = { blog, pages, home, travel };
