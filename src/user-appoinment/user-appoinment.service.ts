import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import CacheService from '../barber-shop-config/cache.service';
import { UnavailableTimesEntity } from '../barber-shop-config/entity/unavailable-times.entity';
import { RedisKey } from '../barber-shop-config/enum/redis-key.enum';
import { EventTypeEntity } from '../barber-shop/entity/event-type.entity';
import { Equal, LessThanOrEqual, MoreThanOrEqual, Repository } from 'typeorm';
import { AppoinmentDto } from './dto/appoinment.dto';
import { AppoinmentEntity } from './entity/appoinment.entity';
import { UserEntity } from './entity/user.entity';
import * as moment from 'moment';
import { extendMoment } from 'moment-range';
import { TimeDurationType } from '../barber-shop-config/enum/time-duration-type.enum';
import { ScheduledEventsDto } from './dto/scheduled-event.dto';
import { EventConfigEntity } from '../barber-shop-config/entity/event-config.entity';
import {
  addDays,
  areIntervalsOverlapping,
  compareAsc,
  differenceInMinutes,
  getDay,
} from 'date-fns';
//over book events
//change global configuration for the specific event type
//validation for pre-unavailable dates do not work
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
    @InjectRepository(EventConfigEntity)
    private eventConfigRepo: Repository<EventConfigEntity>,
    @InjectRepository(UnavailableTimesEntity)
    private unavailableTimeRepo: Repository<UnavailableTimesEntity>,
    private cacheService: CacheService,
  ) {}

  async createUserAppoinement(appoinment: AppoinmentDto) {
    const eventId = appoinment.eventType.id;
    this.validateTimeBetween(appoinment.startTime, appoinment.endTime);
    await this.validateSelectedTimesInMaxRange(
      appoinment.startTime,
      appoinment.endTime,
      eventId,
    );
    await this.validateDateRangeInWorkingHours(
      appoinment.startTime,
      appoinment.endTime,
      eventId,
    );

    const eventType =
      await this.validateSelectedEventInCorrectRangeAndFilterEventType(
        appoinment.eventType.id,
        appoinment.startTime,
        appoinment.endTime,
      );
    appoinment.eventType = eventType;

    await this.validateAppoinmentSlotsOverLapTwoSlots(
      appoinment.startTime,
      eventId,
    );

    await this.validateNumberOfEventsInATimeSlot(
      appoinment.startTime,
      appoinment.endTime,
      eventId,
    );

    const user = await this.getUser(appoinment.user.email);
    if (user) {
      appoinment.user = user;
    }

    const appoinmentEntity = this.appoinmentRepo.create(appoinment);
    return this.appoinmentRepo.save(appoinmentEntity);
  }

  async getAllScheduleEventsForEvent(eventId: number) {
    const globalConfig = await this.getEventConfig(eventId);
    const currentTimestamp = new Date();
    const currentLastDayForAppoinment = moment()
      .add(globalConfig.maximumAppinmentDates, 'day')
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
      eventType: event.eventType?.eventTypeName,
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
  async validateDateRangeInWorkingHours(
    startTime: Date,
    endTime: Date,
    eventId: number,
  ) {
    const definedUnavailTimes = await this.getUnavailableTimes(eventId);
    const unavailableDaysOfSelectedDay =
      this.filterTheUnavailableTimesBelongsToSelectedDay(
        definedUnavailTimes,
        startTime,
      );

    const overLapIntervals = unavailableDaysOfSelectedDay.filter((t) => {
      const selectedDateStr = new Date(startTime).toLocaleDateString();
      const unavailFrom = new Date(
        selectedDateStr.concat(' ').concat(t.startTime),
      );
      const unavailTo = new Date(selectedDateStr.concat(' ').concat(t.endTime));
      return areIntervalsOverlapping(
        { start: unavailFrom, end: unavailTo },
        { start: startTime, end: endTime },
      );
    });

    if (overLapIntervals.length > 0) {
      this.logger.error(
        `appoinment date is in unavailable range: startTime: ${startTime}, endTime: ${endTime}, eventID: ${eventId}`,
      );
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

    const selectedDay = days[getDay(selectedDate)];
    return unavaialbleTimes.filter((t) => {
      const unAvailDate = t.date && new Date(t.date).setUTCHours(0, 0, 0, 0);
      const currentDate = new Date().setUTCHours(0, 0, 0, 0);
      return (
        t.durationType === selectedDay ||
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
  async validateSelectedTimesInMaxRange(
    startTime: Date,
    endTime: Date,
    eventId: number,
  ) {
    const globalConfig = await this.getEventConfig(eventId);
    const maximumApponmentDate = addDays(
      Date.now(),
      globalConfig.maximumAppinmentDates,
    );
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
    const eventType = await this.getEventType(eventTypeId);

    if (!eventType) {
      throw new HttpException(
        {
          message: [`event type not found for id: ${eventTypeId} `],
          error: 'Bad Request',
          statusCode: HttpStatus.BAD_REQUEST,
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const timeDiff = differenceInMinutes(endTime, startTime);
    const { slotLengthInMunute } = eventType.eventConfig;
    if (timeDiff != slotLengthInMunute) {
      throw new HttpException(
        {
          message: [`event start end end time does not match to event time`],
          error: 'Bad Request',
          statusCode: HttpStatus.BAD_REQUEST,
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    return eventType;
  }

  /**
   * This method validate that the start time and end time is in correct slot.
   * And validate current selected time slot do have maximum number of events.
   * And validate between privious and selected slot have a configured amount of break.
   */
  async validateAppoinmentSlotsOverLapTwoSlots(
    startTime: Date,
    eventId: number,
  ) {
    const eventConfig = await this.getEventConfig(eventId);
    const definedUnavailTimes = await this.getUnavailableTimes(eventId);
    const unavailableDaysOfSelectedDay =
      this.filterTheUnavailableTimesBelongsToSelectedDay(
        definedUnavailTimes,
        startTime,
      );

    const selectedDateStr = new Date(startTime).toLocaleDateString();
    const unavailableEndTimes = unavailableDaysOfSelectedDay.map(
      (unavailTime) =>
        new Date(selectedDateStr.concat(' ').concat(unavailTime.endTime)),
    );

    const nearestUnavailableEndTime = this.findNearestDateOfDates(
      unavailableEndTimes,
      startTime,
    );

    const timeBetweenNearestUnavailAndStartTime = differenceInMinutes(
      startTime,
      nearestUnavailableEndTime,
    );

    const timeBetweenTwoSlotInMinute =
      eventConfig.slotLengthInMunute +
      eventConfig.breakBetweenAppoinmentInMinute;

    const minuteRemanderWithSlotLengths =
      timeBetweenNearestUnavailAndStartTime % timeBetweenTwoSlotInMinute;

    if (minuteRemanderWithSlotLengths > 0) {
      throw new HttpException(
        {
          message: [`invalid start time, not in correct time slot`],
          error: 'Bad Request',
          statusCode: HttpStatus.BAD_REQUEST,
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  findNearestDateOfDates(dates: Date[], comparativeDate: Date) {
    const sortedDates = dates.sort(compareAsc);
    let dateDiffInMinute = Infinity;
    let lastNearestDate: Date = null;
    for (const date of sortedDates) {
      const timeDiff = differenceInMinutes(comparativeDate, date);
      if (timeDiff >= 0 && dateDiffInMinute > timeDiff) {
        dateDiffInMinute = timeDiff;
        lastNearestDate = date;
      } else if (timeDiff < 0) {
        return lastNearestDate;
      }
    }
    return lastNearestDate;
  }

  async validateNumberOfEventsInATimeSlot(
    startTime: Date,
    endTime: Date,
    eventId: number,
  ) {
    const eventConfig = await this.getEventConfig(eventId);

    const currentAvailableAppoinments = await this.appoinmentRepo.find({
      where: {
        startTime: Equal(startTime),
        endTime: Equal(endTime),
        eventType: { id: eventId },
      },
    });

    if (currentAvailableAppoinments.length > eventConfig.maxParallelClients) {
      throw new HttpException(
        {
          message: [`maximum appoinemts are filled for this slot`],
          error: 'Bad Request',
          statusCode: HttpStatus.BAD_REQUEST,
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  private async getEventConfig(eventId: number) {
    //read from cache
    const eventConfig = await this.cacheService.readFromCache(
      RedisKey.EVENT_CONFIG_KEY.concat(eventId.toString()),
    );

    if (eventConfig) {
      return JSON.parse(eventConfig) as EventConfigEntity;
    }

    const eventConfigValues = await this.eventConfigRepo.findOne({
      where: { eventType: { id: eventId } },
    });

    if (eventConfigValues) {
      await this.cacheService.addStringToCache(
        RedisKey.EVENT_CONFIG_KEY.concat(eventId.toString()),
        JSON.stringify(eventConfigValues),
      );
      return eventConfigValues;
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

  private async getUnavailableTimes(eventId: number) {
    //read from cache
    const unavailableTimesFromCache = await this.cacheService.readFromCache(
      RedisKey.UNAVAILABLE_TIME_KEY.concat(eventId.toString()),
    );

    if (unavailableTimesFromCache) {
      return JSON.parse(unavailableTimesFromCache) as UnavailableTimesEntity[];
    }

    const unavaialbleTimes = await this.unavailableTimeRepo.find({
      where: { eventType: { id: eventId } },
    });
    if (unavaialbleTimes.length > 0) {
      await this.cacheService.addStringToCache(
        RedisKey.UNAVAILABLE_TIME_KEY.concat(eventId.toString()),
        JSON.stringify(unavaialbleTimes),
      );
    }
    return unavaialbleTimes;
  }

  private async getEventType(eventId: number) {
    //read from cache
    const eventTypesFromCache = await this.cacheService.readFromCache(
      RedisKey.EVENT_TYPE_KEY.concat(eventId.toString()),
    );

    if (eventTypesFromCache) {
      return JSON.parse(eventTypesFromCache) as EventTypeEntity;
    }

    const eventType = await this.eventTypeRepo.findOne({
      where: { id: eventId },
      relations: ['eventConfig'],
    });
    if (eventType) {
      await this.cacheService.addStringToCache(
        RedisKey.EVENT_TYPE_KEY.concat(eventId.toString()),
        JSON.stringify(eventType),
      );
    }
    return eventType;
  }

  private flattenArray<T>(array: Array<Array<T>>): Array<T> {
    return Array.prototype.concat.apply([], array);
  }
}
