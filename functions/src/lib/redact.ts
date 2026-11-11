/**
 * Removes the query string of every URL in a message. A presigned S3 URL carries a signature
 * and, from a Lambda role, a session token; error messages that quote such a URL must not reach
 * the video's error field, which its owner can read, or the operators' alert e-mail.
 */
export function redactUrlQueries(text: string): string {
  // A query ends at white space, a quote, a backslash (JSON escapes) or a colon: ffprobe writes
  // "<url>: <problem>", and a presigned query never holds a raw colon.
  return text.replace(/(https?:\/\/[^\s?"'\\]+)\?[^\s"'\\:]*/g, '$1?<query removed>');
}
