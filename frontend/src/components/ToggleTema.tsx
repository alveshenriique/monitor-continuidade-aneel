import { useState } from 'react';

type Tema = 'light' | 'dark';

// Mesma chave usada no script anti-flash em index.html — os dois precisam
// ficar em sincronia.
const CHAVE_LOCALSTORAGE = 'tema';

function lerTemaAtual(): Tema {
  // O script em index.html já rodou antes do React montar e deixou o
  // atributo certo em <html> — só lemos o que ele decidiu.
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

export function ToggleTema() {
  const [tema, setTema] = useState<Tema>(lerTemaAtual);
  const escuro = tema === 'dark';

  function alternar() {
    const novo: Tema = escuro ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', novo);
    try {
      localStorage.setItem(CHAVE_LOCALSTORAGE, novo);
    } catch {
      // localStorage pode falhar (modo privado, cota cheia etc.) — a troca
      // ainda funciona nesta sessão, só não persiste pro próximo carregamento.
    }
    setTema(novo);
  }

  return (
    <button
      type="button"
      className="botao-tema"
      onClick={alternar}
      aria-label={escuro ? 'Ativar tema claro' : 'Ativar tema escuro'}
      aria-pressed={escuro}
    >
      {escuro ? '☀' : '☾'}
    </button>
  );
}
