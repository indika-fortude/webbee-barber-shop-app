import { IsNotEmpty, Min } from 'class-validator';

export class EventTypeDto {
  @Min(1)
  id: number;
}
