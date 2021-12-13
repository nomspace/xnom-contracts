import { BigNumber } from "ethers";

export type Commitment = {
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

  originChainId: string;
};
