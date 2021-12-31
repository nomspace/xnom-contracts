import { ethers } from "hardhat";
import { expect } from "chai";
import { ReservePortal } from "../typechain/ReservePortal";
import { ReservePortal__factory } from "../typechain/factories/ReservePortal__factory";
import { ENSRegistry } from "../typechain/ENSRegistry";
import { ENSRegistry__factory } from "../typechain/factories/ENSRegistry__factory";
import { PublicResolver } from "../typechain/PublicResolver";
import { PublicResolver__factory } from "../typechain/factories/PublicResolver__factory";
import { BaseRegistrarImplementation } from "../typechain/BaseRegistrarImplementation";
import { BaseRegistrarImplementation__factory } from "../typechain/factories/BaseRegistrarImplementation__factory";
import { NomRegistrarController } from "../typechain/NomRegistrarController";
import { NomRegistrarController__factory } from "../typechain/factories/NomRegistrarController__factory";
import { OperatorOwnedNomV2 } from "../typechain/OperatorOwnedNomV2";
import { OperatorOwnedNomV2__factory } from "../typechain/factories/OperatorOwnedNomV2__factory";
import { ReverseRegistrar } from "../typechain/ReverseRegistrar";
import { ReverseRegistrar__factory } from "../typechain/factories/ReverseRegistrar__factory";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { Operator } from "../src/index";
import { MockERC20 } from "../typechain/MockERC20";
import { MockERC20__factory } from "../typechain/factories/MockERC20__factory";
import { parseUnits } from "ethers/lib/utils";
import { buildConfig } from "../src/configs/default";
import namehash from "eth-ens-namehash";
import ENS from "@ensdomains/ensjs";
import { utils } from "ethers";

const labelhash = (label: string) => utils.keccak256(utils.toUtf8Bytes(label));

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ZERO_HASH =
  "0x0000000000000000000000000000000000000000000000000000000000000000";
const TLD = "nom";
const DAY_IN_SECONDS = 60 * 60 * 24;
const FEE_PER_SECOND = 158548959919; // $5 per year
const AMOUNT = DAY_IN_SECONDS * FEE_PER_SECOND;
const DURATION = 60 * 60 * 24;
const NAME = "asdf";
const NAMEHASH = namehash.hash(NAME);
const NAMEHASH_WITH_TLD = namehash.hash(`${NAME}.nom`);

const increaseTime = async (seconds: number) => {
  await ethers.provider.send("evm_increaseTime", [seconds]);
  await ethers.provider.send("evm_mine", []);
};

