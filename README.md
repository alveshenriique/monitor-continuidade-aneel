# Monitor de Continuidade — Distribuidoras de Energia (ANEEL)

Painel que mostra **onde o fornecimento de energia está piorando no Brasil e qual
distribuidora é responsável**, a partir dos dados públicos de interrupções da ANEEL —
e que se atualiza sozinho a cada publicação mensal da Agência, em vez de ser uma
análise pontual.

## Problema

A ANEEL publica mensalmente os dados de toda interrupção de energia registrada nas
redes de distribuição do Brasil — milhões de linhas por ano, no nível de cada evento
individual. É um dado público valioso, mas bruto: não existe uma forma direta de
responder, olhando pra ele, perguntas simples como "que estado piorou este mês?" ou
"qual distribuidora está deixando a desejar?". Sem processamento, o dado fica
inacessível pra quem não é analista de dados — e mesmo pra quem é, refazer esse
processamento toda vez que a ANEEL publica um mês novo não escala.

## Solução

Um pipeline que lê o dado bruto, calcula os indicadores regulatórios de continuidade
(DEC/FEC, conforme o Módulo 8 do PRODIST) e os expõe num painel web com três
perguntas centrais:

- **Onde está piorando** — mapa do Brasil colorido por UF pelo consumidor-hora
  perdido no mês.
- **Quem piorou** — ranking nacional de distribuidoras pela variação do DEC em
  relação à média dos meses anteriores, e, ao clicar num estado do mapa, o mesmo
  tipo de ranking localizado: quem atua ali e como está indo nesse estado
  especificamente.
- **Como uma distribuidora está evoluindo** — ao clicar numa linha do ranking, série
  temporal do DEC mês a mês e quebra por causa da interrupção (programada vs.
  não programada, meio ambiente, falha operacional etc.).

O pipeline é reexecutável: consulta a API do catálogo da ANEEL a cada rodada e só
baixa/reprocessa quando o dado na origem realmente mudou. Isso é o que permite rodar
o mesmo processo todo mês, sem intervenção manual, em vez de ser uma análise que
serve só uma vez.

## Fonte de dados

