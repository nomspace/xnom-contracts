import { BigNumber, Signer } from "ethers";
import { Config, defaultConfig } from "./config";
import { EscrowedEvent, ReservePortal } from "./generated/ReservePortal";

type Signers = Record<string, Signer>;
type Deployments = Record<string, ReservePortal>;

type Commitment = {
  index: BigNumber;
  owner: string;
  currency: string;
  amount: BigNumber;
  timestamp: BigNumber;
  chainId: BigNumber;
  target: string;
  value: BigNumber;
  data: string;
  voided: boolean;
  committed: boolean;
  canceled: boolean;

  originChainId: string;
};

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
    const eventsToSet = (events: EscrowedEvent[]) =>
      events
        .map((event) => event.args.index.toString())
        .reduce<Record<string, boolean>>((acc, curr) => {
          acc[curr] = true;
          return acc;
        }, {});

    const allPendingCommitments: Commitment[] = [];
    for (const [chainId, reservePortal] of Object.entries(this.deployments)) {
      const [
        allCommitments,
        commitedCommitments,
        voidedCommitments,
        canceledCommitments,
      ] = await Promise.all([
        await reservePortal
          .queryFilter(reservePortal.filters.Escrowed(null))
          .then(eventsToSet),
        reservePortal
          .queryFilter(reservePortal.filters.Committed(null))
          .then(eventsToSet),
        reservePortal
          .queryFilter(reservePortal.filters.Voided(null))
          .then(eventsToSet),
        reservePortal
          .queryFilter(reservePortal.filters.Canceled(null))
          .then(eventsToSet),
      ]);
      const pendingCommitments = await Promise.all(
        Object.keys(allCommitments)
          .filter(
            (commitmentIndex) =>
              !commitedCommitments[commitmentIndex] &&
              !voidedCommitments[commitmentIndex] &&
              !canceledCommitments[commitmentIndex]
          )
          .map((commitmentIndex) =>
            reservePortal
              .commitments(commitmentIndex)
              .then((pendingCommitment) => ({
                ...pendingCommitment,
                originChainId: chainId,
              }))
          )
      );
      allPendingCommitments.push(...pendingCommitments);
    }

    return allPendingCommitments.sort((a, b) =>
      a.timestamp.sub(b.timestamp).toNumber()
    );
  }

  // Returns all pending commitments keyed by chainId
  async finalizePendingCommitments(pendingCommitments: Commitment[]) {
    for (const commitment of pendingCommitments) {
      const reservePortal = this.deployments[commitment.originChainId];
      const originConfig = this.config[commitment.originChainId];
      const destConfig = this.config[commitment.chainId.toString()];
      if (!originConfig) {
        throw new Error(
          `No config found for chainId: ${commitment.originChainId}`
        );
      } else if (!destConfig) {
        throw new Error(`No config found for chainId: ${commitment.chainId}`);
      }
      try {
        const signer = this.signers[commitment.originChainId];
        const gasPrice = await signer.getGasPrice();
        // TODO: Parameter validation
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
      } catch (e: any) {
        console.warn(e.message);
        const cancelTx = await reservePortal.cancel(commitment.index);
        await cancelTx.wait(originConfig?.numConfirmations);
      }
    }
  }
}
