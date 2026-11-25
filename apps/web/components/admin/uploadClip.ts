"use client";

/**
 * Uploads one clip (or poster) to a lesson draft, reporting progress. One file per request keeps
 * each upload under tunnel and proxy size limits.
 */
export function uploadClip(
  lessonId: string,
  file: File,
  opts: { stepId?: string } = {},
  onProgress?: (percent: number) => void,
): Promise<{ stepId: string }> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.set("file", file);
    form.set("label", file.name);
    if (opts.stepId) form.set("stepId", opts.stepId);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/admin/lessons/${encodeURIComponent(lessonId)}/media`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      let data: { stepId?: string; error?: string } = {};
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        /* not JSON */
      }
      if (xhr.status >= 200 && xhr.status < 300 && data.stepId) resolve({ stepId: data.stepId });
      else reject(new Error(data.error ?? `Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error("Network error while uploading."));
    xhr.send(form);
  });
}

/** A video file's length in seconds, read by the browser (null if it can't tell). */
export function videoDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    const done = (d: number | null) => {
      URL.revokeObjectURL(url);
      resolve(d);
    };
    v.preload = "metadata";
    v.onloadedmetadata = () => done(Number.isFinite(v.duration) ? v.duration : null);
    v.onerror = () => done(null);
    setTimeout(() => done(null), 8000);
    v.src = url;
  });
}
