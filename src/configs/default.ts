require("dotenv").config({ path: __dirname + "/.env" });
import { JsonRpcProvider } from "@ethersproject/providers";
import { Signer, Wallet } from "ethers";
import { OperatorOwnedNomV2__factory } from "../../typechain/factories/OperatorOwnedNomV2__factory";
import { NomRegistrarController__factory } from "../../typechain/factories/NomRegistrarController__factory";
import { BaseRegistrarImplementation__factory } from "../../typechain/factories/BaseRegistrarImplementation__factory";
import { BaseRegistrarImplementation } from "../../typechain/BaseRegistrarImplementation";
import { Commitment } from "../types";
import { parseUnits } from "ethers/lib/utils";
import { CeloProvider, CeloWallet } from "@celo-tools/celo-ethers-wrapper";
import { labelhash } from "@ensdomains/ensjs";
import { Config } from "../config";

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

const OPERATER_OWNED_NOMS: Record<string, string> = {
  [44787]: "0x228624240Eac97c0df2060cd0a93372329D6246d",
};

const NOM_REGISTRAR_CONTROLLERS: Record<string, string> = {
  [44787]: "0x0273373C357eF535C89b86ac7B98080DB885814c",
};

const BASE_REGISTRAR_CONTROLLERS: Record<string, string> = {
  [44787]: "0xbf56d83A5D7C878D1a8264F278A1252D08F5A4d2",
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

const isNameOwner = async (
  name: string,
  owner: string,
  baseRegistrarImplementation: BaseRegistrarImplementation
) => {
  const tokenId = labelhash(name);
  try {
    const nameOwner = await baseRegistrarImplementation.ownerOf(tokenId);
    return nameOwner === owner;
  } catch (e) {
    console.error(
      "Failed to get ownerOf, probably because there is no owner",
      e
    );
  }
  return false;
};

export const buildConfig = (
  chainIds: number[],
  signers = SIGNERS,
  numConfirmations = NUM_CONFIRMATIONS,
  acceptedCurrencies = ACCEPTED_CURRENCIES,
  operatorOwnedNoms = OPERATER_OWNED_NOMS,
  nomRegistrarControllers = NOM_REGISTRAR_CONTROLLERS,
  baseRegistrarControllers = BASE_REGISTRAR_CONTROLLERS
) => {
  const config: Config = {};
  for (const chainId of chainIds) {
    const operatorOwnedNomV2 = OperatorOwnedNomV2__factory.connect(
      operatorOwnedNoms[chainId],
      signers[chainId]
    );
    const nomRegistrarController = NomRegistrarController__factory.connect(
      nomRegistrarControllers[chainId],
      signers[chainId]
    );
    const baseRegistrarImplementation =
      BaseRegistrarImplementation__factory.connect(
        baseRegistrarControllers[chainId],
        signers[chainId]
      );

    config[chainId] = {
      numConfirmations: numConfirmations[chainId],
      whitelist: {
        [operatorOwnedNomV2.address]: {
          [operatorOwnedNomV2.interface.getSighash("setReverseRecord")]: async (
            commitment: Commitment
          ) => {
            const [addr, name] =
              operatorOwnedNomV2.interface.decodeFunctionData(
                "setReverseRecord",
                commitment.data
              );
            return addr === commitment.owner;
          },
          [operatorOwnedNomV2.interface.getSighash("setText")]: async (
            commitment: Commitment
          ) => {
            const [name, key, value] =
              operatorOwnedNomV2.interface.decodeFunctionData(
                "setText",
                commitment.data
              );
            return isNameOwner(
              name,
              commitment.owner,
              baseRegistrarImplementation
            );
          },
          [operatorOwnedNomV2.interface.getSighash("setAddr(string,address)")]:
            async (commitment: Commitment) => {
              const [name, addr] =
                operatorOwnedNomV2.interface.decodeFunctionData(
                  "setAddr(string,address)",
                  commitment.data
                );
              return isNameOwner(
                name,
                commitment.owner,
                baseRegistrarImplementation
              );
            },
          [operatorOwnedNomV2.interface.getSighash("register")]: async (
            commitment: Commitment
          ) => {
            const [name, owner, duration, resolver, addr] =
              operatorOwnedNomV2.interface.decodeFunctionData(
                "register",
                commitment.data
              );
            // Disallow reserve abuse
            if (owner === operatorOwnedNomV2.address) {
              return false;
            }
            const acceptedCurrency =
              acceptedCurrencies[commitment.originChainId];
            if (acceptedCurrency.address !== commitment.currency) {
              return false;
            }
            const cost = (
              await nomRegistrarController.rentPrice(name, duration, owner)
            ).toString();

            // `cost` is denominated in 18 decimals
            return commitment.amount.gte(
              parseUnits(cost, acceptedCurrency.decimals - 18)
            );
          },
        },
      },
    };
  }
  return config;
};
