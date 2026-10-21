import { describe, expect, it } from 'vitest';

import type { QuestionItem } from '@shared/contract';

import { buildAnswers, isComplete } from '../src/renderer/src/questions';

function single(question: string, labels: string[]): QuestionItem {
  return {
    question,
    options: labels.map((label) => ({ label })),
    multiSelect: false,
  };
}

function multi(question: string, labels: string[]): QuestionItem {
  return {
    question,
    options: labels.map((label) => ({ label })),
    multiSelect: true,
  };
}

describe('buildAnswers', () => {
  it('keys a single-select answer by the question text', () => {
    const questions = [single('Which database?', ['SQLite', 'Postgres'])];

    expect(buildAnswers(questions, { 'Which database?': ['SQLite'] })).toEqual({
      'Which database?': 'SQLite',
    });
  });

  it('keys a multi-select answer by each chosen label with true', () => {
    const questions = [multi('Pick stores', ['Postgres', 'Redis'])];

    expect(buildAnswers(questions, { 'Pick stores': ['Postgres', 'Redis'] })).toEqual({
      Postgres: true,
      Redis: true,
    });
  });

  it('keeps a multi-select answer out of the question-text key', () => {
    const questions = [multi('Pick stores', ['Postgres'])];

    const answers = buildAnswers(questions, { 'Pick stores': ['Postgres'] });

    expect(answers['Pick stores']).toBeUndefined();
  });

  it('handles several questions of mixed kinds at once', () => {
    const questions = [single('Which db?', ['SQLite', 'Postgres']), multi('Pick stores', ['S3', 'GCS'])];

    expect(
      buildAnswers(questions, {
        'Which db?': ['SQLite'],
        'Pick stores': ['S3'],
      }),
    ).toEqual({ 'Which db?': 'SQLite', S3: true });
  });

  it('omits questions that were left unanswered', () => {
    const questions = [single('A?', ['x', 'y']), single('B?', ['z'])];

    expect(buildAnswers(questions, { 'A?': ['x'], 'B?': [] })).toEqual({ 'A?': 'x' });
  });

  it('returns an empty map when nothing was chosen', () => {
    expect(buildAnswers([single('A?', ['x'])], {})).toEqual({});
  });

  it('takes only the first pick of a single-select question', () => {
    const questions = [single('A?', ['x', 'y'])];

    expect(buildAnswers(questions, { 'A?': ['x', 'y'] })).toEqual({ 'A?': 'x' });
  });

  it('accepts an empty question list', () => {
    expect(buildAnswers([], {})).toEqual({});
  });
});

describe('isComplete', () => {
  it('is true when every question has a pick', () => {
    const questions = [single('A?', ['x']), multi('B?', ['y'])];

    expect(isComplete(questions, { 'A?': ['x'], 'B?': ['y'] })).toBe(true);
  });

  it('is false when any question is unanswered', () => {
    const questions = [single('A?', ['x']), single('B?', ['y'])];

    expect(isComplete(questions, { 'A?': ['x'], 'B?': [] })).toBe(false);
  });

  it('is false when a question is missing from the map', () => {
    expect(isComplete([single('A?', ['x'])], {})).toBe(false);
  });

  it('is vacuously true with no questions', () => {
    expect(isComplete([], {})).toBe(true);
  });
});
