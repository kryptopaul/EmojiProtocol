import { Module } from '@nestjs/common';
import { BlockchainService } from './blockchain.service';
import { ConfigModule } from '@nestjs/config';

@Module({
  providers: [BlockchainService],
  imports: [ConfigModule],
})
export class BlockchainModule {}
