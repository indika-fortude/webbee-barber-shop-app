import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import CacheService from 'src/barber-shop-config/cache.service';
import { GlobalConfigEntity } from 'src/barber-shop-config/entity/global-config.entity';
import { UnavailableTimesEntity } from 'src/barber-shop-config/entity/unavailable-times.entity';
import { RedisKey } from 'src/barber-shop-config/enum/redis-key.enum';
import { EventTypeEntity } from 'src/barber-shop/entity/event-type.entity';
import { Equal, LessThanOrEqual, MoreThanOrEqual, Repository } from 'typeorm';
import { AppoinmentDto } from './dto/appoinment.dto';
import { AppoinmentEntity } from './entity/appoinment.entity';
import { UserEntity } from './entity/user.entity';
import * as moment from 'moment';
import { extendMoment } from 'moment-range';
import { TimeDurationType } from 'src/barber-shop-config/enum/time-duration-type.enum';
import { ScheduledEventsDto } from './dto/scheduled-event.dto';

@Injectable()
export class UserAppoinmentService {
  private logger = new Logger(UserAppoinmentService.name);
  constructor(
    @InjectRepository(AppoinmentEntity)
    private appoinmentRepo: Repository<AppoinmentEntity>,
    @InjectRepository(UserEntity)
    private userRepo: Repository<UserEntity>,
    @InjectRepository(EventTypeEntity)
    private eventTypeRepo: Repository<EventTypeEntity>,
    @InjectRepository(GlobalConfigEntity)
    private globalConfigRepo: Repository<GlobalConfigEntity>,
    @InjectRepository(UnavailableTimesEntity)
    private unavailableTimeRepo: Repository<UnavailableTimesEntity>,
    private cacheService: CacheService,
  ) {}

  async createUserAppoinement(appoinment: AppoinmentDto) {
    this.validateTimeBetween(appoinment.startTime, appoinment.endTime);
    await this.validateSelectedTimesInMaxRange(
      appoinment.startTime,
      appoinment.endTime,
    );
    await this.validateDateRangeInWorkingHours(
      appoinment.startTime,
      appoinment.endTime,
    );

    const eventType =
      await this.validateSelectedEventInCorrectRangeAndFilterEventType(
        appoinment.eventType.id,
        appoinment.startTime,
        appoinment.endTime,
      );
    appoinment.eventType = eventType;

    await this.validateAppoinmentSlotsFilledOrInvalid(
      appoinment.startTime,
      appoinment.endTime,
    );

    const user = await this.getUser(appoinment.user.email);
    if (user) {
      appoinment.user = user;
    }

    const appoinmentEntity = this.appoinmentRepo.create(appoinment);
    return this.appoinmentRepo.save(appoinmentEntity);
  }

  async getAllScheduleEvents() {
    const globalConfig = await this.getGlobalConfig();
    const currentTimestamp = new Date();
    const currentLastDayForAppoinment = moment()
      .add(globalConfig.maximumOppinmentDates, 'day')
      .toDate();

    const appoinements = await this.appoinmentRepo.find({
      where: {
        startTime: MoreThanOrEqual(currentTimestamp),
        endTime: LessThanOrEqual(currentLastDayForAppoinment),
      },
      relations: ['user', 'eventType'],
    });

    const scheduledEvents = this.getScheduledEventsFormat(
      appoinements,
      globalConfig.maxParallelClients,
    );

    const splitedScheduledEvent = this.splitEventsIntoSlotLengths(
      scheduledEvents,
      globalConfig.slotLengthInMunute,
    );

    const scheduleEventWithCount = this.countEqualAmountOfTimeRanges(
      splitedScheduledEvent,
    );

    return scheduleEventWithCount.map((event) => ({
      ...event,
      startTime: new Date(event.startTime).toLocaleString(),
      endTime: new Date(event.endTime).toLocaleString(),
    }));
  }

