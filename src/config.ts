export enum ChainId {
  // Mainnets
  CELO = "42220",
  AVALANCHE = "43114",

  // Testnets
  ALFAJORES = "44787",
  FUJI = "43113",
}

export type ChainConfig = {
  numConfirmations: number;
};

export type Config = Record<string, ChainConfig>;

export const defaultConfig: Config = {
  [ChainId.CELO]: { numConfirmations: 5 },
  [ChainId.AVALANCHE]: { numConfirmations: 5 },

  [ChainId.ALFAJORES]: { numConfirmations: 5 },
  [ChainId.FUJI]: { numConfirmations: 5 },
};
