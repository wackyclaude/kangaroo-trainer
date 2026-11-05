import { AVATAR_GROUPS } from "../../shared/types";

export function AvatarPicker({ value, onChange }: { value: string; onChange: (a: string) => void }) {
  return (
    <div className="avatar-groups">
      {Object.entries(AVATAR_GROUPS).map(([group, list]) => (
        <div key={group} className="avatar-group">
          <span className="avatar-group-name">{group}</span>
          <div className="avatar-grid" role="group" aria-label={`Avatars: ${group.toLowerCase()}`}>
            {list.map((a) => (
              <button key={a} type="button" className="avatar-choice" aria-pressed={a === value} onClick={() => onChange(a)}>
                {a}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
