import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('Indicadores (e2e)', () => {
  let app: INestApplication<App>;
  let competencia: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    const res = await request(app.getHttpServer()).get(
      '/indicadores/competencias',
    );
    competencia = res.body.competencias[0];
  });

  afterAll(async () => {
    await app.close();
  });

  it('/indicadores/competencias (GET) lista competências e o mês consolidado', async () => {
    const res = await request(app.getHttpServer())
      .get('/indicadores/competencias')
      .expect(200);

    expect(Array.isArray(res.body.competencias)).toBe(true);
    expect(res.body.competencias.length).toBeGreaterThan(0);
    expect(res.body.competencias[0]).toMatch(/^\d{4}-\d{2}$/);
    expect(res.body.mes_consolidado).toMatch(/^\d{4}-\d{2}$/);
  });

  it('/indicadores/distribuidoras (GET) sem competência retorna 400', () => {
    return request(app.getHttpServer())
      .get('/indicadores/distribuidoras')
      .expect(400);
  });

  it('/indicadores/distribuidoras?competencia=... (GET) retorna o ranking', async () => {
    const res = await request(app.getHttpServer())
      .get(`/indicadores/distribuidoras?competencia=${competencia}`)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    const linha = res.body[0];
    expect(linha).toHaveProperty('sig_agente');
    expect(linha).toHaveProperty('dec_ponderado');
    expect(linha).toHaveProperty('variacao_pct');
    expect(typeof linha.dec_ponderado).toBe('number');
  });

  it('/indicadores/distribuidoras/:sig (GET) retorna série e causas de uma distribuidora real', async () => {
    const ranking = await request(app.getHttpServer()).get(
      `/indicadores/distribuidoras?competencia=${competencia}`,
    );
    const sig = ranking.body[0].sig_agente;

    const res = await request(app.getHttpServer())
      .get(`/indicadores/distribuidoras/${encodeURIComponent(sig)}`)
      .expect(200);

    expect(res.body.sig_agente).toBe(sig);
    expect(Array.isArray(res.body.serie)).toBe(true);
    expect(res.body.serie.length).toBeGreaterThan(0);
    expect(Array.isArray(res.body.causas)).toBe(true);
    // Enriquecimento regulatório: presente na resposta (pode ser null se o
    // pipeline rodou sem ingest_continuidade, mas a chave sempre existe).
    expect(res.body.serie[0]).toHaveProperty('n_conjuntos_acima_limite_dec');
    expect(res.body.serie[0]).toHaveProperty('compensacao_paga');
  });

  it('/indicadores/distribuidoras/:sig (GET) com sigla inexistente retorna 404', () => {
    return request(app.getHttpServer())
      .get('/indicadores/distribuidoras/NAO-EXISTE-XYZ')
      .expect(404);
  });

  it('/indicadores/mapa (GET) sem competência retorna 400', () => {
    return request(app.getHttpServer()).get('/indicadores/mapa').expect(400);
  });

  it('/indicadores/mapa?competencia=... (GET) retorna consumidor-hora por UF', async () => {
    const res = await request(app.getHttpServer())
      .get(`/indicadores/mapa?competencia=${competencia}`)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body.length).toBeLessThanOrEqual(27);
    const linha = res.body[0];
    expect(linha).toHaveProperty('uf');
    expect(linha).toHaveProperty('uf_codigo');
    expect(linha).toHaveProperty('consumidor_hora');
  });

  it('/indicadores/mapa/malha (GET) retorna GeoJSON com as 27 UFs', async () => {
    const res = await request(app.getHttpServer())
      .get('/indicadores/mapa/malha')
      .expect(200);

    expect(res.body.type).toBe('FeatureCollection');
    expect(res.body.features).toHaveLength(27);
  });

  it('/indicadores/mapa/:uf/distribuidoras (GET) retorna ranking local de uma UF real', async () => {
    const mapa = await request(app.getHttpServer()).get(
      `/indicadores/mapa?competencia=${competencia}`,
    );
    const uf = mapa.body[0].uf;

    const res = await request(app.getHttpServer())
      .get(`/indicadores/mapa/${uf}/distribuidoras?competencia=${competencia}`)
      .expect(200);

    expect(res.body.uf).toBe(uf);
    expect(Array.isArray(res.body.distribuidoras)).toBe(true);
    if (res.body.distribuidoras.length > 0) {
      const soma = res.body.distribuidoras.reduce(
        (acc: number, d: { participacao: number }) => acc + d.participacao,
        0,
      );
      expect(soma).toBeCloseTo(1, 5);
    }
  });

  it('/indicadores/mapa/:uf/distribuidoras (GET) com UF inexistente retorna 404', () => {
    return request(app.getHttpServer())
      .get(`/indicadores/mapa/XX/distribuidoras?competencia=${competencia}`)
      .expect(404);
  });
});
