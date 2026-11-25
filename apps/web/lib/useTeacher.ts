"use client";

import { useEffect, useState } from "react";

/** "drawing" is the drawn woman, "man" the drawn man. */
export type TeacherLook = "drawing" | "man" | "photo" | "live";
export interface TeacherInfo {
  defaultLook: TeacherLook;
  photoUrl: string | null;
  /** The free live (talking video) teacher can be used right now. */
  liveAvailable: boolean;
}

let cached: Promise<TeacherInfo> | null = null;

/** How the teacher can look (fetched once per page load). Null while loading. */
export function useTeacher(): TeacherInfo | null {
  const [info, setInfo] = useState<TeacherInfo | null>(null);
  useEffect(() => {
    cached ??= fetch("/api/teacher", { cache: "no-store" })
      .then((r) => r.json() as Promise<TeacherInfo>)
      .catch(() => ({ defaultLook: "drawing" as const, photoUrl: null, liveAvailable: false }));
    let alive = true;
    void cached.then((t) => alive && setInfo(t));
    return () => {
      alive = false;
    };
  }, []);
  return info;
}

/** The look to show: the learner's choice if it's available, else the admin's default. */
export function resolveLook(info: TeacherInfo | null, chosen?: TeacherLook): TeacherLook {
  if (!info) return "drawing";
  const want = chosen ?? info.defaultLook;
  if (want === "live" && !info.liveAvailable) return info.photoUrl ? "photo" : "drawing";
  return want === "photo" && !info.photoUrl ? "drawing" : want;
}

/** What to show while the live teacher isn't (yet) on screen: the photo if there is one. */
export function stillLook(info: TeacherInfo | null): "drawing" | "man" | "photo" {
  return info?.photoUrl ? "photo" : "drawing";
}
