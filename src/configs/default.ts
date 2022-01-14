require("dotenv").config({ path: __dirname + "/.env" });
import { JsonRpcProvider } from "@ethersproject/providers";
import { Signer, Wallet } from "ethers";
import { NomRegistrarController__factory } from "../../typechain/factories/NomRegistrarController__factory";
import { Commitment } from "../types";
import { CeloProvider, CeloWallet } from "@celo-tools/celo-ethers-wrapper";
import { Config } from "../config";
import { PublicResolver__factory } from "../../typechain/factories/PublicResolver__factory";
import { ReverseRegistrar__factory } from "../../typechain/factories/ReverseRegistrar__factory";
import { ReservePortal } from "../../typechain/ReservePortal";
import { ReservePortal__factory } from "../../typechain/factories/ReservePortal__factory";
import { OwnableMinimalForwarder } from "../../typechain/OwnableMinimalForwarder";
import { OwnableMinimalForwarder__factory } from "../../typechain/factories/OwnableMinimalForwarder__factory";
import { BaseRegistrarImplementation__factory } from "../../typechain/factories/BaseRegistrarImplementation__factory";

const { PRIVATE_KEY } = process.env;
if (!PRIVATE_KEY) {
  console.warn("PRIVATE_KEY not specified");
}
const fallbackPrivateKey =
  "40ea2e72b6ea949a54974973083215fec2d6f2e2963f1999526899f1688406c5";

const MAINNET: Record<string, boolean> = {
  [42220]: true,
};

export const PROVIDERS = {
  [42220]: new CeloProvider("https://forno.celo.org"),

  [44787]: new CeloProvider("https://alfajores-forno.celo-testnet.org"),
  [43113]: new JsonRpcProvider("https://api.avax-test.network/ext/bc/C/rpc"),
  [80001]: new JsonRpcProvider(
    "https://matic-testnet-archive-rpc.bwarelabs.com"
  ),
};

export const SIGNERS: Record<string, Signer> = {
  [42220]: new CeloWallet(PRIVATE_KEY || fallbackPrivateKey, PROVIDERS[42220]),

  [44787]: new CeloWallet(PRIVATE_KEY || fallbackPrivateKey, PROVIDERS[44787]),
  [43113]: new Wallet(PRIVATE_KEY || fallbackPrivateKey, PROVIDERS[43113]),
  [80001]: new Wallet(PRIVATE_KEY || fallbackPrivateKey, PROVIDERS[80001]),
};

export const PORTALS: Record<string, ReservePortal> = {
  [42220]: ReservePortal__factory.connect(
    "0x4f8A658a993347C25f17De54c192C5E6CE8D51cf",
    SIGNERS[42220]
  ),

  [44787]: ReservePortal__factory.connect(
    "0x032307BFAa0BB0C787E5544425c74cBcBd0d0438",
    SIGNERS[44787]
  ),
  [43113]: ReservePortal__factory.connect(
    "0x4F4dac4180dAC08dc0AF38aE8f439C3A58F296A7",
    SIGNERS[43113]
  ),
  [80001]: ReservePortal__factory.connect(
    "0xF545610f2eD7dBAE5c793F23684A38877A953aD1",
    SIGNERS[80001]
  ),
};

export const FORWARDERS: Record<string, OwnableMinimalForwarder> = {
  [42220]: OwnableMinimalForwarder__factory.connect(
    "0x6AD20B95Eacc40bb7da415e11FFDAc06970abd7c",
    SIGNERS[42220]
  ),

  [44787]: OwnableMinimalForwarder__factory.connect(
    "0x00Bd9F561D98EB6dA98045814Ef35B714155Fd17",
    SIGNERS[44787]
  ),
};

const NUM_CONFIRMATIONS: Record<string, number> = {
  [42220]: 2,

  [44787]: 3,
  [43113]: 3,
  [80001]: 3,
};

const RESOLVERS: Record<string, string> = {
  [42220]: "0x4030B393bbd64142a8a69E904A0bf15f87993d9A",
  [44787]: "0x03E7C2ff868E9c5659863Ec4f2343B2cC3d2f70b",
};

const BASE_REGISTRAR_IMPLEMENTATIONS: Record<string, string> = {
  [42220]: "0xdf204de57532242700D988422996e9cED7Aba4Cb",
  [44787]: "0xb814Fe80D5f1cB29F177AC27ECD29D1f4F378C99",
};

const NOM_REGISTRAR_CONTROLLERS: Record<string, string> = {
  [42220]: "0x046D19c5E5E8938D54FB02DCC396ACf7F275490A",
  [44787]: "0x26AeE0de70C180f33190CD4f34C02C47C56b2665",
};

