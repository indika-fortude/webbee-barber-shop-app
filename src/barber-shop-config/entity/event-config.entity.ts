import { EventTypeEntity } from '../../barber-shop/entity/event-type.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';

@Entity({ name: 'event_config' })
export class EventConfigEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'max_parallel_clients' })
  maxParallelClients: number;

  @Column({ name: 'slot_length_in_munute' })
  slotLengthInMunute: number;

  @Column({ name: 'break_between_appoinment_in_minute' })
  breakBetweenAppoinmentInMinute: number;

  @Column({ name: 'maximum_appinment_dates' })
  maximumAppinmentDates: number;

  @VersionColumn()
  version: number;

  @CreateDateColumn({ name: 'created_date' })
  createdDate: Date;

  @UpdateDateColumn({ name: 'updated_date' })
  updatedDate: Date;

  @OneToOne(() => EventTypeEntity, (event) => event.eventConfig)
  @JoinColumn({ name: 'event_type_id' })
  eventType: EventTypeEntity;
}
