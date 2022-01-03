import { Signer } from "ethers";
import { Config, defaultConfig } from "./config";
import { ReservePortal } from "../typechain/ReservePortal";
import { MinimalForwarder } from "../typechain/MinimalForwarder";
import { TypedEvent } from "../typechain/common";
import { Commitment } from "./types";

type Signers = Record<string, Signer>;
type Deployments = Record<
  string,
  { reservePortal: ReservePortal; forwarder: MinimalForwarder }
>;

export class Operator {
  signers: Signers;
  deployments: Deployments;
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
    for (const [chainId, { reservePortal }] of Object.entries(
      this.deployments
    )) {
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
      const { reservePortal, forwarder } =
        this.deployments[commitment.originChainId];
      const originConfig = this.config[commitment.originChainId];
      const destConfig = this.config[commitment.chainId.toString()];
      try {
        const gasLimit = await forwarder.estimateGas.execute(
          commitment.request,
          commitment.signature
        );
        const [success] = await forwarder.callStatic.execute(
          commitment.request,
          commitment.signature
        );
        if (!success) {
          console.warn(
            `Commitment ${commitment.index} from chainId ${commitment.originChainId} will likely fail. Skipping`
          );
          continue;
        }
        const tx = await forwarder.execute(
          commitment.request,
          commitment.signature,
          { gasLimit }
        );
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
    return await destConfig.whitelist(commitment);
  }
}
