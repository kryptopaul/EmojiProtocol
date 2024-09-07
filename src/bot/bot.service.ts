import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as TelegramBot from 'node-telegram-bot-api';
import { prisma } from 'src/lib/db';
import { isAddress } from 'viem';

import { BlockchainService } from 'src/blockchain/blockchain.service';
import { WorldcoinService } from 'src/worldcoin/worldcoin.service';

@Injectable()
export class BotService {
  private bot: TelegramBot;

  constructor(
    private configService: ConfigService,
    private blockchainService: BlockchainService,
    private worldcoinService: WorldcoinService,
  ) {
    this.bot = new TelegramBot(
      this.configService.getOrThrow('TELEGRAM_TOKEN'),
      {
        polling: true,
      },
    );
    this.bot.on('message', (msg) => {
      this.handleMessage(msg);
    });
    this.bot.setMyCommands([
      {
        command: 'wallet',
        description: 'Set your wallet address.Required to spin.',
      },
      {
        command: 'verify',
        description: 'Verify with Worldcoin to get reduced fees!',
      },
      {
        command: 'pool',
        description: 'Return the pool address and current balance.',
      },
    ]);

    this.bot.onText(/\/wallet (.+)/, this.handleWalletCommand.bind(this));
    this.bot.onText(/\/verify/, this.handleWorldcoinVerify.bind(this));
  }

  async handleMessage(msg: TelegramBot.Message) {
    if (msg.dice) {
      const isRegistered = await prisma.telegramUser.findFirst({
        where: {
          id: msg.from.id,
        },
      });

      if (!isRegistered) {
        await this.handleNoWalletRegistered(msg);
        return;
      }

      if (msg.dice.value === 64) {
        this.handleWin(msg);
      } else {
        this.handleLost(msg);
      }
    }
  }

  async handleNoWalletRegistered(msg: TelegramBot.Message) {
    const registerMessage = await this.bot.sendMessage(
      msg.chat.id,
      `@${msg.from.username}, you have not registered. Use /wallet <address> to link your account to your wallet.`,
      {
        reply_to_message_id: msg.message_id,
        parse_mode: 'Markdown', // Enable Markdown for username mention
      },
    );
    // setTimeout(async () => {
    //   await this.bot.deleteMessage(
    //     registerMessage.chat.id,
    //     registerMessage.message_id,
    //   );
    // }, 5000);

    // await this.bot.deleteMessage(msg.chat.id, msg.message_id);
  }

  async handleWalletCommand(
    msg: TelegramBot.Message,
    match: RegExpExecArray | null,
  ) {
    if (match && match[1]) {
      const walletAddress = match[1];
      let addressToUpsert = walletAddress;

      if (isAddress(walletAddress)) {
      } else if (walletAddress.endsWith('.eth')) {
        console.log(`ens detected`);
        const ensAddress =
          await this.blockchainService.resolveEns(walletAddress);
        console.log(`resolved: ${ensAddress}`);
        if (ensAddress) {
          addressToUpsert = ensAddress;
        } else {
          await this.bot.sendMessage(
            msg.chat.id,
            'Invalid wallet address. ENS resolution failed.',
            {
              reply_to_message_id: msg.message_id,
            },
          );
          return;
        }
      } else {
        await this.bot.sendMessage(
          msg.chat.id,
          'Invalid wallet address. Please provide a valid Ethereum address or ENS name.',
          {
            reply_to_message_id: msg.message_id,
          },
        );
        return;
      }
      await prisma.telegramUser.upsert({
        where: {
          id: msg.from.id,
        },
        create: {
          id: msg.from.id,
          address: addressToUpsert,
        },
        update: {
          address: addressToUpsert,
        },
      });
      await this.bot.sendMessage(
        msg.chat.id,
        `Wallet address set to: ${addressToUpsert}`,
        {
          reply_to_message_id: msg.message_id,
        },
      );
    } else {
      await this.bot.sendMessage(
        msg.chat.id,
        'Please provide a wallet address. Usage: /wallet <address>',
        {
          reply_to_message_id: msg.message_id,
        },
      );
    }
  }

  async handleWorldcoinVerify(msg: TelegramBot.Message) {
    console.log('handleWorldcoinVerify');
    const isKYC = await prisma.worldcoinVerification.findFirst({
      where: {
        userId: msg.from.id,
        status: 'SUCCESS',
      },
    });
    if (isKYC) {
      console.log('Kyc already');
      await this.bot.sendMessage(msg.chat.id, 'You are already verified', {
        reply_to_message_id: msg.message_id,
      });
      return;
    }

    const challenge = await this.worldcoinService.generateChallenge();
    console.log(challenge);
    await prisma.worldcoinVerification.create({
      data: {
        user: {
          connect: { id: msg.from.id },
        },
        status: 'PENDING',
        isVerified: false,
        requestId: challenge.request_id,
      },
    });
    await this.bot.sendMessage(msg.chat.id, challenge.challengeLink, {
      reply_to_message_id: msg.message_id,
    });
  }

  async handleWin(msg: TelegramBot.Message) {
    await this.bot.sendMessage(msg.chat.id, 'hugo win', {
      reply_to_message_id: msg.message_id,
    });
    console.log(`${msg.from.first_name} spinned ${msg.dice.value} and won.`);
  }
  async handleLost(msg: TelegramBot.Message) {
    await this.bot.sendAnimation(
      msg.chat.id,
      'https://media1.tenor.com/m/4OYd5OlYR9wAAAAd/gamba-xqc.gif',
      {
        reply_to_message_id: msg.message_id,
        caption: 'Congratulations! 🎉🥳',
      },
    );
    console.log(`${msg.from.first_name} spinned ${msg.dice.value} and lost.`);
  }
}
