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
import { ScheduledEventsDto } from './dto/scheduled-event.dto';
import { EventConfigEntity } from '../barber-shop-config/entity/event-config.entity';
import {
  addDays,
  addMinutes,
  addSeconds,
  areIntervalsOverlapping,
  compareAsc,
  differenceInMinutes,
  endOfDay,
  getDay,
} from 'date-fns';
import { TimeRange } from './types/time-range.type';
import { TimeDurationType } from 'src/barber-shop-config/enum/time-duration-type.enum';
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

  /**
   * create new appoinment for a selected event
   */
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

  /**
   * Return All the avalable time slots for a event id,
   * Time slot will be provided for configured time period.
   */
  async getAllAvailableSlotsForEvents(eventId: number) {
    const eventConfig = await this.getEventConfig(eventId);

    const dateRangesTillMaxDate =
      this.getDateRangesFromCurrentToDefinedLengthOfDays(
        eventConfig.maximumAppoinmentDates,
      );

    const availableRangesPms = dateRangesTillMaxDate.map((timeRange) =>
      this.getAppoinmentTimeSlotsByRemovingUnavailableTimes(
        timeRange,
        eventConfig.slotLengthInMunute,
        eventConfig.breakBetweenAppoinmentInMinute,
        eventConfig.maxParallelClients,
        eventId,
      ),
    );

    const availableRangesArr = await Promise.all(availableRangesPms);
    const availableRanges = this.flattenArray(availableRangesArr);

    const availableTimeSlots =
      await this.reduceAvailabiltyCountForAlreadyAssignSlots(
        eventId,
        availableRanges,
      );

    return availableTimeSlots.map((i) => ({
      ...i,
      startTime: i.startTime.toLocaleString(),
      endTime: i.endTime.toLocaleString(),
    }));
  }

  getDateRangesFromCurrentToDefinedLengthOfDays(
    maximumNumOfDays: number,
  ): TimeRange[] {
    const dateRanges = [];
    const lastAppoinmentDate = addDays(Date.now(), maximumNumOfDays);
    let startTime = new Date();
    while (startTime < lastAppoinmentDate) {
      const endDateForTheDay = endOfDay(startTime);
      const dayEndDate =
        endDateForTheDay > lastAppoinmentDate
          ? lastAppoinmentDate
          : endDateForTheDay;
      dateRanges.push({ startTime: startTime, endTime: dayEndDate });
      startTime = addSeconds(endOfDay(startTime), 1);
    }
    return dateRanges;
  }

  async getAppoinmentTimeSlotsByRemovingUnavailableTimes(
    timeRangeToSplit: TimeRange,
    slotLengthInMin: number,
    breakTimeInMin: number,
    maxParallelSlots: number,
    eventId: number,
  ): Promise<TimeRange[]> {
    const definedUnavailTimes = await this.getUnavailableTimes(eventId);
    const unavailableDaysOfSelectedDay =
      this.filterTheUnavailableTimesBelongsToSelectedDay(
        definedUnavailTimes,
        timeRangeToSplit.startTime,
      );

    const nonOverLapUnavailDays = this.findOverlapsOnUnavailableTimes(
      unavailableDaysOfSelectedDay,
      timeRangeToSplit.startTime,
    );

    const unavailableEndTimes = nonOverLapUnavailDays.map(
      (unavailTime) => new Date(unavailTime.endTime),
    );
    const nearestUnavailableEndTime = this.findNearestDateOfDates(
      unavailableEndTimes,
      timeRangeToSplit.startTime,
    );

    let slotStartTime =
      nearestUnavailableEndTime > timeRangeToSplit.startTime
        ? nearestUnavailableEndTime
        : this.getTheNearestPossibleTimeSlotStartTime(
            timeRangeToSplit.startTime,
            nearestUnavailableEndTime,
            slotLengthInMin,
            breakTimeInMin,
          );

    nonOverLapUnavailDays.sort((t1, t2) =>
      compareAsc(t1.startTime, t2.startTime),
    );

    //this is becouse earlier start date is filters so here no need to consider is again.
    nonOverLapUnavailDays.shift();
    const timeSlots = [];

    let fistUnavailElement = nonOverLapUnavailDays.shift();
    if (!fistUnavailElement) return timeSlots;

    while (slotStartTime < timeRangeToSplit.endTime) {
      const slotEndTime = addMinutes(slotStartTime, slotLengthInMin);
      const slotEndWithBreak = addMinutes(
        slotStartTime,
        slotLengthInMin + breakTimeInMin,
      );
      if (
        fistUnavailElement.startTime > slotStartTime &&
        fistUnavailElement.startTime >= slotEndWithBreak
      ) {
        timeSlots.push({
          startTime: slotStartTime,
          endTime: slotEndTime,
          maxAvailableSlots: maxParallelSlots,
          currentAvailableSlots: maxParallelSlots,
        });
        slotStartTime = slotEndWithBreak;
      } else {
        slotStartTime = fistUnavailElement.endTime;
        fistUnavailElement = nonOverLapUnavailDays.shift();
        if (!fistUnavailElement) {
          fistUnavailElement = {
            startTime: timeRangeToSplit.endTime,
            endTime: timeRangeToSplit.endTime,
          };
        }
      }
    }

    return timeSlots;
  }

  async reduceAvailabiltyCountForAlreadyAssignSlots(
    eventId: number,
    availableSlots: TimeRange[],
  ) {
    const appoinements = await this.getAllScheduleEventsForEvent(eventId);

    if (appoinements.length == 0) {
      return availableSlots;
    }

    const appoinementsDates = appoinements.map((appoinment) => ({
      ...appoinment,
      startTime: new Date(appoinment.startTime),
      endTime: new Date(appoinment.endTime),
    }));
    appoinementsDates.sort((t1, t2) => compareAsc(t1.startTime, t2.startTime));
    availableSlots.sort((t1, t2) => compareAsc(t1.startTime, t2.startTime));

    let nextAppoinment = appoinementsDates.shift();

    for (const slots of availableSlots) {
      if (nextAppoinment.startTime.getTime() === slots.startTime.getTime()) {
        slots.currentAvailableSlots -= nextAppoinment.countPerSlot;
        nextAppoinment = appoinementsDates.shift();
      }

      if (!nextAppoinment) {
        return availableSlots;
      }
    }
  }

  getTheNearestPossibleTimeSlotStartTime(
    startTime: Date,
    shopOpeningTime: Date,
    slotLengthInMin: number,
    intervalTimeInMin: number,
  ) {
    const diffInMinute = differenceInMinutes(startTime, shopOpeningTime);
    const totalTimeWithBreak = slotLengthInMin + intervalTimeInMin;
    const remainderOfMinute = diffInMinute % totalTimeWithBreak;
    if (remainderOfMinute > 0) {
      const newStartTimeSlot = addMinutes(
        startTime,
        totalTimeWithBreak - remainderOfMinute,
      );
      return new Date(newStartTimeSlot.setSeconds(0, 0));
    }
    return new Date(startTime.setSeconds(0, 0));
  }

  /**
   * This method returns all the scheduled appoinments in slot wise.
   * startTime and endTime of each object would be in format of local string.
   */
  async getAllScheduleEventsForEvent(eventId: number) {
    const globalConfig = await this.getEventConfig(eventId);

    const appoinements = await this.getAllAppoinmentInMaximumTimeRange(
      globalConfig.maximumAppoinmentDates,
      eventId,
      new Date(),
    );

    const scheduledEvents = this.getScheduledEventsFormat(appoinements);

    const eventsOfDeferentTimeSlots =
      this.countEventsInSameSlotRanges(scheduledEvents);

    return eventsOfDeferentTimeSlots.map((event) => ({
      ...event,
      startTime: new Date(event.startTime).toLocaleString(),
      endTime: new Date(event.endTime).toLocaleString(),
    }));
  }

  countEventsInSameSlotRanges(
    scheduledEvents: ScheduledEventsDto[],
  ): ScheduledEventsDto[] {
    const scheduledTimeObj = {};
    scheduledEvents.forEach((event) => {
      const startTime = event.startTime.toISOString();
      const endTime = event.endTime.toISOString();
      const existEvent = scheduledTimeObj[startTime.concat(endTime)];
      if (existEvent) {
        existEvent.countPerSlot++;
      } else {
        event.countPerSlot++;
        scheduledTimeObj[startTime.concat(endTime)] = event;
      }
    });

    return Object.values(scheduledTimeObj);
  }

  async getAllAppoinmentInMaximumTimeRange(
    maximumAppoinmentDates: number,
    eventId: number,
    fromDate: Date,
  ) {
    const currentTimestamp = fromDate;
    const currentLastDayForAppoinment = addDays(
      Date.now(),
      maximumAppoinmentDates,
    );

    return this.appoinmentRepo.find({
      where: {
        startTime: MoreThanOrEqual(currentTimestamp),
        endTime: LessThanOrEqual(currentLastDayForAppoinment),
        eventType: { id: eventId },
      },
      relations: ['eventType'],
      select: ['startTime', 'endTime', 'eventType'],
    });
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
  ): ScheduledEventsDto[] {
    return oppinements.map((event) => ({
      startTime: event.startTime,
      endTime: event.endTime,
      eventType: event.eventType?.eventTypeName,
      countPerSlot: 0,
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

    const nonOverLapUnavailDays = this.findOverlapsOnUnavailableTimes(
      unavailableDaysOfSelectedDay,
      startTime,
    );

    const overLapIntervals = nonOverLapUnavailDays.filter((t) => {
      return areIntervalsOverlapping(
        { start: t.startTime, end: t.endTime },
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
      const currentDate = new Date(selectedDate).setUTCHours(0, 0, 0, 0);
      return (
        t.durationType === selectedDay ||
        t.durationType === TimeDurationType.ALL_DAYS ||
        (t.durationType === TimeDurationType.ONE_DAY &&
          unAvailDate === currentDate)
      );
    });
  }

  findOverlapsOnUnavailableTimes(
    unavaialbleTimes: UnavailableTimesEntity[],
    selectedTime: Date,
  ): { startTime: Date; endTime: Date }[] {
    if (unavaialbleTimes.length === 0) return [];

    const dateOfSelectedTime = selectedTime.toLocaleDateString();
    const unavailTimes = unavaialbleTimes.map((time) => ({
      startTime: new Date(
        dateOfSelectedTime.concat(' ').concat(time.startTime),
      ),
      endTime: new Date(dateOfSelectedTime.concat(' ').concat(time.endTime)),
    }));
    unavailTimes.sort((t1, t2) => compareAsc(t1.startTime, t2.startTime));

    let fistTime = unavailTimes.shift();
    let searchedItems = 0;
    const newUnAvailableTimes = [];
    while (unavailTimes.length > 0) {
      const nextUvTime = unavailTimes[searchedItems];
      if (!nextUvTime) {
        newUnAvailableTimes.push(fistTime);
        return newUnAvailableTimes;
      } else if (
        areIntervalsOverlapping(
          { start: fistTime.startTime, end: fistTime.endTime },
          { start: nextUvTime.startTime, end: nextUvTime.endTime },
        )
      ) {
        const newTime = {
          startTime:
            fistTime.startTime > nextUvTime.startTime
              ? nextUvTime.startTime
              : fistTime.startTime,
          endTime:
            fistTime.endTime > nextUvTime.endTime
              ? fistTime.endTime
              : nextUvTime.endTime,
        };
        fistTime = newTime;
        searchedItems++;
      } else {
        newUnAvailableTimes.push(fistTime);
        fistTime = unavailTimes.shift();
        searchedItems = 0;

        if (unavailTimes.length === 0) {
          newUnAvailableTimes.push(nextUvTime);
        }
      }
    }

    return newUnAvailableTimes;
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
      globalConfig.maximumAppoinmentDates,
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
    dates.sort(compareAsc);
    let dateDiffInMinute = Infinity;
    let lastNearestDate: Date = dates[0];
    for (const date of dates) {
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

    if (currentAvailableAppoinments.length >= eventConfig.maxParallelClients) {
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
