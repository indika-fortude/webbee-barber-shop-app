import { IsEnum, IsNotEmpty, Min } from 'class-validator';
import { Gender } from '../enum/gender.enum';

export class EventTypeDto {
  @IsNotEmpty()
  eventType: string;

  @Min(1)
  timeTakenInMinute: number;

  @IsEnum(Gender)
  gender: Gender;
}
