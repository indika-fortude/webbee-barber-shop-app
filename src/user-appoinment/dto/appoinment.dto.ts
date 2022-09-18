import { Type } from 'class-transformer';
import { IsNotEmpty, Validate, ValidateNested } from 'class-validator';
import { EventTypeDto } from './event-type.dto';
import { UserDto } from './user.dto';

export class AppoinmentDto {
  @Type(() => Date)
  startTime: Date;

  @Type(() => Date)
  endTime: Date;

  @IsNotEmpty()
  @Type(() => UserDto)
  @ValidateNested()
  user: UserDto;

  @IsNotEmpty()
  @Type(() => EventTypeDto)
  @ValidateNested()
  eventType: EventTypeDto;
}
