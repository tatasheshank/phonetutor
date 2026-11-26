"use client";

import type { AgentEvent } from "@ai-tutor/shared";
import { useEffect, useState } from "react";

export type SlideState = Extract<AgentEvent, { type: "board_slide" }>;

/**
 * The classroom board while the teacher talks: a heading, a few key points written in chalk, and
 * a picture when the lesson has one. Points appear one after another, like a teacher writing them.
 * A picture that fails to load is simply left out.
 */
export function SlideBoard({ slide }: { slide: SlideState }) {
  const [badImage, setBadImage] = useState<string | null>(null);
  const image = slide.image && slide.image.src !== badImage ? slide.image : null;
  // Re-run the write-in animation for each new slide.
  const [key, setKey] = useState(0);
  useEffect(() => setKey((k) => k + 1), [slide.stepId, slide.heading, slide.points.join("|")]);

  return (
    <div className="board">
      <div className={`slide-frame${image ? " with-image" : ""}`} key={key}>
        {image && (
          <figure className="slide-picture">
            {/* eslint-disable-next-line @next/next/no-img-element -- lesson media, sized by CSS */}
            <img src={image.src} alt={slide.heading ?? ""} onError={() => setBadImage(image.src)} />
            {image.credit && <figcaption>{image.credit}</figcaption>}
          </figure>
        )}
        {(slide.heading || slide.points.length > 0) && (
          <div className="slide-text">
            {slide.heading && <h3 className="slide-heading">{slide.heading}</h3>}
            {slide.points.length > 0 && (
              <ul className="slide-points">
                {slide.points.map((p, i) => (
                  <li key={i} style={{ animationDelay: `${0.25 + i * 0.6}s` }}>
                    {p}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
