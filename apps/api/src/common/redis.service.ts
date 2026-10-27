import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import Redis from 'ioredis';

export type PresenceMap = Record<string, { status: string; customStatusText: string | null }>;

/**
 * Redis-Zugriff für Präsenz (Sockets zählen), Slowmode, Spam-Tracking,
 * OpenGraph-Cache, Sprachzustand und das Bot-Command-Register.
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  readonly client: Redis;

  constructor() {
    this.client = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: null,
      lazyConnect: true,
    });
    this.client.on('error', (err: Error) => this.logger.warn(`Redis-Fehler: ${err.message}`));
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.client.connect();
    } catch (err) {
      this.logger.warn(`Redis nicht erreichbar: ${(err as Error).message}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.client.quit();
    } catch {
      this.client.disconnect();
    }
  }

  /** Neuer (duplizierter) Client, z. B. für den Socket.IO-Redis-Adapter. */
  createClient(): Redis {
    const c = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: null,
    });
    c.on('error', (err: Error) => this.logger.warn(`Redis-Adapter-Fehler: ${err.message}`));
    return c;
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds) await this.client.set(key, value, 'EX', ttlSeconds);
    else await this.client.set(key, value);
  }

  async setNx(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    const res = await this.client.set(key, value, 'EX', ttlSeconds, 'NX');
    return res === 'OK';
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  async incr(key: string): Promise<number> {
    return this.client.incr(key);
  }

  async expire(key: string, ttlSeconds: number): Promise<void> {
    await this.client.expire(key, ttlSeconds);
  }

  async listPush(key: string, value: string): Promise<number> {
    return this.client.rpush(key, value);
  }

  async listRange(key: string, start: number, end: number): Promise<string[]> {
    return this.client.lrange(key, start, end);
  }

  async listTrim(key: string, start: number, end: number): Promise<void> {
    await this.client.ltrim(key, start, end);
  }

  async hset(key: string, field: string, value: string): Promise<void> {
    await this.client.hset(key, field, value);
  }

  async hget(key: string, field: string): Promise<string | null> {
    return this.client.hget(key, field);
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    return this.client.hgetall(key);
  }

  async hdel(key: string, field: string): Promise<void> {
    await this.client.hdel(key, field);
  }

  async sadd(key: string, ...members: string[]): Promise<number> {
    return this.client.sadd(key, ...members);
  }

  async srem(key: string, ...members: string[]): Promise<number> {
    return this.client.srem(key, ...members);
  }

  async scard(key: string): Promise<number> {
    return this.client.scard(key);
  }

  // ─── Präsenz ────────────────────────────────────────────────────────────
  /** Socket eines Nutzers als online markieren (Zähler über Set der Sockets). */
  async setOnline(userId: string, socketId: string): Promise<void> {
    await this.client.sadd(`sockets:${userId}`, socketId);
  }

  /** Socket entfernen; true, wenn das der letzte Socket war (jetzt offline). */
  async removeOnline(userId: string, socketId: string): Promise<boolean> {
    await this.client.srem(`sockets:${userId}`, socketId);
    return (await this.client.scard(`sockets:${userId}`)) === 0;
  }

  async isOnline(userId: string): Promise<boolean> {
    return (await this.client.scard(`sockets:${userId}`)) > 0;
  }

  /** Präsenz-Infos zu mehreren Nutzern lesen (Hash presence:<userId>). */
  async getPresence(userIds: string[]): Promise<PresenceMap> {
    const out: PresenceMap = {};
    if (userIds.length === 0) return out;
    const pipe = this.client.pipeline();
    for (const id of userIds) pipe.hgetall(`presence:${id}`);
    const results = await pipe.exec();
    userIds.forEach((id, i) => {
      const row = results?.[i]?.[1] as Record<string, string> | undefined;
      const online = row && Object.keys(row).length > 0;
      out[id] = {
        status: online ? row!.status || 'OFFLINE' : 'OFFLINE',
        customStatusText: online ? row!.customStatusText || null : null,
      };
    });
    return out;
  }

  async setPresence(userId: string, status: string, customStatusText: string | null): Promise<void> {
    await this.client.hset(`presence:${userId}`, 'status', status);
    if (customStatusText) await this.client.hset(`presence:${userId}`, 'customStatusText', customStatusText);
    else await this.client.hdel(`presence:${userId}`, 'customStatusText');
  }

  async clearPresence(userId: string): Promise<void> {
    await this.client.hset(`presence:${userId}`, 'status', 'OFFLINE');
  }
}
