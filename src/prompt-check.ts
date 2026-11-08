/**
 * Whether a user prompt counts as a question: the text, with trailing
 * whitespace removed, ends with "?". Empty or whitespace-only text is
 * false; a lone "?" is true.
 */
export function isQuestionPrompt(text: string): boolean {
  const trimmed = text.trimEnd()
  return trimmed.length > 0 && trimmed.endsWith("?")
}
