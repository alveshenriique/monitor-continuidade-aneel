import type { ReactNode } from 'react';

interface Props {
  tituloId: string;
  titulo: string;
  subtitulo: ReactNode;
  onFechar: () => void;
}

export function CabecalhoModal({ tituloId, titulo, subtitulo, onFechar }: Props) {
  return (
    <div className="cartao-cabecalho">
      <div>
        <h2 id={tituloId}>{titulo}</h2>
        <p className="subtitulo">{subtitulo}</p>
      </div>
      <button className="botao-fechar" onClick={onFechar} aria-label="Fechar detalhe">
        ✕
      </button>
    </div>
  );
}
