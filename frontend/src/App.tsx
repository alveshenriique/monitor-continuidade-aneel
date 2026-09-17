import { useEffect, useState } from 'react';
import { api, type DistribuidoraRanking, type MalhaGeoJson, type MapaUf } from './api/client';
import { CompetenciaSelector } from './components/CompetenciaSelector';
import { RankingDistribuidoras } from './components/RankingDistribuidoras';
import { MapaUf as MapaUfComponente } from './components/MapaUf';
import { Drilldown } from './components/Drilldown';
import { UfDrilldown } from './components/UfDrilldown';
import './App.css';

export default function App() {
  const [competencias, setCompetencias] = useState<string[]>([]);
  const [competencia, setCompetencia] = useState<string>('');
  const [malha, setMalha] = useState<MalhaGeoJson | null>(null);
  const [mapa, setMapa] = useState<MapaUf[]>([]);
  const [ranking, setRanking] = useState<DistribuidoraRanking[]>([]);
  const [carregandoMes, setCarregandoMes] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [selecionada, setSelecionada] = useState<DistribuidoraRanking | null>(null);
  const [ufSelecionada, setUfSelecionada] = useState<MapaUf | null>(null);

  // Carrega competências e malha geográfica uma única vez.
  useEffect(() => {
    Promise.all([api.competencias(), api.malha()])
      .then(([lista, geo]) => {
        setCompetencias(lista);
        setCompetencia(lista[0] ?? '');
        setMalha(geo);
      })
      .catch((e: Error) => setErro(e.message));
  }, []);

  // Re-busca ranking e mapa a cada troca de competência.
  useEffect(() => {
    if (!competencia) return;
    setCarregandoMes(true);
    Promise.all([api.distribuidoras(competencia), api.mapa(competencia)])
      .then(([rk, mp]) => {
        setRanking(rk);
        setMapa(mp);
        setErro(null);
      })
      .catch((e: Error) => setErro(e.message))
      .finally(() => setCarregandoMes(false));
  }, [competencia]);

  if (erro) {
    return (
      <div className="app-erro">
        <p>Não foi possível carregar o painel: {erro}</p>
        <p className="texto-muted">A API está rodando em {import.meta.env.VITE_API_URL ?? 'http://localhost:3000'}?</p>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>Monitor de Continuidade ANEEL</h1>
        <p className="subtitulo">
          Mostra onde o fornecimento de energia está piorando no Brasil e qual
          distribuidora é responsável, a partir dos dados públicos de interrupções da ANEEL.
        </p>
      </header>

      <div className="filtros">
        {competencias.length > 0 && (
          <CompetenciaSelector
            competencias={competencias}
            selecionada={competencia}
            onSelecionar={setCompetencia}
          />
        )}
      </div>

      <main className={carregandoMes ? 'conteudo carregando' : 'conteudo'}>
        <div className="painel-superior">
          {malha && (
            <MapaUfComponente
              malha={malha}
              dados={mapa}
              onSelecionar={(uf) => {
                setSelecionada(null);
                setUfSelecionada(uf);
              }}
            />
          )}

          <RankingDistribuidoras
            dados={ranking}
            selecionada={selecionada?.sig_agente ?? null}
            onSelecionar={(sig) => {
              const linha = ranking.find((r) => r.sig_agente === sig) ?? null;
              setUfSelecionada(null);
              setSelecionada((atual) => (atual?.sig_agente === sig ? null : linha));
            }}
          />
        </div>

        {selecionada && (
          <Drilldown
            sig={selecionada.sig_agente}
            nome={selecionada.distribuidora}
            onFechar={() => setSelecionada(null)}
          />
        )}

        {ufSelecionada && (
          <UfDrilldown
            uf={ufSelecionada.uf}
            ufNome={ufSelecionada.uf_nome}
            competencia={competencia}
            participacaoNacional={
              ufSelecionada.consumidor_hora /
              mapa.reduce((soma, m) => soma + m.consumidor_hora, 0)
            }
            onFechar={() => setUfSelecionada(null)}
          />
        )}
      </main>
    </div>
  );
}
