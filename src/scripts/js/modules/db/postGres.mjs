/**
 * Generic PostgreSQL adapter for database connectivity, health checks,
 * and connection lifecycle management.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import dotenv from 'dotenv';

export class PostgresDatabase {
  static Pool = pg.Pool;
  static filePath = fileURLToPath(import.meta.url);
  static directory = path.dirname(this.filePath);
  static sqlRoot = path.resolve(this.directory, '../../../sql');
  static DEFAULT_PORT = 5432;
  static DEFAULT_POOL_MAX = 20;
  static DEFAULT_IDLE_TIMEOUT_MS = 30000;
  static DEFAULT_CONNECTION_TIMEOUT_MS = 2000;
  static DEFAULT_SSL = { rejectUnauthorized: false };

  static initializeEnvironment() {
    return dotenv.config();
  }

  static createConfig(config = {}) {
    const isProduction = process.env.NODE_ENV === 'production' || process.env.RENDER;

    return {
      host:
        config.host ??
        (isProduction
          ? process.env.DB_PG_INTERNAL_HOSTNAME
          : process.env.DB_PG_EXTERNAL_HOSTNAME || process.env.DB_PG_INTERNAL_HOSTNAME),
      port: config.port ?? Number(process.env.DB_PG_PORT || this.DEFAULT_PORT),
      database: config.database ?? process.env.DB_PG_DATABASE,
      user: config.user ?? process.env.DB_PG_USER,
      password: config.password ?? process.env.DB_PG_PASSWORD,
      ssl: config.ssl ?? this.DEFAULT_SSL,
      max: config.max ?? this.DEFAULT_POOL_MAX,
      idleTimeoutMillis: config.idleTimeoutMillis ?? this.DEFAULT_IDLE_TIMEOUT_MS,
      connectionTimeoutMillis: config.connectionTimeoutMillis ?? this.DEFAULT_CONNECTION_TIMEOUT_MS,
      ...config,
    };
  }

  static loadSqlStatements(relativePath, sqlRoot = this.sqlRoot) {
    const filePath = path.join(sqlRoot, relativePath);
    const sql = fs.readFileSync(filePath, 'utf8');

    const statements = [];
    let currentStatement = '';
    let inSingleQuote = false;
    let inDoubleQuote = false;
    let inLineComment = false;
    let inBlockComment = false;
    let inDollarQuote = null;
    let index = 0;

    while (index < sql.length) {
      const char = sql[index];
      const next = sql[index + 1];

      if (inLineComment) {
        if (char === '\n') {
          inLineComment = false;
        }
        index += 1;
        continue;
      }

      if (inBlockComment) {
        if (char === '*' && next === '/') {
          inBlockComment = false;
          index += 2;
          continue;
        }
        index += 1;
        continue;
      }

      if (inDollarQuote) {
        const closingTag = `$${inDollarQuote}$`;
        if (sql.startsWith(closingTag, index)) {
          currentStatement += closingTag;
          index += closingTag.length;
          inDollarQuote = null;
          continue;
        }

        currentStatement += char;
        index += 1;
        continue;
      }

      if (inSingleQuote) {
        currentStatement += char;

        if (char === "'" && next === "'") {
          currentStatement += next;
          index += 2;
          continue;
        }

        if (char === "'") {
          inSingleQuote = false;
        }

        index += 1;
        continue;
      }

      if (inDoubleQuote) {
        currentStatement += char;

        if (char === '"' && next === '"') {
          currentStatement += next;
          index += 2;
          continue;
        }

        if (char === '"') {
          inDoubleQuote = false;
        }

        index += 1;
        continue;
      }

      if (char === '-' && next === '-') {
        inLineComment = true;
        index += 2;
        continue;
      }

      if (char === '/' && next === '*') {
        inBlockComment = true;
        index += 2;
        continue;
      }

      if (char === '$') {
        const match = sql.slice(index).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$/);
        if (match) {
          currentStatement += match[0];
          inDollarQuote = match[0].slice(1, -1);
          index += match[0].length;
          continue;
        }
      }

      if (char === "'") {
        currentStatement += char;
        inSingleQuote = true;
        index += 1;
        continue;
      }

      if (char === '"') {
        currentStatement += char;
        inDoubleQuote = true;
        index += 1;
        continue;
      }

      if (char === ';') {
        const normalized = currentStatement.replace(/--.*$/gm, '').trim();
        if (normalized.length > 0) {
          statements.push(normalized);
        }
        currentStatement = '';
        index += 1;
        continue;
      }

      currentStatement += char;
      index += 1;
    }

    const finalStatement = currentStatement.replace(/--.*$/gm, '').trim();
    if (finalStatement.length > 0) {
      statements.push(finalStatement);
    }

    return statements;
  }

  constructor(config = {}) {
    this.constructor.initializeEnvironment();

    const resolvedConfig = this.constructor.createConfig(config);

    this.config = resolvedConfig;
    this.pool = new this.constructor.Pool(resolvedConfig);

    this.pool.on('error', (err) => {
      console.error('Unexpected error on idle client', err);
      process.exit(-1);
    });
  }

  async tableExists(tableName) {
    const result = await this.query(
      `SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = $1
      ) AS exists`,
      [tableName]
    );

    return Boolean(result.rows[0]?.exists);
  }

  async columnExists(tableName, columnName) {
    const result = await this.query(
      `SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2
      ) AS exists`,
      [tableName, columnName]
    );

    return Boolean(result.rows[0]?.exists);
  }

  async executeSqlFile(relativePath, sqlRoot = this.constructor.sqlRoot) {
    const statements = this.constructor.loadSqlStatements(relativePath, sqlRoot);

    for (const statement of statements) {
      await this.query(statement);
    }

    return statements.length;
  }

  async initializeDatabaseConnection() {
    try {
      const client = await this.pool.connect();
      await client.query('SELECT NOW()');
      client.release();
      console.log(`✅ Database connected: ${this.config.host}`);
      return true;
    } catch (error) {
      console.error(`❌ Database connection failed: ${error.message}`);
      return false;
    }
  }

  async query(text, params = []) {
    const start = Date.now();

    try {
      const result = await this.pool.query(text, params);
      const duration = Date.now() - start;
      console.log('Executed query', { text, duration, rows: result.rowCount });
      return result;
    } catch (error) {
      console.error('Database query error:', error.message);
      throw error;
    }
  }

  async getClient() {
    return this.pool.connect();
  }

  async healthCheck() {
    try {
      await this.query('SELECT 1 as status');
      return {
        status: 'healthy',
        database: this.config.database,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  async close() {
    await this.pool.end();
  }

  getDbExpirationInfo() {
    const expirationDateStr = process.env.DB_PG_EXPIRE;

    if (!expirationDateStr) {
      return {
        daysRemaining: null,
        expirationDate: null,
        status: 'unknown',
      };
    }

    try {
      const expirationDate = new Date(expirationDateStr);
      const today = new Date();

      today.setHours(0, 0, 0, 0);
      expirationDate.setHours(0, 0, 0, 0);

      const daysRemaining = Math.ceil((expirationDate - today) / (1000 * 60 * 60 * 24));

      let status = 'safe';
      if (daysRemaining <= 0) {
        status = 'expired';
      } else if (daysRemaining === 1) {
        status = 'critical-1day';
      } else if (daysRemaining <= 3) {
        status = 'critical';
      } else if (daysRemaining <= 10) {
        status = 'warning';
      }

      return {
        daysRemaining,
        expirationDate: expirationDate.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        }),
        status,
      };
    } catch (error) {
      console.error('Error parsing DB expiration date:', error);
      return {
        daysRemaining: null,
        expirationDate: null,
        status: 'unknown',
      };
    }
  }

  getExpirationWarning() {
    const info = this.getDbExpirationInfo();

    if (info.status === 'safe' || info.status === 'unknown') {
      return { message: null, level: null };
    }

    if (info.status === 'expired') {
      return {
        message: `⚠️ DATABASE EXPIRED - Expires: ${info.expirationDate}. Contact support immediately!`,
        level: 'expired',
      };
    }

    if (info.status === 'critical-1day') {
      return {
        message: `🚨 DATABASE EXPIRES IN 1 DAY - ${info.expirationDate}. Action required immediately!`,
        level: 'critical-1day',
      };
    }

    if (info.status === 'critical') {
      return {
        message: `🔴 DATABASE EXPIRES IN ${info.daysRemaining} DAYS - ${info.expirationDate}. Action needed soon!`,
        level: 'critical',
      };
    }

    if (info.status === 'warning') {
      return {
        message: `⚠️ DATABASE EXPIRES IN ${info.daysRemaining} DAYS - ${info.expirationDate}`,
        level: 'warning',
      };
    }

    return { message: null, level: null };
  }
}

export default PostgresDatabase;