describe("Nom v2 Integration test", function () {
  let chainId: number;
  let ownerAccount: SignerWithAddress;
  let operatorAccount: SignerWithAddress;
  let userAccount: SignerWithAddress;
  let userReservePortal: ReservePortal;
  let operatorReservePortal: ReservePortal;
  let token: MockERC20;
  let ens: ENSRegistry;
  let resolver: PublicResolver;
  let baseRegistrarImplementation: BaseRegistrarImplementation;
  let nomRegistrarController: NomRegistrarController;
  let operatorOwnedNomV2: OperatorOwnedNomV2;
  let reverseRegistrar: ReverseRegistrar;
  let operator: Operator;
  let ensjs: any;

  before(async function () {
    const network = await ethers.provider.getNetwork();
    chainId = network.chainId;

    const accounts = await ethers.getSigners();
    ownerAccount = accounts[0];
    operatorAccount = accounts[1];
    userAccount = accounts[2];

    // Deploy ReservePortal
    const ReservePortal = new ReservePortal__factory();
    const reservePortal = await ReservePortal.connect(ownerAccount).deploy(
      DAY_IN_SECONDS,
      operatorAccount.address
    );
    await reservePortal.deployed();
    userReservePortal = ReservePortal.attach(reservePortal.address).connect(
      userAccount
    );
    operatorReservePortal = ReservePortal.attach(reservePortal.address).connect(
      operatorAccount
    );

    // Deploy Token
    token = await new MockERC20__factory().connect(userAccount).deploy();
    await token.deployed();

    // Deploy ENS
    ens = await new ENSRegistry__factory().connect(ownerAccount).deploy();
    await ens.deployed();
    resolver = await new PublicResolver__factory()
      .connect(ownerAccount)
      .deploy(ens.address, ZERO_ADDRESS);
    await resolver.deployed();
    const resolverNode = namehash.hash("resolver");
    const resolverLabel = labelhash("resolver");
    await ens.setSubnodeOwner(ZERO_HASH, resolverLabel, ownerAccount.address);
    await ens.setResolver(resolverNode, resolver.address);
    await resolver["setAddr(bytes32,address)"](resolverNode, resolver.address);
    const nomNode = namehash.hash(TLD);
    const nomLabel = labelhash(TLD);
    baseRegistrarImplementation =
      await new BaseRegistrarImplementation__factory()
        .connect(ownerAccount)
        .deploy(ens.address, nomNode);
    await baseRegistrarImplementation.deployed();
    await ens.setSubnodeOwner(
      ZERO_HASH,
      nomLabel,
      baseRegistrarImplementation.address
    );
    nomRegistrarController = await new NomRegistrarController__factory()
      .connect(ownerAccount)
      .deploy(
        baseRegistrarImplementation.address,
        token.address,
        FEE_PER_SECOND,
        "0xf60d112c55aef2a97fc434c84a5e3d9e91af75f6" // Multisig
      );
    await nomRegistrarController.deployed();
    await baseRegistrarImplementation.addController(
      nomRegistrarController.address
    );
    operatorOwnedNomV2 = await new OperatorOwnedNomV2__factory()
      .connect(operatorAccount)
      .deploy(nomRegistrarController.address);
    await operatorOwnedNomV2.deployed();
    await nomRegistrarController.addToWhitelist(operatorOwnedNomV2.address);
    const reverseNode = namehash.hash("reverse");
    const reverseLabel = labelhash("reverse");
    reverseRegistrar = await new ReverseRegistrar__factory()
      .connect(ownerAccount)
      .deploy(ens.address, resolver.address);
    await reverseRegistrar.deployed();
    await reverseRegistrar.setController(operatorOwnedNomV2.address, true);
    await ens.setSubnodeOwner(ZERO_HASH, reverseLabel, ownerAccount.address);
    await ens.setSubnodeOwner(
      reverseNode,
      labelhash("addr"),
      reverseRegistrar.address
    );

    // Initialize Operator
    const signers = {
      [chainId]: operatorAccount,
    };
    const deployments = {
      [chainId]: operatorReservePortal,
    };
    operator = new Operator(
      signers,
      deployments,
      buildConfig(
        [chainId],
        signers,
        { [chainId]: 1 },
        {
          [chainId]: {
            address: token.address,
            decimals: 18,
          },
        },
        {
          [chainId]: operatorOwnedNomV2.address,
        },
        {
          [chainId]: nomRegistrarController.address,
        },
        {
          [chainId]: baseRegistrarImplementation.address,
        }
      )
    );

    ensjs = new ENS({
      provider: ownerAccount.provider,
      ensAddress: ens.address,
    });
  });

  describe("empty run", () => {
    it("should return 0 pending commitments", async () => {
      const pendingCommitments = await operator.fetchPendingCommitments();
      expect(pendingCommitments.length).to.be.equal(0);
    });
  });

  const register = async (name: string) => {
    const data = (
      await operatorOwnedNomV2.populateTransaction.register(
        name,
        userAccount.address,
        DURATION,
        resolver.address,
        userAccount.address
      )
    ).data;
    if (!data) {
      throw new Error("Data is undefined");
    }
    await token
      .connect(userAccount)
      .approve(userReservePortal.address, AMOUNT.toString());
    await userReservePortal.escrow(
      token.address,
      AMOUNT.toString(),
      chainId,
      operatorOwnedNomV2.address,
      0,
      data
    );
  };

  const setAddr = async (name: string, addr: string) => {
    const data = (
      await operatorOwnedNomV2.populateTransaction["setAddr(string,address)"](
        name,
        addr
      )
    ).data;
    if (!data) {
      throw new Error("Data is undefined");
    }
    await userReservePortal.escrow(
      token.address,
      0,
      chainId,
      operatorOwnedNomV2.address,
      0,
      data
    );
  };

  const setText = async (name: string, key: string, value: string) => {
    const data = (
      await operatorOwnedNomV2.populateTransaction.setText(name, key, value)
    ).data;
    if (!data) {
      throw new Error("Data is undefined");
    }
    await userReservePortal.escrow(
      token.address,
      0,
      chainId,
      operatorOwnedNomV2.address,
      0,
      data
    );
  };

  const reverseRegister = async (addr: string, name: string) => {
    const data = (
      await operatorOwnedNomV2.populateTransaction.setReverseRecord(addr, name)
    ).data;
    if (!data) {
      throw new Error("Data is undefined");
    }
    await userReservePortal.escrow(
      token.address,
      0,
      chainId,
      operatorOwnedNomV2.address,
      0,
      data
    );
  };

  describe("normal run", () => {
    it("should register", async () => {
      await register(NAME);
      let pendingCommitments = await operator.fetchPendingCommitments();
      expect(pendingCommitments.length).to.be.equal(1);
      await operator.finalizePendingCommitments(pendingCommitments);
      expect((await userReservePortal.commitments(0)).committed).to.be.true;
      pendingCommitments = await operator.fetchPendingCommitments();
      expect(pendingCommitments.length).to.be.equal(0);

      // NFT should be properly minted
      const tokenId = labelhash(NAME);
      expect(await baseRegistrarImplementation.ownerOf(tokenId)).to.be.equal(
        userAccount.address
      );
    });

    it("should setAddr", async () => {
      // Set address
      await setAddr(NAME, ownerAccount.address);
      let pendingCommitments = await operator.fetchPendingCommitments();
      expect(pendingCommitments.length).to.be.equal(1);
      await operator.finalizePendingCommitments(pendingCommitments);
      expect((await userReservePortal.commitments(1)).committed).to.be.true;
      pendingCommitments = await operator.fetchPendingCommitments();
      expect(pendingCommitments.length).to.be.equal(0);

      // Address should be properly set
      expect(await resolver["addr(bytes32)"](NAMEHASH_WITH_TLD)).to.be.equal(
        ownerAccount.address
      );
    });

    it("should setText", async () => {
      // Set text
      const KEY = "github";
      const VALUE = "https://github.com/nomspace";
      await setText(NAME, KEY, VALUE);
      let pendingCommitments = await operator.fetchPendingCommitments();
      expect(pendingCommitments.length).to.be.equal(1);
      await operator.finalizePendingCommitments(pendingCommitments);
      expect((await userReservePortal.commitments(2)).committed).to.be.true;
      pendingCommitments = await operator.fetchPendingCommitments();
      expect(pendingCommitments.length).to.be.equal(0);

      // Address should be properly set
      expect(await resolver.text(NAMEHASH_WITH_TLD, KEY)).to.be.equal(VALUE);
    });

    it("should reverse register", async () => {
      // Set reverse register
      await reverseRegister(userAccount.address, NAME);
      let pendingCommitments = await operator.fetchPendingCommitments();
      expect(pendingCommitments.length).to.be.equal(1);
      await operator.finalizePendingCommitments(pendingCommitments);
      expect((await userReservePortal.commitments(3)).committed).to.be.true;
      pendingCommitments = await operator.fetchPendingCommitments();
      expect(pendingCommitments.length).to.be.equal(0);

      // Address should be properly set
      const { name } = await ensjs.getName(userAccount.address);
      expect(name).to.be.equal(NAME);
    });
  });
});
