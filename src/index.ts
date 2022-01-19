import { BaseContract, BigNumber, Contract, Signer } from "ethers";
import { Config, defaultConfig } from "./config";
import {
  ReservePortal,
  EscrowedEvent,
  CommittedEvent,
  VoidedEvent,
} from "../typechain/ReservePortal";
import { TypedEvent, TypedEventFilter } from "../typechain/common";
import { Commitment } from "./types";
import { OwnableMinimalForwarder } from "../typechain/OwnableMinimalForwarder";
import fs from "fs";

type Signers = Record<string, Signer>;
type Portals = Record<string, ReservePortal>;
type Forwarders = Record<string, OwnableMinimalForwarder>;

const LAST_N_BLOCKS = 50_000; // Only fetch the last N blocks
const BUCKET_SIZE = 3500;

const getPastEvents = async <TEvent extends TypedEvent>(
  contract: any,
  filter: TypedEventFilter<TEvent>,
  fromBlock: number,
  toBlock: number,
  chainId: string | number
): Promise<Array<TEvent>> => {
  const filterStr = filter.topics?.join("_");
  const baseFilename = `/tmp/${chainId}_${contract.address}_${filterStr}`;
  const eventsFilename = `${baseFilename}_events.txt`;
  const lastBlockFilename = `${baseFilename}_lastBlock.txt`;
  let events = [];
  let start = fromBlock;
  try {
    start = Math.max(start, Number(fs.readFileSync(lastBlockFilename)) + 1);
  } catch (e) {}
  try {
    events = JSON.parse(fs.readFileSync(eventsFilename).toString()).filter(
      (e: any) => e.blockNumber >= fromBlock
    );
  } catch (e) {}

  while (start < toBlock) {
    const end = Math.min(start + BUCKET_SIZE - 1, toBlock);
    events.push(...(await contract.queryFilter(filter, start, end)));
    fs.writeFileSync(eventsFilename, JSON.stringify(events));
    fs.writeFileSync(lastBlockFilename, end.toString());
    start += BUCKET_SIZE;
  }
  return events;
};

export class Operator {
  signers: Signers;
  portals: Portals;
  forwarders: Forwarders;
  config: Config;

  constructor(
    signers: Signers,
    portals: Portals,
    forwarders: Forwarders,
    config: Config = defaultConfig
  ) {
    this.signers = signers;
    this.portals = portals;
    this.forwarders = forwarders;
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
    for (const [chainId, reservePortal] of Object.entries(this.portals)) {
      const now = Math.floor(Date.now() / 1000);
      const latestBlock = await reservePortal.provider.getBlockNumber();
      const fromBlock = latestBlock - LAST_N_BLOCKS;
      const toBlock = latestBlock;
      const [
        allCommitments,
        commitedCommitments,
        voidedCommitments,
        voidDelay,
      ] = await Promise.all([
        getPastEvents<EscrowedEvent>(
          reservePortal,
          reservePortal.filters.Escrowed(null, null),
          fromBlock,
          toBlock,
          chainId
        ),
        getPastEvents<CommittedEvent>(
          reservePortal,
          reservePortal.filters.Committed(null),
          fromBlock,
          toBlock,
          chainId
        ),
        getPastEvents<VoidedEvent>(
          reservePortal,
          reservePortal.filters.Voided(null),
          fromBlock,
          toBlock,
          chainId
        ),
        reservePortal.voidDelay(),
      ]);
      const pendingCommitments = await Promise.all(
        allCommitments
          .filter((event) => {
            const [index, timestamp] = event.args.map((v) => BigNumber.from(v));
            return (
              !commitedCommitments[index.toNumber()] &&
              !voidedCommitments[index.toNumber()] &&
              timestamp.add(voidDelay).gt(now)
            );
          })
          .map((event) => {
            // TODO: Multicall
            const [index] = event.args;
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
      const reservePortal = this.portals[commitment.originChainId];
      const forwarder = this.forwarders[commitment.chainId.toString()];
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