  countEqualAmountOfTimeRanges(scheduledEvent: ScheduledEventsDto[]) {
    scheduledEvent.sort(
      (a, b) => a.startTime.getTime() - b.startTime.getTime(),
    );

    const countedEvents: ScheduledEventsDto[] = [];
    while (scheduledEvent.length > 0) {
      const firstElement = scheduledEvent.shift();
      if (countedEvents.length == 0) {
        //this for first element of counted array
        firstElement.availableQuantity++;
        countedEvents.push(firstElement);
        continue;
      }
      const lastCountedEvent = countedEvents[countedEvents.length - 1];
      if (
        //this for exactly equal element of counted array
        lastCountedEvent.startTime.toISOString() ==
          firstElement.startTime.toISOString() &&
        lastCountedEvent.endTime.toISOString() ==
          firstElement.endTime.toISOString()
      ) {
        lastCountedEvent.availableQuantity++;
        continue;
      }

      const exMoment = extendMoment(moment);
      const rangeOne = exMoment.range(
        firstElement.startTime,
        firstElement.endTime,
      );
      const rangeTwo = exMoment.range(
        lastCountedEvent.startTime,
        lastCountedEvent.endTime,
      );
      if (rangeOne.overlaps(rangeTwo)) {
        //this for overlap element of counted array
        //here overlap means last conted item start, end date and first item in sorted array is not exactly the same
        //so we cant remove one event. so here substract maximum count by one and add both event.
        lastCountedEvent.availableQuantity++;
        lastCountedEvent.maximumPeopleCanBookEvent--;
        firstElement.availableQuantity = lastCountedEvent.availableQuantity;
        firstElement.maximumPeopleCanBookEvent =
          lastCountedEvent.maximumPeopleCanBookEvent;
        countedEvents.push(firstElement);
      } else {
        //this for non overlap element of counted array
        firstElement.availableQuantity++;
        countedEvents.push(firstElement);
      }
    }
    return countedEvents;
  }

  splitEventsIntoSlotLengths(
    scheduledEvents: ScheduledEventsDto[],
    slotLengthInMunute: number,
  ) {
    const splittedEventArray = scheduledEvents.map((event) =>
      this.splitsliptSingleExceesScheduleSplit(event, slotLengthInMunute),
    );

    return this.flattenArray(splittedEventArray);
  }

  /**
   * This is a recursive function used to split large events into
   * equal size defined in slot length of chunk,
   */
  splitsliptSingleExceesScheduleSplit(
    scheduledEvent: ScheduledEventsDto,
    slotLengthInMunute: number,
  ): ScheduledEventsDto[] {
    const timeRangeLength = moment(scheduledEvent.endTime).diff(
      scheduledEvent.startTime,
      'minute',
    );
    if (timeRangeLength > slotLengthInMunute) {
      const splitingTimeThatMatchToConfig = moment(scheduledEvent.startTime)
        .add(slotLengthInMunute, 'minute')
        .toDate();
      const firstChunkOfScheduleEvent = {
        ...scheduledEvent,
        endTime: splitingTimeThatMatchToConfig,
      };
      const secondChunkOfScheduleEvent = {
        ...scheduledEvent,
        startTime: splitingTimeThatMatchToConfig,
      };
      const recursiveSplitSchedules = this.splitsliptSingleExceesScheduleSplit(
        secondChunkOfScheduleEvent,
        slotLengthInMunute,
      );
      return [firstChunkOfScheduleEvent, ...recursiveSplitSchedules];
    } else {
      return [scheduledEvent];
    }
  }

  getScheduledEventsFormat(
    oppinements: AppoinmentEntity[],
    maxParallelBookings: number,
  ): ScheduledEventsDto[] {
    return oppinements.map((event) => ({
      firstName: event.user?.firstName,
      lastName: event.user?.lastNname,
      startTime: event.startTime,
      endTime: event.endTime,
      eventType: event.eventType?.eventType,
      gender: event.user?.gender,
      maximumPeopleCanBookEvent: maxParallelBookings,
      availableQuantity: 0,
    }));
  }

  async getUser(email: string) {
    return this.userRepo.findOne({
      where: {
        email,
      },
    });
  }

