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
import { UserEntity } from './user.entity';

@Entity({ name: 'appoinment' })
export class AppoinmentEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'start_time' })
  startTime: Date;

  @Column({ name: 'end_time' })
  endTime: Date;

  @ManyToOne(() => UserEntity, { onUpdate: 'CASCADE', cascade: true })
  @JoinColumn({ name: 'user_id' })
  user: UserEntity;

  @ManyToOne(() => EventTypeEntity)
  @JoinColumn({ name: 'event_type_id' })
  eventType: EventTypeEntity;

  @CreateDateColumn({ name: 'created_date' })
  createdDate: Date;

  @UpdateDateColumn({ name: 'updated_date' })
  updatedDate: Date;
}
