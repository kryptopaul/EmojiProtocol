import { Injectable } from '@nestjs/common';
import {
  createPublicClient,
  createWalletClient,
  formatEther,
  http,
} from 'viem';
import { normalize } from 'viem/ens';
import { base, mainnet } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { ConfigService } from '@nestjs/config';
import { emojiprotocolAbi } from 'src/lib/abi';
import { erc20Abi } from 'viem';
@Injectable()
export class BlockchainService {
  constructor(private readonly configService: ConfigService) {}
  private account = privateKeyToAccount(
    this.configService.getOrThrow<`0x${string}`>('PRIVATE_KEY'),
  );
  public l2Contract: `0x${string}` =
    '0x7777777e1ba5d032604b0b4c1303c41246264ab5'; // change
  private mog: `0x${string}` = '0x2da56acb9ea78330f947bd57c54119debda7af71';
  private ethClient = createPublicClient({
    chain: mainnet,
    transport: http(),
  });

  private baseClient = createPublicClient({
    chain: base,
    transport: http(),
  });

  private baseWalletClient = createWalletClient({
    chain: base,
    transport: http(),
  });

  async resolveEns(ens: string) {
    return await this.ethClient.getEnsAddress({
      name: normalize(ens),
    });
  }

  async processWin(address: `0x${string}`, feeRate: number) {
    const balance = Number(await this.getPoolBalance());
    await prisma.telegramUser.update({
      where: {
        address: address,
      },
      data: {
        winAmount: {
          increment: balance,
        },
        winCount: {
          increment: 1,
        },
      },
    });

    const { request } = await this.baseClient.simulateContract({
      account: this.account,
      address: this.l2Contract,
      abi: emojiprotocolAbi,
      functionName: 'hugoWin',
      args: [address, feeRate],
    });
    const hash = await this.baseWalletClient.writeContract(request);
    await this.baseClient.waitForTransactionReceipt({
      hash,
      confirmations: 1,
    });
    return hash;
  }

  async getPoolBalance() {
    const mogBalance = await this.baseClient.readContract({
      address: this.mog,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [this.l2Contract],
    });
    return Number(formatEther(mogBalance)).toFixed(2);
  }
}
