import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BarberShopConfigService } from './barber-shop-config.service';
import CacheService from './cache.service';
import { GlobalConfigEntity } from './entity/global-config.entity';
import { UnavailableTimesEntity } from './entity/unavailable-times.entity';

describe('BarberShopConfigService', () => {
  let service: BarberShopConfigService;
  let globalConfigRepo: Repository<GlobalConfigEntity>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BarberShopConfigService,
        {
          provide: getRepositoryToken(GlobalConfigEntity),
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
          provide: CacheService,
          useValue: {
            invalidateCache: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<BarberShopConfigService>(BarberShopConfigService);
    globalConfigRepo = module.get<Repository<GlobalConfigEntity>>(
      getRepositoryToken(GlobalConfigEntity),
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('it should test getLatestConfig', async () => {
    const spy = jest
      .spyOn(globalConfigRepo, 'find')
      .mockImplementation(async () => [new GlobalConfigEntity()]);

    await service.getLatestConfig();
    expect(spy).toBeCalled();
  });
});
