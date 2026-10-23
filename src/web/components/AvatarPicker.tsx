import { AVATARS } from "../../shared/types";

export function AvatarPicker({ value, onChange }: { value: string; onChange: (a: string) => void }) {
  return (
    <div className="avatar-grid" role="group" aria-label="Choose an avatar">
      {AVATARS.map((a) => (
        <button key={a} type="button" className="avatar-choice" aria-pressed={a === value} onClick={() => onChange(a)}>
          {a}
        </button>
      ))}
    </div>
  );
}
