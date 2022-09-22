import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EventTypeEntity } from '../barber-shop/entity/event-type.entity';
import { Repository } from 'typeorm';
import CacheService from './cache.service';
import { EventConfigDto } from './dto/event-config.dto';
import { UnavaialbleTimesDto } from './dto/unavailable-time.dto';
import { EventConfigEntity } from './entity/event-config.entity';
import { UnavailableTimesEntity } from './entity/unavailable-times.entity';
import { RedisKey } from './enum/redis-key.enum';
import { TimeDurationType } from './enum/time-duration-type.enum';

@Injectable()
export class BarberShopConfigService {
  private logger: Logger = new Logger(BarberShopConfigService.name);
  constructor(
    @InjectRepository(EventConfigEntity)
    private eventConfigRepo: Repository<EventConfigEntity>,
    @InjectRepository(UnavailableTimesEntity)
    private unavailableTimesRepo: Repository<UnavailableTimesEntity>,
    @InjectRepository(EventTypeEntity)
    private eventTypeRepo: Repository<EventTypeEntity>,
    private cacheService: CacheService,
  ) {}

  /**
   * this method used to get latest versioned configurations.
   */
  public async getLatestConfig(eventId: number) {
    const configResult = await this.eventConfigRepo.find({
      take: 1,
      where: {
        eventType: {
          id: eventId,
        },
      },
    });
    return configResult[0] || {};
  }

  /**
   * update new configuration object
   */
  public async updateNewEventConfig(config: EventConfigDto) {
    const event = await this.eventTypeRepo.findOne({
      where: {
        id: config.eventId,
      },
      relations: ['eventConfig'],
    });

    if (!event) {
      throw new HttpException(
        {
          message: ['invalid event id'],
          error: 'Bad Request',
          statusCode: HttpStatus.BAD_REQUEST,
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    this.cacheService.invalidateCache(
      RedisKey.EVENT_CONFIG_KEY.concat(config.eventId.toString()),
    );
    const eventConfig = this.createEventConfigEntity(config, event);
    const eventConfigEntity = this.eventConfigRepo.create(eventConfig);

    await this.eventConfigRepo.save(eventConfigEntity);
    this.logger.debug(
      `barber shop configutation is changed: ${JSON.stringify(config)}`,
    );
    return config;
  }

  createEventConfigEntity(
    newConfigValues: EventConfigDto,
    event: EventTypeEntity,
  ) {
    const eventConfigId = event.eventConfig?.id;
    return {
      ...newConfigValues,
      id: eventConfigId,
      eventType: event,
    } as unknown as EventConfigEntity;
  }

  /**
   * get all the unavaialble times
   */
  public async getAllUnavailableTimes(
    eventId: number,
  ): Promise<UnavailableTimesEntity[]> {
    return this.unavailableTimesRepo.find({
      where: { eventType: { id: eventId } },
    });
  }

  /**
   * create new unavaialble time
   */
  public async createUnavailableTimes(
    unavailableTime: UnavaialbleTimesDto,
  ): Promise<UnavailableTimesEntity> {
    this.unavaialbleDateValidation(unavailableTime);
    this.unavaialbleTimeValidation(unavailableTime);

    const event = await this.eventTypeValidation(unavailableTime.eventId);

    const unavailableTimeObj = { ...unavailableTime, eventType: event };

    const unavailableTimeEntity =
      this.unavailableTimesRepo.create(unavailableTimeObj);

    const newTimeEntity = await this.unavailableTimesRepo.save(
      unavailableTimeEntity,
    );
    this.cacheService.invalidateCache(
      RedisKey.UNAVAILABLE_TIME_KEY.concat(unavailableTime.eventId.toString()),
    );
    this.logger.debug(
      `barber shop new unavailable time is added: ${JSON.stringify(
        unavailableTime,
      )}`,
    );
    return newTimeEntity;
  }

  /**
   * update unavaialble time
   */
  public async updateUnavailableTimes(
    id: number,
    unavailableTime: UnavaialbleTimesDto,
  ) {
    this.unavaialbleDateValidation(unavailableTime);
    this.unavaialbleTimeValidation(unavailableTime);

    const event = await this.eventTypeValidation(unavailableTime.eventId);

    const unavailableTimeObj = { ...unavailableTime, eventType: event };
    delete unavailableTimeObj.eventId;

    await this.unavailableTimesRepo.update(id, unavailableTimeObj);
    this.logger.debug(
      `barber shop unavailable time with id: ${id} is updated: ${JSON.stringify(
        unavailableTime,
      )}`,
    );

    this.cacheService.invalidateCache(
      RedisKey.UNAVAILABLE_TIME_KEY.concat(unavailableTime.eventId.toString()),
    );
    return {
      message: `barber shop unavailable time is updated with id: ${id} `,
    };
  }

  async eventTypeValidation(eventId: number) {
    const event = await this.eventTypeRepo.findOne({
      where: {
        id: eventId,
      },
    });

    if (!event) {
      throw new HttpException(
        {
          message: ['invalid event id'],
          error: 'Bad Request',
          statusCode: HttpStatus.BAD_REQUEST,
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    return event;
  }

  private unavaialbleDateValidation({
    date,
    durationType,
  }: UnavaialbleTimesDto) {
    if (!date && durationType == TimeDurationType.ONE_DAY) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message: ['invalid date provided'],
          error: HttpStatus.BAD_REQUEST,
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  private unavaialbleTimeValidation({
    startTime,
    endTime,
  }: UnavaialbleTimesDto) {
    const fixComparableDate = '1/1/1999 ';
    if (
      Date.parse(fixComparableDate.concat(startTime)) >
      Date.parse(fixComparableDate.concat(endTime))
    ) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message: ['start time greater than end time'],
          error: HttpStatus.BAD_REQUEST,
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * delete unavaialble time
   */
  public async deleteUnavailableTimes(id: number) {
    const unavailableTime = await this.unavailableTimesRepo.findOneBy({ id });
    await this.unavailableTimesRepo.delete(id);
    this.logger.debug(`barber shop unavailable time with id: ${id} is deleted`);
    this.cacheService.invalidateCache(
      RedisKey.UNAVAILABLE_TIME_KEY.concat(
        unavailableTime.eventType.id.toString(),
      ),
    );
    return {
      message: `barber shop unavailable time is deleted with id: ${id}`,
    };
  }
}
