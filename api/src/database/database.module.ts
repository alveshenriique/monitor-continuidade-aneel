import { Global, Module } from '@nestjs/common';
import { DatabaseService } from './database.service';

// @Global torna o DatabaseService disponível em toda a aplicação sem reimportar.
@Global()
@Module({
  providers: [DatabaseService],
  exports: [DatabaseService],
})
export class DatabaseModule {}