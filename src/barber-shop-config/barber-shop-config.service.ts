import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import CacheService from './cache.service';
import { GlobalConfigDto } from './dto/global-config.dto';
import { UnavaialbleTimesDto } from './dto/unavailable-time.dto';
import { GlobalConfigEntity } from './entity/global-config.entity';
import { UnavailableTimesEntity } from './entity/unavailable-times.entity';
import { RedisKey } from './enum/redis-key.enum';
import { TimeDurationType } from './enum/time-duration-type.enum';

@Injectable()
export class BarberShopConfigService {
  private logger: Logger = new Logger(BarberShopConfigService.name);
  constructor(
    @InjectRepository(GlobalConfigEntity)
    private globalConfigRepo: Repository<GlobalConfigEntity>,
    @InjectRepository(UnavailableTimesEntity)
    private unavailableTimesRepo: Repository<UnavailableTimesEntity>,
    private cacheService: CacheService,
  ) {}

  /**
   * this method used to get latest versioned configurations.
   */
  public async getLatestConfig() {
    const configResult = await this.globalConfigRepo.find({
      take: 1,
    });
    return configResult[0] || {};
  }

  /**
   * update new configuration object
   */
  public async updateNewConfig(config: GlobalConfigDto) {
    const configObjects = await this.globalConfigRepo.find({
      take: 1,
    });
    this.cacheService.invalidateCache(RedisKey.GLOBAL_CONFIG_KEY);
    const globalConfigEntity = this.globalConfigRepo.create(config);

    const configObj = configObjects[0];
    if (configObj) {
      globalConfigEntity.id = configObj.id;
    }

    await this.globalConfigRepo.save(globalConfigEntity);
    this.logger.debug(
      `barber shop configutation is changed: ${JSON.stringify(config)}`,
    );
    return config;
  }

  /**
   * get all the unavaialble times
   */
  public async getAllUnavailableTimes(): Promise<UnavailableTimesEntity[]> {
    return this.unavailableTimesRepo.find();
  }

  /**
   * create new unavaialble time
   */
  public async createUnavailableTimes(
    unavailableTime: UnavaialbleTimesDto,
  ): Promise<UnavailableTimesEntity> {
    this.unavaialbleDateValidation(unavailableTime);
    this.unavaialbleTimeValidation(unavailableTime);

    const unavailableTimeEntity =
      this.unavailableTimesRepo.create(unavailableTime);

    const newTimeEntity = await this.unavailableTimesRepo.save(
      unavailableTimeEntity,
    );
    this.cacheService.invalidateCache(RedisKey.UNAVAILABLE_TIME_KEY);
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

    await this.unavailableTimesRepo.update(id, unavailableTime);
    this.logger.debug(
      `barber shop unavailable time with id: ${id} is updated: ${JSON.stringify(
        unavailableTime,
      )}`,
    );

    this.cacheService.invalidateCache(RedisKey.UNAVAILABLE_TIME_KEY);
    return {
      message: `barber shop unavailable time is updated with id: ${id} `,
    };
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
    await this.unavailableTimesRepo.delete(id);
    this.logger.debug(`barber shop unavailable time with id: ${id} is deleted`);
    this.cacheService.invalidateCache(RedisKey.UNAVAILABLE_TIME_KEY);
    return {
      message: `barber shop unavailable time is deleted with id: ${id}`,
    };
  }
}
