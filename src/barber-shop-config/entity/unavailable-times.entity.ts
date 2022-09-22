import { EventTypeEntity } from '../../barber-shop/entity/event-type.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { TimeDurationType } from '../enum/time-duration-type.enum';

@Entity({ name: 'unavailable_times' })
export class UnavailableTimesEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'start_time', type: 'time without time zone' })
  startTime: string;

  @Column({ name: 'end_time', type: 'time without time zone' })
  endTime: string;

  @Column({ type: 'date', nullable: true })
  date: Date;

  @Column({ name: 'duration_types', enum: TimeDurationType, type: 'enum' })
  durationType: TimeDurationType;

  @ManyToOne(() => EventTypeEntity, (event) => event.eventConfig)
  @JoinColumn({ name: 'event_type_id' })
  eventType: EventTypeEntity;

  @CreateDateColumn({ name: 'created_date' })
  createdDate: Date;

  @UpdateDateColumn({ name: 'updated_date' })
  updatedDate: Date;
}
