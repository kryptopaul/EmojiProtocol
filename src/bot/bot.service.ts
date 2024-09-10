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
      {
        command: 'leaderboard',
        description: 'Return the top winners.',
      },
    ]);

    this.bot.onText(/\/wallet (.+)/, this.handleWalletCommand.bind(this));
    this.bot.onText(/\/verify/, this.handleWorldcoinVerify.bind(this));
    this.bot.onText(/\/leaderboard/, this.handleLeaderboard.bind(this));
    this.bot.onText(/\/pool/, this.handlePool.bind(this));
  }

  async handleMessage(msg: TelegramBot.Message) {
    if (msg.dice) {
      console.log(msg);
      if (msg.forward_from) {
        return await this.bot.sendMessage(msg.chat.id, 'nice try retard', {
          reply_to_message_id: msg.message_id,
        });
      }
      const user = await prisma.telegramUser.findFirst({
        where: {
          id: msg.from.id.toString(),
        },
      });

      if (!user) {
        await this.handleNoWalletRegistered(msg);
        return;
      }

      // if (!user.lastSpinTime) {
      // } else if (user.lastSpinTime > new Date(new Date().getTime() - 60000)) {
      //   console.log(user.lastSpinTime);
      //   console.log(new Date(new Date().getTime() - 6000));
      //   await this.handleTimeout(msg);
      //   return;
      // }
      await prisma.telegramUser.update({
        where: {
          id: msg.from.id.toString(),
        },
        data: {
          lastSpinTime: new Date(),
        },
      });

      if (msg.dice.value === 64) {
        this.handleWin(msg);
      } else {
        this.handleLost(msg);
      }
    }
  }

  async handleTimeout(msg: TelegramBot.Message) {
    const registerMessage = await this.bot.sendMessage(
      msg.chat.id,
      `@${msg.from.username}, calm down, you can only spin once per minute.`,
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
  async handlePool(msg: TelegramBot.Message) {
    const poolAddress = this.blockchainService.l2Contract;
    const poolBalance = await this.blockchainService.getPoolBalance();
    await this.bot.sendMessage(
      msg.chat.id,
      `Pool Address (MOG on Base): ${poolAddress}\n\nPool Balance: ${poolBalance} MOG`,
    );
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
          id: msg.from.id.toString(),
        },
        create: {
          id: msg.from.id.toString(),
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
        userId: msg.from.id.toString(),
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
          connect: { id: msg.from.id.toString() },
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
    const user = await prisma.telegramUser.findFirstOrThrow({
      where: {
        id: msg.from.id.toString(),
      },
    });

    const address = user.address as `0x${string}`;
    const feeRate = user.feeRate;

    const hash = await this.blockchainService.processWin(address, feeRate);

    await this.bot.sendAnimation(
      msg.chat.id,
      'https://i.imgur.com/e79Dq18.gif',
      {
        reply_to_message_id: msg.message_id,
        caption: `We got a winner! 😹😹😹\n\nTransaction: https://basescan.org/tx/${hash}`,
        parse_mode: 'Markdown',
      },
    );
    console.log(`${msg.from.first_name} spinned ${msg.dice.value} and won.`);
  }
  async handleLost(msg: TelegramBot.Message) {
    console.log(`${msg.from.first_name} spinned ${msg.dice.value} and lost.`);
  }

  async handleLeaderboard(msg: TelegramBot.Message) {
    const leaderboard = await this.getLeaderboard();
    if (!leaderboard.length) {
      await this.bot.sendMessage(msg.chat.id, 'Nobody wants to be rich?', {
        reply_to_message_id: msg.message_id,
      });
      return;
    }

    let leaderboardMessage = '';
    let index = 0;
    for (const user of leaderboard) {
      index++;
      const username = await this.bot.getChatMember(
        msg.chat.id,
        Number(user.id),
      );
      leaderboardMessage += `${index}. ${username.user.first_name} - ${user.winAmount} MOG`;
      leaderboardMessage += '\n';
    }

    await this.bot.sendMessage(msg.chat.id, leaderboardMessage, {
      reply_to_message_id: msg.message_id,
    });
  }

  async getLeaderboard() {
    return await prisma.telegramUser.findMany({
      orderBy: {
        winAmount: 'desc',
      },
      take: 15,
    });
  }
}
