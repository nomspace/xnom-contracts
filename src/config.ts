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
// Selectors mapping to commitment checks
export type Selectors = Record<string, CommitmentCheck>;
// Targets mapping to accepted selectors
export type Targets = Record<string, Selectors>;

export type ChainConfig = {
  numConfirmations: number;
  // Whitelisted addresses that map to whitelisted selectors
  whitelist: Targets;
};

export type Config = Record<string, ChainConfig>;

export const defaultConfig: Config = {};
