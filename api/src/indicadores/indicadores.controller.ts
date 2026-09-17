import { Controller, Get, Param, Query } from '@nestjs/common';
import { IndicadoresService } from './indicadores.service';

@Controller('indicadores')
export class IndicadoresController {
  constructor(private readonly indicadores: IndicadoresService) {}

  @Get('competencias')
  competencias(): Promise<string[]> {
    return this.indicadores.competencias();
  }

  @Get('distribuidoras')
  distribuidoras(@Query('competencia') competencia?: string) {
    return this.indicadores.distribuidoras(competencia);
  }

  @Get('distribuidoras/:sig')
  distribuidoraDetalhe(@Param('sig') sig: string) {
    return this.indicadores.distribuidoraDetalhe(sig);
  }

  @Get('mapa')
  mapa(@Query('competencia') competencia?: string) {
    return this.indicadores.mapa(competencia);
  }

  @Get('mapa/malha')
  malha() {
    return this.indicadores.malhaUf();
  }
}
