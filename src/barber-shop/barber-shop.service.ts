import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import CacheService from 'src/barber-shop-config/cache.service';
import { RedisKey } from 'src/barber-shop-config/enum/redis-key.enum';
import { Repository } from 'typeorm';
import { EventTypeDto } from './dto/event-type.dto';
import { EventTypeEntity } from './entity/event-type.entity';

@Injectable()
export class BarberShopService {
  private logger: Logger = new Logger(BarberShopService.name);

  constructor(
    @InjectRepository(EventTypeEntity)
    private eventTypeRepo: Repository<EventTypeEntity>,
    private cacheService: CacheService,
  ) {}

  async createEventType(eventType: EventTypeDto) {
    const eventTypeEntity = this.eventTypeRepo.create(eventType);
    const createdEventType = await this.eventTypeRepo.save(eventTypeEntity);
    this.cacheService.invalidateCache(RedisKey.EVENT_TYPE_KEY);
    this.logger.debug(`new event is created: ${JSON.stringify(eventType)}`);
    return createdEventType;
  }

  async getAllEventTypes() {
    return this.eventTypeRepo.find();
  }
}
