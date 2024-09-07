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
  private l2Contract: `0x${string}` =
    '0x07F07caAC2B07ed326065AB0c5701602fFB17F88'; // change
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

  async processWin(address: `0x${string}`) {
    const { request } = await this.baseClient.simulateContract({
      account: this.account,
      address: this.l2Contract,
      abi: emojiprotocolAbi,
      functionName: 'hugoWin',
      args: [address],
    });
    const hash = await this.baseWalletClient.writeContract(request);
    await this.baseClient.waitForTransactionReceipt({
      hash,
      confirmations: 1,
    });
  }

  async getPoolBalance() {
    const mogBalance = await this.baseClient.readContract({
      address: this.mog,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [this.l2Contract],
    });
    return formatEther(mogBalance);
  }
}
