import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventTypeEntity } from '../barber-shop/entity/event-type.entity';
import { Repository } from 'typeorm';
import { UserAppoinmentService } from './user-appoinment.service';
import { EventConfigEntity } from '../barber-shop-config/entity/event-config.entity';
import { AppoinmentEntity } from './entity/appoinment.entity';
import { UserEntity } from './entity/user.entity';
import { UnavailableTimesEntity } from '../barber-shop-config/entity/unavailable-times.entity';
import CacheService from '../barber-shop-config/cache.service';
import { AppoinmentDto } from './dto/appoinment.dto';
import { addDays } from 'date-fns';

describe('BarberShopConfigService', () => {
  let service: UserAppoinmentService;
  let cacheService: CacheService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserAppoinmentService,
        {
          provide: getRepositoryToken(AppoinmentEntity),
          useValue: {
            find: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(UserEntity),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(EventTypeEntity),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(EventConfigEntity),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(UnavailableTimesEntity),
          useValue: {
            find: jest.fn(),
          },
        },
        {
          provide: CacheService,
          useValue: {
            readFromCache: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<UserAppoinmentService>(UserAppoinmentService);
    cacheService = module.get<CacheService>(CacheService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createUserAppoinement tests', () => {
    it('should throw invalid time range', async () => {
      const appoinment = {
        startTime: new Date('2022-09-23T11:15:00.309+05:30'),
        endTime: new Date('2022-09-23T11:25:00.309+05:30'),
        user: {
          email: 'wmhindika@gmail.com',
          firstName: 'Hasitha',
          lastNname: 'Indika',
          gender: 'MALE',
        },
        eventType: {
          id: 1,
        },
      } as AppoinmentDto;
      expect(service.createUserAppoinement(appoinment)).rejects.toThrow(
        'Http Exception',
      );
    });

    it('should throw time range in out of range', async () => {
      const config = {
        id: 1,
        maxParallelClients: 3,
        slotLengthInMunute: 10,
        breakBetweenAppoinmentInMinute: 5,
        maximumAppoinmentDates: 7,
      } as EventConfigEntity;

      jest
        .spyOn(cacheService, 'readFromCache')
        .mockImplementation(() => Promise.resolve(JSON.stringify(config)));

      const startTime = addDays(Date.now(), 9);
      const appoinment = {
        startTime: startTime,
        endTime: startTime,
        user: {
          email: 'wmhindika@gmail.com',
          firstName: 'Hasitha',
          lastNname: 'Indika',
          gender: 'MALE',
        },
        eventType: {
          id: 1,
        },
      } as AppoinmentDto;

      await expect(service.createUserAppoinement(appoinment)).rejects.toThrow(
        'Http Exception',
      );
    });
  });
});
