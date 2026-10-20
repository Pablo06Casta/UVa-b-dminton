/**
 * Marcador por sets desde el punto de vista de la UVa: cada set en una casilla, resaltado si lo gana la UVa.
 * Si el texto no es un resultado por sets («W.O.», «Retirada»…), se muestra tal cual.
 */
export function SetScores({ score }: { score: string }) {
  const tokens = score.split(/\s+/).filter(Boolean);
  const sets = tokens.filter((t) => /^\d+-\d+$/.test(t));
  const rest = tokens.filter((t) => !/^\d+-\d+$/.test(t)).join(' ');
  if (sets.length === 0) return <span className="setscores__text">{score}</span>;
  return (
    <span className="setscores" role="img" aria-label={`Sets: ${sets.join(', ')}${rest ? ` ${rest}` : ''}`}>
      {sets.map((s, i) => {
        const [a, b] = s.split('-').map(Number);
        return (
          <span key={i} className={`set${a > b ? ' set--won' : ' set--lost'}`}>
            <b>{a}</b>
            <i>{b}</i>
          </span>
        );
      })}
      {rest && <span className="setscores__text">{rest}</span>}
    </span>
  );
}
