import { Module } from '@nestjs/common';
import { WorldcoinService } from './worldcoin.service';
import { ConfigModule } from '@nestjs/config';

@Module({
  providers: [WorldcoinService],
  imports: [ConfigModule],
})
export class WorldcoinModule {}
