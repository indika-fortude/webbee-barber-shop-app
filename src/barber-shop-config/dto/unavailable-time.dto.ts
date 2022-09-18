import { IsDate, IsEnum, IsOptional, Matches } from 'class-validator';
import { TimeDurationType } from '../enum/time-duration-type.enum';

export class UnavaialbleTimesDto {
  @Matches(/^([0-1]?\d|2[0-3]):[0-5]\d:[0-5]\d$/)
  startTime: string;

  @Matches(/^([0-1]?\d|2[0-3]):[0-5]\d:[0-5]\d$/)
  endTime: string;

  date: Date;

  @IsEnum(TimeDurationType)
  durationType: TimeDurationType;
}