Dados públicos da ANEEL — [Interrupções de Energia Elétrica nas Redes de
Distribuição](https://dadosabertos.aneel.gov.br), Portal de Dados Abertos, licença
ODbL. A ANEEL publica um arquivo Parquet por ano de competência, atualizado
mensalmente; este projeto usa **só o arquivo do ano corrente**, que é o único com
código de município (IBGE) por interrupção — os anos anteriores têm outro schema, sem
essa granularidade geográfica, e ficam fora do escopo.

## Arquitetura

```
ANEEL (CKAN)  →  pipeline (Python + DuckDB)  →  indicadores.duckdb  →  API (NestJS)  →  painel (React)
```

- **`pipeline/`** — `ingest.py` baixa o Parquet do ano corrente de forma idempotente
  (só rebaixa se o `last_modified` mudou na origem); `transform.py` limpa o dado
  (exclui expurgos regulatórios, capa outliers), calcula DEC/FEC e gera as tabelas
  agregadas em `data/processed/indicadores.duckdb`.
- **`api/`** — NestJS abrindo esse `.duckdb` em modo somente-leitura e servindo os
  indicadores já prontos via HTTP. Não há banco-servidor: o arquivo gerado pelo
  pipeline *é* o banco.
- **`frontend/`** — React + Vite consumindo a API. Sem biblioteca de gráficos/mapa —
  o choropleth e os gráficos são SVG escritos à mão, pra manter o bundle pequeno e
  ter controle total sobre acessibilidade e paleta de cores.

## Como rodar do zero

Pré-requisito único: [Docker](https://docs.docker.com/get-docker/) (com Docker
Compose — já vem incluso no Docker Desktop, no Windows e no Mac).

```bash
git clone https://github.com/alveshenriique/monitor-continuidade-aneel.git
cd monitor-continuidade-aneel
docker compose up
```

- Painel: [http://localhost:8080](http://localhost:8080)
- API: [http://localhost:3000](http://localhost:3000) (`/health` pra checar se subiu)

A primeira subida usa um **seed pequeno já processado**, commitado no repositório
(`data/seed/indicadores.duckdb`, poucos MB), então o painel mostra dado real na hora,
sem precisar baixar nem reprocessar nada. Pra buscar o dado mais recente publicado
pela ANEEL e reprocessar os indicadores:

```bash
docker compose --profile backfill run --rm pipeline
docker compose restart api
```

Isso baixa o Parquet do ano corrente (~200 MB) e regenera
`data/processed/indicadores.duckdb`. Rodar mensalmente esse comando (ou um agendador
equivalente) é como o painel se mantém atualizado com a publicação da ANEEL — e é
exatamente isso que o workflow `.github/workflows/backfill-mensal.yml` automatiza: todo
dia 2 do mês ele baixa o dado mais recente, recalcula os indicadores e commita o seed
atualizado, sem precisar de intervenção manual.

### Desenvolvimento local, sem Docker

```bash
# Pipeline (Python 3.12)
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python -m pipeline.ingest
python -m pipeline.transform

# API (Node 24)
cd api && npm install && npm run start:dev   # http://localhost:3000

# Painel (outro terminal)
cd frontend && npm install && npm run dev    # http://localhost:5173
```

### Testes

```bash
# Pipeline — DEC/FEC, expurgo, outliers, derivação de UF, etc. (fixture sintética)
pip install -r requirements-dev.txt
pytest

# API — unitários e end-to-end (Jest + supertest), batendo no indicadores.duckdb real
cd api
npm test
npm run test:e2e
```

## Decisões de projeto

- **DEC/FEC calculados no grão do conjunto de unidades consumidoras**, não da
  distribuidora — é o denominador correto (total de consumidores ativos daquele
  conjunto), conforme o Módulo 8 do PRODIST. O DEC por distribuidora é a média dos
  conjuntos ponderada por consumidores, não uma média simples.
- **Consumidor-hora perdido** (afetados × duração) é usado como métrica de impacto no
  mapa e no ranking por UF, em vez do DEC. Motivo: o DEC precisa de um denominador
  (consumidores ativos) atribuível à área em questão, mas um conjunto de unidades
  consumidoras cruza em média ~8,6 municípios — logo pode cruzar mais de uma UF — e
  não existe um "ativos" isolado e correto por UF pra dividir. Consumidor-hora é
  aditivo e não tem esse problema, então é a métrica honesta pra essas duas visões.
- **UF é derivada matematicamente**, não por join: os dois primeiros dígitos do
  código IBGE do município já são o código da UF (convenção do próprio IBGE), então
  não foi preciso importar nem juntar uma tabela de 5.571 municípios — só uma tabela
  estática de 27 UFs (`data/referencia/ufs.json`) pra exibir nome/região.
- **Malha geográfica e projeção do mapa escritos à mão**: o GeoJSON das UFs vem do
  IBGE (`data/referencia/malha_uf.geojson`); a projeção lon/lat → SVG é uma
  equirretangular simples (`frontend/src/geo.ts`), suficiente pra um choropleth
  nessa escala e sem precisar de uma lib como d3-geo.
- **Interrupções com expurgo regulatório são excluídas** do cálculo (situação de
  emergência, dia crítico, falha na instalação do consumidor etc.) — só as marcadas
  "Não houve Expurgo" (~75% do dado) compõem os indicadores de continuidade oficiais.
- **Programada vs. não programada**: cada causa de interrupção carrega essa
  classificação da própria ANEEL (`DscFatoGeradorTipo`). Programada é a distribuidora
  agendando uma parada (manutenção, obra); não programada é forçada por algo
  inesperado (clima, falha, terceiros). Ajuda a separar o que é escolha de gestão da
  distribuidora do que é evento externo.
- **Seed commitado** (`data/seed/indicadores.duckdb`) pra o `docker compose up`
  funcionar de primeira — o Parquet bruto (~200 MB) não é versionado; o backfill
  completo é um comando à parte, não bloqueia o boot.
- **Divisão inteira explícita (`//`) pra derivar a UF**, não `CAST(x / 100000 AS
  INTEGER)`: o `/` do DuckDB faz divisão real e o `CAST` pra inteiro *arredonda*, não
  trunca. Isso chegou a produzir um bug real — município 3550308 (São Paulo capital)
  virava "UF 36" (inexistente) e sumia do mapa e do ranking por estado — pego pelos
  testes do pipeline antes de ir pro ar.

## Limitações conhecidas

- ~1,3% das interrupções têm código de município IBGE inválido ou ruído do dado bruto
  (ex.: código "1"); são naturalmente excluídas do mapa e do ranking por UF, e o
  impacto agregado disso é pequeno o bastante pra não distorcer o resultado.
- Não há indicador de DEC por UF (ver decisões de projeto acima) — só consumidor-hora
  e sua variação mês a mês.
- O workflow de backfill mensal (`.github/workflows/backfill-mensal.yml`) depende de
  "Read and write permissions" habilitado nas configurações de Actions do repositório
  para conseguir commitar o seed atualizado.

## Estrutura do repositório

```
monitor-continuidade-aneel/
├── .github/workflows/       # backfill mensal agendado (GitHub Actions)
├── docker-compose.yml       # orquestra seed + api + web (+ pipeline sob demanda)
├── requirements.txt         # dependências Python fixadas (runtime)
├── requirements-dev.txt     # + pytest, para rodar os testes do pipeline
├── pipeline/
│   ├── ingest.py / transform.py / config.py
│   └── tests/                # pytest — DEC/FEC, expurgo, outliers, UF etc.
├── data/
│   ├── seed/                 # banco pequeno pré-processado, commitado
│   ├── referencia/            # UFs do IBGE + malha geográfica (GeoJSON)
│   ├── raw/                  # Parquet baixado da ANEEL (não versionado)
│   └── processed/            # indicadores.duckdb gerado pelo pipeline (não versionado)
├── api/                     # NestJS — lê indicadores.duckdb, serve a API
│   └── test/                 # testes e2e (Jest + supertest) dos endpoints
└── frontend/                # React + Vite — painel
```
