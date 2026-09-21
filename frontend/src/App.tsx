import { useEffect, useState } from 'react';
import { api, type DistribuidoraRanking, type MalhaGeoJson, type MapaUf } from './api/client';
import { CompetenciaSelector } from './components/CompetenciaSelector';
import { RankingDistribuidoras } from './components/RankingDistribuidoras';
import { MapaUf as MapaUfComponente } from './components/MapaUf';
import { Drilldown } from './components/Drilldown';
import { UfDrilldown } from './components/UfDrilldown';
import { ToggleTema } from './components/ToggleTema';
import './App.css';

export default function App() {
  const [competencias, setCompetencias] = useState<string[]>([]);
  const [mesConsolidado, setMesConsolidado] = useState<string>('');
  const [competencia, setCompetencia] = useState<string>('');
  const [malha, setMalha] = useState<MalhaGeoJson | null>(null);
  const [mapa, setMapa] = useState<MapaUf[]>([]);
  const [ranking, setRanking] = useState<DistribuidoraRanking[]>([]);
  const [carregandoMes, setCarregandoMes] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [selecionada, setSelecionada] = useState<DistribuidoraRanking | null>(null);
  const [ufSelecionada, setUfSelecionada] = useState<MapaUf | null>(null);

  const competenciaEmConsolidacao = Boolean(
    competencia && mesConsolidado && competencia > mesConsolidado,
  );

  // Carrega competências e malha geográfica uma única vez. Abre por padrão no
  // último mês consolidado pela ANEEL, não no mais recente disponível — os
  // meses mais novos costumam vir parciais (ver CompetenciaSelector).
  useEffect(() => {
    Promise.all([api.competencias(), api.malha()])
      .then(([{ competencias: lista, mes_consolidado }, geo]) => {
        setCompetencias(lista);
        setMesConsolidado(mes_consolidado);
        setCompetencia(lista.includes(mes_consolidado) ? mes_consolidado : (lista[0] ?? ''));
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
        <div className="app-header-topo">
          <div>
            <h1>Monitor de Continuidade ANEEL</h1>
            <p className="subtitulo">
              Mostra onde o fornecimento de energia está piorando no Brasil e qual
              distribuidora é responsável, a partir dos dados públicos de interrupções da ANEEL.
            </p>
          </div>
          <ToggleTema />
        </div>
      </header>

      <div className="filtros">
        {competencias.length > 0 && (
          <CompetenciaSelector
            competencias={competencias}
            selecionada={competencia}
            mesConsolidado={mesConsolidado}
            onSelecionar={setCompetencia}
          />
        )}
        {competenciaEmConsolidacao && (
          <div className="aviso-parcial" role="status">
            <strong>Em consolidação pela ANEEL</strong>
            <span>
              Este mês ainda está sendo apurado na origem: os números aqui podem
              subir conforme a ANEEL publica o restante do período.
            </span>
          </div>
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
            competencia={competencia}
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
