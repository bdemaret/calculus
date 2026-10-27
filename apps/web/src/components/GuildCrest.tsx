/** Blason d'une guilde s'il y en a un, sinon l'initiale de son nom dans un écu. */
export function GuildCrest({ name, crest, className }: { name: string; crest: string | null; className?: string }) {
  const cls = className ? `crest ${className}` : "crest";
  if (crest) return <img className={`${cls} has-image`} src={crest} alt="" width={40} height={40} />;
  return (
    <span className={cls} aria-hidden="true">
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}
