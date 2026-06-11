//! Declares the project's Astro content collections.

import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const projects = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/projects" }),
  schema: z.object({
    name: z.string(),
    code: z.string(),
    summary: z.string(),
    year: z.number().int(),
    status: z.enum(["online", "building", "archived"]),
    website: z.url().nullable(),
    repository: z.url().nullable(),
    featured: z.boolean().default(false),
    order: z.number().int(),
    technologies: z.array(z.string()).min(1),
    accent: z.enum(["cyan", "violet", "amber", "rose"]),
  }),
});

export const collections = { projects };
