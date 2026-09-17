import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
import { IndicadoresController } from './indicadores/indicadores.controller';
import { IndicadoresService } from './indicadores/indicadores.service';

@Module({
  imports: [DatabaseModule],
  controllers: [AppController, IndicadoresController],
  providers: [AppService, IndicadoresService],
})
export class AppModule {}