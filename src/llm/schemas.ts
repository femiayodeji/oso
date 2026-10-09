import { z } from 'zod';

const text = (max: number) => z.string().trim().min(1).max(max);

export const outlineSchema = z.object({
  known: z.boolean().optional(),
  chapters: z.array(z.object({ title: text(200) })).max(80),
});
export type Outline = z.infer<typeof outlineSchema>;

export const cardSchema = z
  .object({
    type: z.enum(['summary', 'key_idea', 'recall']),
    front: text(700),
    back: z.string().trim().max(500).nullish(),
  })
  .refine((card) => card.type !== 'recall' || Boolean(card.back), {
    message: 'recall cards need a non-empty "back" answer',
    path: ['back'],
  });
export type GeneratedCard = z.infer<typeof cardSchema>;

export const chapterContentSchema = z.object({
  summary: text(2000),
  cards: z.array(cardSchema).min(3).max(24),
});
export type ChapterContent = z.infer<typeof chapterContentSchema>;

export const rewrittenCardSchema = z.object({
  front: text(700),
  back: z.string().trim().max(500).nullish(),
});
export type RewrittenCard = z.infer<typeof rewrittenCardSchema>;

export const MAX_PLAN_DAYS = 365;

export const chatActionSchema = z.object({
  action: z.literal('set_plan'),
  days: z.number().int().min(1).max(MAX_PLAN_DAYS),
});
export type ParsedChatAction = z.infer<typeof chatActionSchema>;
