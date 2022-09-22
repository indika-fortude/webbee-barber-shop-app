import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventTypeEntity } from '../barber-shop/entity/event-type.entity';
import { Repository } from 'typeorm';
import { BarberShopConfigService } from './barber-shop-config.service';
import CacheService from './cache.service';
import { EventConfigEntity } from './entity/event-config.entity';
import { UnavailableTimesEntity } from './entity/unavailable-times.entity';

describe('BarberShopConfigService', () => {
  let service: BarberShopConfigService;
  let eventConfigRepo: Repository<EventConfigEntity>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BarberShopConfigService,
        {
          provide: getRepositoryToken(EventConfigEntity),
          useValue: {
            find: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(UnavailableTimesEntity),
          useValue: {
            find: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(EventTypeEntity),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: CacheService,
          useValue: {
            invalidateCache: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<BarberShopConfigService>(BarberShopConfigService);
    eventConfigRepo = module.get<Repository<EventConfigEntity>>(
      getRepositoryToken(EventConfigEntity),
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('it should test getLatestConfig', async () => {
    const spy = jest
      .spyOn(eventConfigRepo, 'find')
      .mockImplementation(async () => [new EventConfigEntity()]);

    await service.getLatestConfig(1);
    expect(spy).toBeCalled();
  });
});
