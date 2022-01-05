require("dotenv").config({ path: __dirname + "/.env" });
import { JsonRpcProvider } from "@ethersproject/providers";
import { providers, Signer, Wallet } from "ethers";
import { NomRegistrarController__factory } from "../../typechain/factories/NomRegistrarController__factory";
import { Commitment } from "../types";
import { formatUnits } from "ethers/lib/utils";
import { CeloProvider, CeloWallet } from "@celo-tools/celo-ethers-wrapper";
import { Config } from "../config";
import { PublicResolver__factory } from "../../typechain/factories/PublicResolver__factory";
import { ReverseRegistrar__factory } from "../../typechain/factories/ReverseRegistrar__factory";
import { ReservePortal } from "../../typechain/ReservePortal";
import { ReservePortal__factory } from "../../typechain/factories/ReservePortal__factory";
import { OwnableMinimalForwarder } from "../../typechain/OwnableMinimalForwarder";
import { OwnableMinimalForwarder__factory } from "../../typechain/factories/OwnableMinimalForwarder__factory";

const { PRIVATE_KEY } = process.env;
if (!PRIVATE_KEY) {
  console.warn("PRIVATE_KEY not specified");
}
const fallbackPrivateKey =
  "40ea2e72b6ea949a54974973083215fec2d6f2e2963f1999526899f1688406c5";

export const PROVIDERS = {
  [44787]: new CeloProvider("https://alfajores-forno.celo-testnet.org"),
  [43113]: new JsonRpcProvider("https://api.avax-test.network/ext/bc/C/rpc"),
  [80001]: new JsonRpcProvider(
    "https://matic-testnet-archive-rpc.bwarelabs.com"
  ),
};

export const SIGNERS: Record<string, Signer> = {
  [44787]: new CeloWallet(PRIVATE_KEY || fallbackPrivateKey, PROVIDERS[44787]),
  [43113]: new Wallet(PRIVATE_KEY || fallbackPrivateKey, PROVIDERS[43113]),
  [80001]: new Wallet(PRIVATE_KEY || fallbackPrivateKey, PROVIDERS[80001]),
};

export const PORTALS: Record<string, ReservePortal> = {
  [44787]: ReservePortal__factory.connect(
    "0xcE6863Bac168f47EF41404378Ce838ae14aAFAC8",
    SIGNERS[44787]
  ),
  [43113]: ReservePortal__factory.connect(
    "0xfB1243D603b21D9E1a9669b67998c5CF12F58c1B",
    SIGNERS[43113]
  ),
  [80001]: ReservePortal__factory.connect(
    "0xb83e6f8BC9553Dd7AaECA86E96fa9B113563dfa3",
    SIGNERS[80001]
  ),
};

export const FORWARDERS: Record<string, OwnableMinimalForwarder> = {
  [44787]: OwnableMinimalForwarder__factory.connect(
    "0x00Bd9F561D98EB6dA98045814Ef35B714155Fd17",
    SIGNERS[44787]
  ),
};

const NUM_CONFIRMATIONS: Record<string, number> = {
  [44787]: 3,
  [43113]: 3,
  [80001]: 3,
};

const RESOLVERS: Record<string, string> = {
  [44787]: "0x3c94b19597b2De1Cad7Ca2D214E859B454831455",
};

const NOM_REGISTRAR_CONTROLLERS: Record<string, string> = {
  [44787]: "0xf3C07ee51b08B47a152d1917924101a7c9eA2769",
};

const REVERSE_REGISTRARS: Record<string, string> = {
  [44787]: "0x8015f5153C11828287179968f293a0a25895Ef0E",
};

const ACCEPTED_CURRENCIES: Record<
  string,
  { address: string; decimals: number }
> = {
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
  nomRegistrarControllers = NOM_REGISTRAR_CONTROLLERS,
  reverseRegistrars = REVERSE_REGISTRARS,
  resolvers = RESOLVERS
) => {
  const config: Config = {};
  for (const chainId of chainIds) {
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
          case nomRegistrarController.address:
            switch (commitment.request.data.slice(0, 10)) {
              case nomRegistrarController.interface.getSighash(
                "registerWithConfig"
              ):
                const [name, owner, duration, resolver, addr] =
                  nomRegistrarController.interface.decodeFunctionData(
                    "registerWithConfig",
                    commitment.request.data
                  );
                // Disallow reserve abuse
                if (owner === nomRegistrarController.address) {
                  console.warn(
                    `Commitment ${commitment.index} is using the operator to register`
                  );
                  return false;
                }
                const acceptedCurrency =
                  acceptedCurrencies[commitment.originChainId];
                if (acceptedCurrency.address !== commitment.currency) {
                  console.warn(
                    `Commitment ${commitment.index} uses an incorrect currency to register`
                  );
                  return false;
                }
                const cost = (
                  await nomRegistrarController.rentPrice(name, duration, owner)
                ).toString();

                // `cost` is denominated in 18 decimals
                return commitment.amount.gte(
                  Math.floor(
                    Number(formatUnits(cost, 18 - acceptedCurrency.decimals))
                  )
                );
            }
        }
        return false;
      },
    };
  }
  return config;
};
