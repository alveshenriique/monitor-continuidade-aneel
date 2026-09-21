import { Controller, Get, Param, Query } from '@nestjs/common';
import { IndicadoresService, type CompetenciasResposta } from './indicadores.service';

@Controller('indicadores')
export class IndicadoresController {
  constructor(private readonly indicadores: IndicadoresService) {}

  @Get('competencias')
  competencias(): Promise<CompetenciasResposta> {
    return this.indicadores.competencias();
  }

  @Get('distribuidoras')
  distribuidoras(@Query('competencia') competencia?: string) {
    return this.indicadores.distribuidoras(competencia);
  }

  @Get('distribuidoras/:sig')
  distribuidoraDetalhe(
    @Param('sig') sig: string,
    @Query('competencia') competencia?: string,
  ) {
    return this.indicadores.distribuidoraDetalhe(sig, competencia);
  }

  @Get('mapa')
  mapa(@Query('competencia') competencia?: string) {
    return this.indicadores.mapa(competencia);
  }

  @Get('mapa/malha')
  malha() {
    return this.indicadores.malhaUf();
  }

  @Get('mapa/:uf/distribuidoras')
  distribuidorasPorUf(
    @Param('uf') uf: string,
    @Query('competencia') competencia?: string,
  ) {
    return this.indicadores.distribuidorasPorUf(uf, competencia);
  }
}
