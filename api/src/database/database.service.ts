import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import {
  DuckDBInstance,
  DuckDBConnection,
} from '@duckdb/node-api';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private instance!: DuckDBInstance;
  private connection!: DuckDBConnection;

  // Caminho para o banco gerado pelo pipeline (../../data/processed a partir de api/src/database)
  private readonly dbPath = resolve(
    __dirname,
    '..',
    '..',
    '..',
    'data',
    'processed',
    'indicadores.duckdb',
  );

  async onModuleInit(): Promise<void> {
    if (!existsSync(this.dbPath)) {
      this.logger.error(
        `Banco não encontrado em ${this.dbPath}. ` +
          `Rode o pipeline antes: python -m pipeline.ingest && python -m pipeline.transform`,
      );
      throw new Error('indicadores.duckdb não encontrado');
    }
    // Abre em modo somente-leitura: a API apenas consulta; quem escreve é o pipeline.
    this.instance = await DuckDBInstance.create(this.dbPath, {
      access_mode: 'READ_ONLY',
    });
    this.connection = await this.instance.connect();
    this.logger.log(`Conectado ao DuckDB: ${this.dbPath}`);
  }

  async onModuleDestroy(): Promise<void> {
    this.connection?.closeSync();
    this.instance?.closeSync();
  }

  /**
   * Executa uma query e devolve as linhas como objetos JS simples.
   * Aceita parâmetros posicionais (?) para evitar SQL injection.
   */
  async query<T = Record<string, unknown>>(
    sql: string,
    params: unknown[] = [],
  ): Promise<T[]> {
    const reader =
      params.length > 0
        ? await this.connection.runAndReadAll(sql, params as any[])
        : await this.connection.runAndReadAll(sql);
    return reader.getRowObjects().map(converterBigInts) as T[];
  }
}

// COUNT/SUM de colunas inteiras voltam do DuckDB como BigInt, que o
// JSON.stringify do Express não sabe serializar. Os valores aqui (contagens
// e totais de consumidores/interrupções) estão longe do limite seguro de
// Number, então convertemos para permitir a resposta HTTP em JSON.
function converterBigInts<T extends Record<string, unknown>>(row: T): T {
  const resultado: Record<string, unknown> = {};
  for (const [chave, valor] of Object.entries(row)) {
    resultado[chave] = typeof valor === 'bigint' ? Number(valor) : valor;
  }
  return resultado as T;
}