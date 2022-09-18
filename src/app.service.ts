import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AppService {
  constructor(private config: ConfigService) {}
  statusCheck(): { message: string } {
    const port = this.config.get('PORT');
    return { message: `Application running on port: ${port}` };
  }
}
