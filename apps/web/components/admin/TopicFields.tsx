import { TOPICS, normalizeTopicId, topicInfo } from "@ai-tutor/shared";

/**
 * Topic picker for a lesson: the known topics, or "Other" with a new topic name (e.g. "Excel basics").
 * Posts `topic` (an id, or "other") and `newTopic`.
 */
export function TopicFields({ current, disabled }: { current?: string; disabled?: boolean }) {
  const id = current ? normalizeTopicId(current) : "";
  const known = TOPICS.some((t) => t.id === id);
  return (
    <div className="row topic-fields">
      <label className="field">
        <span>Topic (learners pick a topic first, then its lessons)</span>
        <select className="input" name="topic" defaultValue={known ? id : id ? "other" : TOPICS[0]!.id} disabled={disabled}>
          {TOPICS.map((t) => (
            <option key={t.id} value={t.id}>
              {t.emoji} {t.name.en}
            </option>
          ))}
          <option value="other">Other (type a new topic) →</option>
        </select>
      </label>
      <label className="field">
        <span>New topic name (only for Other)</span>
        <input
          className="input"
          type="text"
          name="newTopic"
          maxLength={60}
          placeholder="e.g. Excel basics"
          defaultValue={known || !id ? "" : topicInfo(id).name.en}
          disabled={disabled}
        />
      </label>
    </div>
  );
}
