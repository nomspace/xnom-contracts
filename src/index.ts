import { Signer } from "ethers";
import { Config, defaultConfig } from "./config";
import { ReservePortal } from "../typechain/ReservePortal";
import { TypedEvent } from "../typechain/common";
import { Commitment } from "./types";

type Signers = Record<string, Signer>;
type Deployments = Record<string, ReservePortal>;

export class Operator {
  signers: Record<string, Signer>;
  deployments: Record<string, ReservePortal>;
  config: Config;

  constructor(
    signers: Signers,
    deployments: Deployments,
    config: Config = defaultConfig
  ) {
    this.signers = signers;
    this.deployments = deployments;
    this.config = config;
  }

  // Returns all pending commitments
  async fetchPendingCommitments(): Promise<Commitment[]> {
    const eventsToSet = (events: TypedEvent[]) =>
      events.reduce<Record<string, boolean>>((acc, event) => {
        const { index } = event.args;
        acc[index.toString()] = true;
        return acc;
      }, {});

    const allPendingCommitments: Commitment[] = [];
    for (const [chainId, reservePortal] of Object.entries(this.deployments)) {
      const now = Math.floor(Date.now() / 1000);
      const eventOptions = [0, "latest"];
      const [
        allCommitments,
        commitedCommitments,
        voidedCommitments,
        voidDelay,
      ] = await Promise.all([
        reservePortal.queryFilter(
          reservePortal.filters.Escrowed(null, null),
          ...eventOptions
        ),
        reservePortal
          .queryFilter(reservePortal.filters.Committed(null), ...eventOptions)
          .then(eventsToSet),
        reservePortal
          .queryFilter(reservePortal.filters.Voided(null), ...eventOptions)
          .then(eventsToSet),
        reservePortal.voidDelay(),
      ]);
      const pendingCommitments = await Promise.all(
        allCommitments
          .filter((event) => {
            const { index, timestamp } = event.args;
            return (
              !commitedCommitments[index.toString()] &&
              !voidedCommitments[index.toString()] &&
              timestamp.add(voidDelay).gt(now)
            );
          })
          .map((event) => {
            // TODO: Multicall
            const { index } = event.args;
            return reservePortal
              .commitments(index)
              .then((pendingCommitment) => ({
                ...pendingCommitment,
                originChainId: chainId,
              }));
          })
      );
      allPendingCommitments.push(...pendingCommitments);
    }

    return allPendingCommitments.sort((a, b) =>
      a.timestamp.sub(b.timestamp).toNumber()
    );
  }

  // Returns all pending commitments keyed by chainId
  async finalizePendingCommitments(pendingCommitments: Commitment[]) {
    const sorted = pendingCommitments.sort((a, b) =>
      a.timestamp.sub(b.timestamp).toNumber()
    );
    for (const commitment of sorted) {
      if (!(await this.isWhitelisted(commitment))) {
        console.warn(
          `Commitment ${commitment.index} from chainId ${commitment.originChainId} did not pass check`
        );
        continue;
      }
      const reservePortal = this.deployments[commitment.originChainId];
      const originConfig = this.config[commitment.originChainId];
      const destConfig = this.config[commitment.chainId.toString()];
      try {
        const destSigner = this.signers[commitment.chainId.toString()];
        const params = {
          to: commitment.target,
          value: commitment.value,
          data: commitment.data,
        };
        const gasLimit = await destSigner.estimateGas(params);
        const tx = await destSigner.sendTransaction({ ...params, gasLimit });
        await tx.wait(destConfig?.numConfirmations);
        console.info(
          `Fulfilled ${commitment.index} from chainId ${commitment.originChainId}. Tx hash: ${tx.hash}`
        );
        const commitTx = await reservePortal.commit(commitment.index);
        await commitTx.wait(originConfig?.numConfirmations);
        console.info(
          `Commited ${commitment.index} from chainId ${commitment.originChainId}. Tx hash: ${commitTx.hash}`
        );
      } catch (e: any) {
        console.error(e.message);
      }
    }
  }

  async isWhitelisted(commitment: Commitment) {
    const destConfig = this.config[commitment.chainId.toString()];
    if (!destConfig) {
      return false;
    }
    const targetConfig = destConfig.whitelist[commitment.target];
    if (!targetConfig) {
      return false;
    }
    const validCommitmentCheck = targetConfig[commitment.data.slice(0, 10)];
    if (!validCommitmentCheck) {
      return false;
    }
    return await validCommitmentCheck(commitment);
  }
}
