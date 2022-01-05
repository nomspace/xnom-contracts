import { Commitment } from "./types";

export enum ChainId {
  // Mainnets
  CELO = "42220",
  AVALANCHE = "43114",
  FANTOM = "250",
  POLYGON = "137",

  // Testnets
  ALFAJORES = "44787",
  FUJI = "43113",
  FANTOMTEST = "4002",
  MUMBAI = "80001",
}

export const TESTNETS = {
  [ChainId.ALFAJORES]: true,
  [ChainId.FUJI]: true,
  [ChainId.FANTOMTEST]: true,
  [ChainId.MUMBAI]: true,
};

export const MAINNETS = {
  [ChainId.CELO]: true,
  [ChainId.AVALANCHE]: true,
  [ChainId.FANTOM]: true,
  [ChainId.POLYGON]: true,
};

export type CommitmentCheck = (commitment: Commitment) => Promise<boolean>;

export type ChainConfig = {
  numConfirmations: number;
  // Whitelisted addresses that map to whitelisted selectors
  whitelist: CommitmentCheck;
};

export type Config = Record<string, ChainConfig>;

export const defaultConfig: Config = {};
