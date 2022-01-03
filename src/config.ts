import { BigNumber } from "ethers";
import { Commitment } from "./types";

export enum ChainId {
  // Mainnets
  CELO = "42220",
  AVALANCHE = "43114",

  // Testnets
  ALFAJORES = "44787",
  FUJI = "43113",
}

export type CommitmentCheck = (commitment: Commitment) => Promise<boolean>;

export type ChainConfig = {
  numConfirmations: number;
  // Whitelisted addresses that map to whitelisted selectors
  whitelist: CommitmentCheck;
};

export type Config = Record<string, ChainConfig>;

export const defaultConfig: Config = {};
