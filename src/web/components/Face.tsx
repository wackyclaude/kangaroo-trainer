/** A profile's face: their own picture when they uploaded one, otherwise the emoji avatar. */
export function Face({ avatar, photo, className = "" }: { avatar: string; photo?: string | null; className?: string }) {
  if (photo) return <img className={`face-photo ${className}`} src={photo} alt="" draggable={false} />;
  return (
    <span className={`face-emoji ${className}`} aria-hidden="true">
      {avatar}
    </span>
  );
}
