import { BigNumber } from "ethers";

export type Commitment = {
  index: BigNumber;
  owner: string;
  currency: string;
  amount: BigNumber;
  timestamp: BigNumber;
  chainId: BigNumber;
  request: Request;
  signature: string;
  voided: boolean;
  committed: boolean;

  originChainId: string;
};

export type Request = {
  from: string;
  to: string;
  value: BigNumber;
  gas: BigNumber;
  nonce: BigNumber;
  chainId: BigNumber;
  data: string;
};
