import { Module } from '@nestjs/common';
import { BotService } from './bot.service';
import { ConfigModule } from '@nestjs/config';
import { BlockchainService } from 'src/blockchain/blockchain.service';
import { WorldcoinService } from 'src/worldcoin/worldcoin.service';

@Module({
  providers: [BotService, BlockchainService, WorldcoinService],
  imports: [ConfigModule],
})
export class BotModule {}
