import { z } from 'zod';

const text = (max: number) => z.string().trim().min(1).max(max);

export const outlineSchema = z.object({
  known: z.boolean().optional(),
  kind: z.enum(['book', 'topic']).optional(),
  title: z.string().trim().max(200).nullish(),
  author: z.string().trim().max(200).nullish(),
  // Checked against the icon list later; an unknown name just means no icon.
  icon: z.string().trim().max(40).nullish(),
  units: z.array(z.object({ title: text(200) })).max(80),
});
export type Outline = z.infer<typeof outlineSchema>;

const quizFields = {
  options: z.array(text(160)).min(2).max(5).nullish(),
  answer: z.number().int().min(0).nullish(),
};

type QuizShape = { options?: string[] | null; answer?: number | null };

function validQuiz(card: QuizShape): boolean {
  return Boolean(card.options) && card.answer != null && card.answer < card.options!.length;
}

const QUIZ_MESSAGE = 'quiz cards need "options" (2 to 5 answers) and an "answer" index pointing at one of them';

export const cardSchema = z
  .object({
    type: z.enum(['summary', 'key_idea', 'recall', 'quiz']),
    front: text(700),
    back: z.string().trim().max(500).nullish(),
    ...quizFields,
  })
  .refine((card) => card.type !== 'recall' || Boolean(card.back), {
    message: 'recall cards need a non-empty "back" answer',
    path: ['back'],
  })
  .refine((card) => card.type !== 'quiz' || validQuiz(card), { message: QUIZ_MESSAGE, path: ['options'] });
export type GeneratedCard = z.infer<typeof cardSchema>;

export const unitContentSchema = z.object({
  summary: text(2000),
  cards: z.array(cardSchema).min(3).max(24),
});
export type UnitContent = z.infer<typeof unitContentSchema>;

export const rewrittenCardSchema = z.object({
  front: text(700),
  back: z.string().trim().max(500).nullish(),
  ...quizFields,
});
export type RewrittenCard = z.infer<typeof rewrittenCardSchema>;

// A rewrite of a quiz card must still be a usable quiz.
export const rewrittenQuizSchema = rewrittenCardSchema.refine(validQuiz, { message: QUIZ_MESSAGE, path: ['options'] });

export const MAX_PLAN_DAYS = 365;

export const chatActionSchema = z.object({
  action: z.literal('set_plan'),
  days: z.number().int().min(1).max(MAX_PLAN_DAYS),
});
export type ParsedChatAction = z.infer<typeof chatActionSchema>;
