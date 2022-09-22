import { Min } from 'class-validator';

export class EventConfigDto {
  @Min(1)
  maxParallelClients: number;
  @Min(1)
  slotLengthInMunute: number;
  @Min(1)
  breakBetweenAppoinmentInMinute: number;
  @Min(1)
  maximumAppinmentDates: number;
  @Min(1)
  eventId: number;
}
