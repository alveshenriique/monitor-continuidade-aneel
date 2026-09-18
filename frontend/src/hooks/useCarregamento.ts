import { useEffect, useState } from 'react';

/**
 * Busca um dado assíncrono toda vez que `deps` muda, descartando a resposta
 * se uma busca mais nova já tiver começado antes dela voltar (evita que uma
 * resposta antiga e lenta sobrescreva uma mais recente).
 */
export function useCarregamento<T>(
  buscar: () => Promise<T>,
  deps: unknown[],
): { dado: T | null; erro: string | null } {
  const [dado, setDado] = useState<T | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  // oxlint-disable-next-line react-hooks/exhaustive-deps -- deps é repassado pelo chamador de propósito
  useEffect(() => {
    let cancelado = false;
    setDado(null);
    setErro(null);
    buscar()
      .then((d) => {
        if (!cancelado) setDado(d);
      })
      .catch((e: Error) => {
        if (!cancelado) setErro(e.message);
      });
    return () => {
      cancelado = true;
    };
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- deps vem do chamador, não é um array literal de propósito
  }, deps);

  return { dado, erro };
}