const REVERSE_REGISTRARS: Record<string, string> = {
  [42220]: "0xe9c3CA404C3b282Fc911EcCa7046D9B699732D8b",
  [44787]: "0x10a575534D5976e361d2A90083c6A91512a6Bf94",
};

const ACCEPTED_CURRENCIES: Record<
  string,
  { address: string; decimals: number }
> = {
  [42220]: {
    address: "0x765DE816845861e75A25fCA122bb6898B8B1282a",
    decimals: 18,
  },

  [44787]: {
    address: "0x874069Fa1Eb16D44d622F2e0Ca25eeA172369bC1",
    decimals: 18,
  },
  [43113]: {
    address: "0x45ea5d57BA80B5e3b0Ed502e9a08d568c96278F9",
    decimals: 6,
  },
  [80001]: {
    address: "0x3813e82e6f7098b9583FC0F33a962D02018B6803",
    decimals: 6,
  },
};

export const buildConfig = (
  chainIds: number[],
  signers = SIGNERS,
  numConfirmations = NUM_CONFIRMATIONS,
  acceptedCurrencies = ACCEPTED_CURRENCIES,
  baseRegistrarImplementations = BASE_REGISTRAR_IMPLEMENTATIONS,
  nomRegistrarControllers = NOM_REGISTRAR_CONTROLLERS,
  reverseRegistrars = REVERSE_REGISTRARS,
  resolvers = RESOLVERS
) => {
  const config: Config = {};
  for (const chainId of chainIds) {
    const baseRegistrarImplementation =
      BaseRegistrarImplementation__factory.connect(
        baseRegistrarImplementations[chainId],
        signers[chainId]
      );
    const nomRegistrarController = NomRegistrarController__factory.connect(
      nomRegistrarControllers[chainId],
      signers[chainId]
    );
    const reverseRegistrar = ReverseRegistrar__factory.connect(
      reverseRegistrars[chainId],
      signers[chainId]
    );
    const resolver = PublicResolver__factory.connect(
      resolvers[chainId],
      signers[chainId]
    );

    config[chainId] = {
      numConfirmations: numConfirmations[chainId],
      whitelist: async (commitment: Commitment) => {
        if (
          MAINNET[commitment.chainId.toString()] &&
          !MAINNET[commitment.originChainId.toString()]
        ) {
          return false;
        }
        switch (commitment.request.to) {
          case resolver.address:
            switch (commitment.request.data.slice(0, 10)) {
              case resolver.interface.getSighash("setText"):
                return true;
              case resolver.interface.getSighash("setAddr(bytes32,address)"):
                return true;
            }
          case reverseRegistrar.address:
            switch (commitment.request.data.slice(0, 10)) {
              case reverseRegistrar.interface.getSighash("setName"):
                return true;
            }
          case baseRegistrarImplementation.address:
            switch (commitment.request.data.slice(0, 10)) {
              case baseRegistrarImplementation.interface.getSighash(
                "safeTransferFrom(address,address,uint256)"
              ):
                return true;
              case baseRegistrarImplementation.interface.getSighash("reclaim"):
                return true;
            }
          case nomRegistrarController.address:
            switch (commitment.request.data.slice(0, 10)) {
              case nomRegistrarController.interface.getSighash(
                "registerWithConfig"
              ): {
                const [name, , duration, resolver, addr] =
                  nomRegistrarController.interface.decodeFunctionData(
                    "registerWithConfig",
                    commitment.request.data
                  );
                const acceptedCurrency =
                  acceptedCurrencies[commitment.originChainId];
                if (acceptedCurrency.address !== commitment.currency) {
                  console.warn(
                    `Commitment ${commitment.index} uses an incorrect currency to register`
                  );
                  return false;
                }
                const cost = (
                  await nomRegistrarController.rentPrice(
                    name,
                    duration,
                    commitment.owner
                  )
                )
                  .shr(18)
                  .shl(acceptedCurrency.decimals);

                // `cost` is denominated in 18 decimals
                return commitment.amount.gte(cost);
              }
              case nomRegistrarController.interface.getSighash("renew"): {
                const [name, duration] =
                  nomRegistrarController.interface.decodeFunctionData(
                    "renew",
                    commitment.request.data
                  );
                const acceptedCurrency =
                  acceptedCurrencies[commitment.originChainId];
                if (acceptedCurrency.address !== commitment.currency) {
                  console.warn(
                    `Commitment ${commitment.index} uses an incorrect currency to register`
                  );
                  return false;
                }
                const cost = (
                  await nomRegistrarController.rentPrice(
                    name,
                    duration,
                    commitment.owner
                  )
                )
                  .shr(18)
                  .shl(acceptedCurrency.decimals);

                // `cost` is denominated in 18 decimals
                return commitment.amount.gte(cost);
              }
            }
        }
        return false;
      },
    };
  }
  return config;
};
