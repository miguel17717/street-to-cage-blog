import { defineCollection, z } from 'astro:content';

const blog = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    tags: z.array(z.string()).default([]),
    issue: z.string().default('VOL_01 // STREET_TO_CAGE'),
    quickAnswer: z.string().optional(),
    heroImage: z.string().optional(),
    heroImageAlt: z.string().optional(),
    heroCaption: z.string().default('FIG_01: STREET_TO_CAGE_FIELD_NOTES'),
    author: z.string().default('STREET_TO_CAGE_CREW'),
    authorRole: z.string().default('MMA_STREETWEAR_EDITORIAL'),
    relatedDrop: z.string().default('THE_GRIT_ROUNDS'),
    relatedDropPrice: z.string().default('FIELD_NOTE'),
    fullMarkdown: z.boolean().default(false)
  })
});

export const collections = { blog };
