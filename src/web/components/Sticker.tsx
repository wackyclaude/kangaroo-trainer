interface Props {
  avatar: string;
  name: string;
  tint: number;
  small?: boolean;
  note?: string;
  onClick?: () => void;
}

/** A round "sticker" with an avatar, used to pick who is practising. */
export function Sticker({ avatar, name, tint, small, note, onClick }: Props) {
  return (
    <button type="button" className={`sticker${small ? " small" : ""}`} onClick={onClick} aria-label={`${name}${note ? `, ${note}` : ""}`}>
      <span className={`sticker-face tint-${tint % 6}`} aria-hidden="true">
        {avatar}
      </span>
      <span className="sticker-name">{name}</span>
      {note && <span className="locked-note">{note}</span>}
    </button>
  );
}
