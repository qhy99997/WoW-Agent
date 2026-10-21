import type { QuestionAnswers, QuestionItem } from '@shared/contract';

/**
 * Build the answer map the engine expects.
 *
 * A single-select question is keyed by its own text (`{'Which db?': 'SQLite'}`),
 * while a multi-select question is keyed by each chosen option label with the
 * value `true` (`{Postgres: true, MySQL: true}`). Mixing the two shapes makes
 * the model read the wrong thing, so the mapping lives here and is tested.
 */
export function buildAnswers(
  questions: readonly QuestionItem[],
  selections: Readonly<Record<string, readonly string[]>>,
): QuestionAnswers {
  const answers: QuestionAnswers = {};
  for (const item of questions) {
    const picked = selections[item.question] ?? [];
    if (item.multiSelect) {
      for (const label of picked) answers[label] = true;
      continue;
    }
    const only = picked[0];
    if (only !== undefined) answers[item.question] = only;
  }
  return answers;
}

/** A question counts as answered only when at least one option was picked. */
export function isComplete(
  questions: readonly QuestionItem[],
  selections: Readonly<Record<string, readonly string[]>>,
): boolean {
  return questions.every((item) => (selections[item.question] ?? []).length > 0);
}
