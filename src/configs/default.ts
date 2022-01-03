require("dotenv").config({ path: __dirname + "/.env" });
import { JsonRpcProvider } from "@ethersproject/providers";
import { Signer, Wallet } from "ethers";
import { NomRegistrarController__factory } from "../../typechain/factories/NomRegistrarController__factory";
import { Commitment } from "../types";
import { parseUnits } from "ethers/lib/utils";
import { CeloProvider, CeloWallet } from "@celo-tools/celo-ethers-wrapper";
import { Config } from "../config";
import { PublicResolver__factory } from "../../typechain/factories/PublicResolver__factory";
import { ReverseRegistrar__factory } from "../../typechain/factories/ReverseRegistrar__factory";

const { PRIVATE_KEY } = process.env;
if (!PRIVATE_KEY) {
  console.warn("PRIVATE_KEY not specified");
}
const fallbackPrivateKey =
  "40ea2e72b6ea949a54974973083215fec2d6f2e2963f1999526899f1688406c5";

const PROVIDERS = {
  [44787]: new CeloProvider("https://alfajores-forno.celo-testnet.org"),
  [43113]: new JsonRpcProvider("https://api.avax-test.network/ext/bc/C/rpc"),
};

const SIGNERS: Record<string, Signer> = {
  [44787]: new CeloWallet(PRIVATE_KEY || fallbackPrivateKey, PROVIDERS[44787]),
  [43113]: new Wallet(PRIVATE_KEY || fallbackPrivateKey, PROVIDERS[43113]),
};

const NUM_CONFIRMATIONS: Record<string, number> = {
  [44787]: 3,
  [43113]: 3,
};

const NOM_REGISTRAR_CONTROLLERS: Record<string, string> = {
  [44787]: "0x0922a1b101bF136ED352cE9714Da81f2fE75FD61",
};

const REVERSE_REGISTRARS: Record<string, string> = {
  [44787]: "0xCF67F155cC944304Bff8306bcC1cFda78B08745D",
};

const RESOLVERS: Record<string, string> = {
  [44787]: "0x39d99E622E3c3371b19465C76980f93AF4FaF2fa",
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
                  parseUnits(cost, acceptedCurrency.decimals - 18)
                );
            }
        }
        return false;
      },
    };
  }
  return config;
};
