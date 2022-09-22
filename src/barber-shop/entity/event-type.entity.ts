import { EventConfigEntity } from '../../barber-shop-config/entity/event-config.entity';
import { UnavailableTimesEntity } from '../../barber-shop-config/entity/unavailable-times.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Gender } from '../enum/gender.enum';

@Entity({ name: 'event_type' })
export class EventTypeEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'event_type_name' })
  eventTypeName: string;

  @Column({ name: 'gender', type: 'enum', enum: Gender })
  gender: Gender;

  @OneToOne(() => EventConfigEntity, (config) => config.eventType)
  eventConfig: EventConfigEntity;

  @OneToMany(() => UnavailableTimesEntity, (time) => time.eventType)
  unavailableTimes: UnavailableTimesEntity[];

  @CreateDateColumn({ name: 'created_date' })
  createdDate: Date;

  @UpdateDateColumn({ name: 'updated_date' })
  updatedDate: Date;
}
