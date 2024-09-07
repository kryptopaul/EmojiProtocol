import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { BotModule } from './bot/bot.module';
import { ConfigModule } from '@nestjs/config';
import { BlockchainModule } from './blockchain/blockchain.module';
import { WorldcoinModule } from './worldcoin/worldcoin.module';

@Module({
  imports: [
    BotModule,
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    BlockchainModule,
    WorldcoinModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