  private validateTimeBetween(startTime: Date, endTime: Date) {
    if (!startTime || !endTime || startTime > endTime) {
      throw new HttpException(
        {
          message: [`invalid values for startTime or endTime`],
          error: 'Bad Request',
          statusCode: HttpStatus.BAD_REQUEST,
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * This method validate our selected time range is not belongs to a unavailable time range.
   */
  async validateDateRangeInWorkingHours(startTime: Date, endTime: Date) {
    const definedUnavailTimes = await this.getUnavailableTimes();
    const unavailableDaysOfSelectedDay =
      this.filterTheUnavailableTimesBelongsToSelectedDay(
        definedUnavailTimes,
        startTime,
      );

    const exMoment = extendMoment(moment);

    const overLapIntervals = unavailableDaysOfSelectedDay.filter((t) => {
      const todayDate = new Date().toISOString().slice(0, 10);
      const unavailFrom = moment(todayDate.concat(' ').concat(t.startTime));
      const unavailTo = moment(todayDate.concat(' ').concat(t.endTime));
      const rangeOne = exMoment.range(unavailFrom, unavailTo);
      const rangeTwo = exMoment.range(startTime, endTime);
      return rangeOne.overlaps(rangeTwo);
    });

    if (overLapIntervals.length > 0) {
      throw new HttpException(
        {
          message: ['appoinment date is in unavailable range'],
          error: 'Bad Request',
          statusCode: HttpStatus.BAD_REQUEST,
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * This method filter the unavalable dates for particular selected date.
   */
  filterTheUnavailableTimesBelongsToSelectedDay(
    unavaialbleTimes: UnavailableTimesEntity[],
    selectedDate: Date,
  ) {
    const days = [
      'sunday',
      'monday',
      'tuesday',
      'wednesday',
      'thursday',
      'friday',
      'saterday',
    ];

    const currentDay = days[moment(selectedDate).day()];
    return unavaialbleTimes.filter((t) => {
      const unAvailDate = t.date && new Date(t.date).setUTCHours(0, 0, 0, 0);
      const currentDate = new Date().setUTCHours(0, 0, 0, 0);
      return (
        t.durationType === currentDay ||
        t.durationType === TimeDurationType.ALL_DAYS ||
        (t.durationType === TimeDurationType.ONE_DAY &&
          unAvailDate === currentDate)
      );
    });
  }

  /**
   * This method validate that the start and end time is not old time of
   * day after maximum time allowed user to book a event.
   */
  async validateSelectedTimesInMaxRange(startTime: Date, endTime: Date) {
    const globalConfig = await this.getGlobalConfig();
    const maximumApponmentDate = moment()
      .add(globalConfig.maximumOppinmentDates, 'day')
      .toDate();
    const currentDate = new Date();

    if (
      startTime > maximumApponmentDate ||
      endTime > maximumApponmentDate ||
      startTime < currentDate
    ) {
      throw new HttpException(
        {
          message: ['appoinment date is in out of range'],
          error: 'Bad Request',
          statusCode: HttpStatus.BAD_REQUEST,
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * This method validate event type recieve is correct
   * And start and end time is in between correct time deferent definved in event.
   * @return EventType
   */
  async validateSelectedEventInCorrectRangeAndFilterEventType(
    eventTypeId: number,
    startTime: Date,
    endTime: Date,
  ) {
    const eventTypes = await this.getEventTypes();
    const selectedEventType = eventTypes.filter(
      (ev) => ev.id == eventTypeId,
    )[0];
    if (!selectedEventType) {
      throw new HttpException(
        {
          message: [`event type not found for id: ${eventTypeId} `],
          error: 'Bad Request',
          statusCode: HttpStatus.BAD_REQUEST,
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const timeDiff = moment(endTime).diff(startTime, 'minute');
    if (timeDiff != selectedEventType.timeTakenInMinute) {
      throw new HttpException(
        {
          message: [`event start end end time does not match to event time`],
          error: 'Bad Request',
          statusCode: HttpStatus.BAD_REQUEST,
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    return selectedEventType;
  }

  /**
   * This method validate that the start time and end time is in correct slot.
   * And validate current selected time slot do have maximum number of events.
   * And validate between privious and selected slot have a configured amount of break.
   */
  async validateAppoinmentSlotsFilledOrInvalid(startTime: Date, endTime: Date) {
    const globalConfig = await this.getGlobalConfig();
    const midNigthTime = new Date().setUTCHours(0, 0, 0, 0);
    const startTimeFromMidNigthInMinute = moment(startTime).diff(
      midNigthTime,
      'minute',
    );

    const minuteRemanderWithSlotLength =
      startTimeFromMidNigthInMinute % globalConfig.slotLengthInMunute;

    const minuteRemanderWithSlotBreakLength =
      startTimeFromMidNigthInMinute %
      globalConfig.breakBetweenAppoinmentInMinute;

    if (
      minuteRemanderWithSlotLength > 0 &&
      minuteRemanderWithSlotBreakLength > 0
    ) {
      throw new HttpException(
        {
          message: [`invalid start time, not in correct time slot`],
          error: 'Bad Request',
          statusCode: HttpStatus.BAD_REQUEST,
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const currentAvailableAppoinments = await this.appoinmentRepo.find({
      where: {
        startTime: MoreThanOrEqual(startTime),
        endTime: LessThanOrEqual(endTime),
      },
    });

    if (currentAvailableAppoinments.length > globalConfig.maxParallelClients) {
      throw new HttpException(
        {
          message: [`maximum appoinemts are filled for this slot`],
          error: 'Bad Request',
          statusCode: HttpStatus.BAD_REQUEST,
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const previousSlotAvailability = await this.appoinmentRepo.find({
      where: {
        endTime: Equal(startTime),
      },
    });

    if (previousSlotAvailability.length > 0) {
      throw new HttpException(
        {
          message: [`appoinement cannot be placed. invalid slot`],
          error: 'Bad Request',
          statusCode: HttpStatus.BAD_REQUEST,
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  private async getGlobalConfig() {
    //read from cache
    const globalConfig = await this.cacheService.readFromCache(
      RedisKey.GLOBAL_CONFIG_KEY,
    );

    if (globalConfig) {
      return JSON.parse(globalConfig) as GlobalConfigEntity;
    }

    const configResult = await this.globalConfigRepo.find({
      take: 1,
    });

    const globalConfigValues = configResult[0];

    if (globalConfigValues) {
      await this.cacheService.addStringToCache(
        RedisKey.GLOBAL_CONFIG_KEY,
        JSON.stringify(globalConfigValues),
      );
      return globalConfigValues;
    } else {
      this.logger.error('global configuration object not found');
      throw new HttpException(
        {
          error: 'Not Found',
          message: ['global configuration object not found'],
          statusCode: HttpStatus.NOT_FOUND,
        },
        HttpStatus.NOT_FOUND,
      );
    }
  }

  private async getUnavailableTimes() {
    //read from cache
    const unavailableTimesFromCache = await this.cacheService.readFromCache(
      RedisKey.UNAVAILABLE_TIME_KEY,
    );

    if (unavailableTimesFromCache) {
      return JSON.parse(unavailableTimesFromCache) as UnavailableTimesEntity[];
    }

    const unavaialbleTimes = await this.unavailableTimeRepo.find();
    if (unavaialbleTimes.length > 0) {
      await this.cacheService.addStringToCache(
        RedisKey.UNAVAILABLE_TIME_KEY,
        JSON.stringify(unavaialbleTimes),
      );
    }
    return unavaialbleTimes;
  }

  private async getEventTypes() {
    //read from cache
    const eventTypesFromCache = await this.cacheService.readFromCache(
      RedisKey.EVENT_TYPE_KEY,
    );

    if (eventTypesFromCache) {
      return JSON.parse(eventTypesFromCache) as EventTypeEntity[];
    }

    const eventTypes = await this.eventTypeRepo.find();
    if (eventTypes.length > 0) {
      await this.cacheService.addStringToCache(
        RedisKey.EVENT_TYPE_KEY,
        JSON.stringify(eventTypes),
      );
    }
    return eventTypes;
  }

  private flattenArray<T>(array: Array<Array<T>>): Array<T> {
    return Array.prototype.concat.apply([], array);
  }
}
