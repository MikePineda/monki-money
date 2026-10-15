/**
 * The follow-up user turn of the single retry. Issues are VineJS messages
 * or json_extract reasons (our own text, never the model's).
 */
export function buildRetryFeedback(issues: string[]): string {
  return [
    'Your previous answer could not be used:',
    ...issues.slice(0, 10).map((issue) => `- ${issue}`),
    'Answer again with only the JSON object, in exactly the shape required by the instructions.',
  ].join('\n')
}
