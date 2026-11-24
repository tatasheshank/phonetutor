"use client";

import { remove } from "../../app/admin/lessons/actions";

/**
 * Deletes a lesson (takes it away from learners and removes its draft), after a confirmation,
 * since the app has no undo. Hand-written lessons can still be restored from git.
 */
export function DeleteLessonButton({ id, title, small }: { id: string; title: string; small?: boolean }) {
  return (
    <form
      action={remove}
      onSubmit={(e) => {
        if (!window.confirm(`Delete "${title}"?\n\nLearners will no longer see it, and this can't be undone here.`)) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button className={small ? "link-danger" : "btn danger"} type="submit" aria-label={`Delete ${title}`}>
        Delete
      </button>
    </form>
  );
}
