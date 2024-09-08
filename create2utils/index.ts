import { TaskExecutor, pinoPrettyLogger } from '@golem-sdk/task-executor';
import { ReputationSystem } from '@golem-sdk/golem-js/experimental';
import dotenv from 'dotenv';
dotenv.config();

(async () => {
  const reputation = await ReputationSystem.create({
    paymentNetwork: 'polygon',
  });

  const executor = await TaskExecutor.create({
    logger: pinoPrettyLogger(),
    package: '01e6bdd087a22f7b9f4c824f54b5599a0db6847dc2cb9a3f3055eef8',
    yagnaOptions: { apiKey: process.env.YAGNA_API_KEY },
    market: {
      pricing: {
        model: 'linear',
        maxStartPrice: 0.5,
        maxCpuPerHourPrice: 1.0,
        maxEnvPerHourPrice: 0.5,
      },
      offerProposalFilter: reputation.offerProposalFilter(),
      offerProposalSelector: reputation.offerProposalSelector(),
    },
    payment: { network: 'polygon' },
  });
  try {
    const [mode, arg, address] = process.argv.slice(2);
    const result = await executor.run(
      async (ctx) =>
        (
          await ctx.run(
            `./createXcrunch create3 -${mode === 'leading' ? 'z' : 'm'} ${arg} -c ${address}`,
          )
        ).stdout,
    );
    const l = result.split(',');

    console.log('Task result:', {
      salt: l[0],
      address: l[1],
    });
  } catch (err) {
    console.error('An error occurred:', err);
  } finally {
    await executor.shutdown();
  }
})();
