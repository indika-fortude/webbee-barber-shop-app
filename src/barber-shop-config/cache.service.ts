import { InjectRedis } from '@nestjs-modules/ioredis';
import { Injectable } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export default class CacheService {
  constructor(@InjectRedis() private _redis: Redis) {}

  async addStringToCache(key: string, data: string, ttl?: number) {
    if (ttl) {
      await this._redis.set(key, data, 'EX', ttl);
    } else {
      await this._redis.set(key, data);
    }
  }

  async readFromCache(key: string) {
    return this._redis.get(key);
  }

  async invalidateCache(key: string) {
    return this._redis.del(key);
  }
}
