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
      const now = (await this.signers[chainId].provider!.getBlock("latest"))
        .timestamp;
      const [
        allCommitments,
        commitedCommitments,
        voidedCommitments,
        voidDelay,
      ] = await Promise.all([
        reservePortal.queryFilter(reservePortal.filters.Escrowed(null)),
        reservePortal
          .queryFilter(reservePortal.filters.Committed(null))
          .then(eventsToSet),
        reservePortal
          .queryFilter(reservePortal.filters.Voided(null))
          .then(eventsToSet),
        reservePortal.voidDelay(),
      ]);
      const pendingCommitments = (
        await Promise.all(
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
        )
      ).filter((c) => this.isWhitelisted(c));
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
      if (!this.isWhitelisted(commitment)) {
        console.warn(
          `Commitment ${commitment.index} from chainId ${commitment.originChainId}`
        );
        continue;
      }
      const reservePortal = this.deployments[commitment.originChainId];
      const originConfig = this.config[commitment.originChainId];
      const destConfig = this.config[commitment.chainId.toString()];
      try {
        const signer = this.signers[commitment.originChainId];
        const gasPrice = await signer.getGasPrice();
        const params = {
          to: commitment.target,
          value: commitment.value,
          data: commitment.data,
          gasPrice,
        };
        const gasLimit = await signer.estimateGas(params);
        const tx = await signer.sendTransaction({ ...params, gasLimit });
        await tx.wait(destConfig?.numConfirmations);
        const commitTx = await reservePortal.commit(commitment.index);
        await commitTx.wait(originConfig?.numConfirmations);
        console.info(
          `Commited ${commitment.index} from chainId ${commitment.originChainId}. Tx hash: ${commitTx.hash}`
        );
      } catch (e: any) {
        console.warn(e.message);
      }
    }
  }

  isWhitelisted(commitment: Commitment) {
    const destConfig = this.config[commitment.chainId.toString()];
    const targetConfig = destConfig.whitelist[commitment.target];
    if (!targetConfig) {
      return false;
    }
    const validCommitmentCheck = targetConfig[commitment.data.slice(0, 10)];
    if (!validCommitmentCheck) {
      return false;
    }
    return validCommitmentCheck(commitment);
  }
}
