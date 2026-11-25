// Shared by server pages and browser components (no "use client", no server-only).

/** Plain words (English) for a media error, for admins. Learners see a short line in their language. */
export function mediaErrorMessage(code: string): string {
  if (code === "youtube-100") return "This YouTube video was removed or made private.";
  // YouTube also uses 101/150 for videos that no longer exist, so say both.
  if (code === "youtube-101" || code === "youtube-150") return "This YouTube video can't be shown here: its owner blocks embedding, or it was removed.";
  if (code === "youtube-2") return "This YouTube link isn't valid.";
  if (code === "youtube-script") return "YouTube couldn't be reached.";
  if (code.startsWith("youtube")) return "This YouTube video couldn't be played.";
  return "This video couldn't be played.";
}
