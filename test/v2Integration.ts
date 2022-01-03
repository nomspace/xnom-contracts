import { ethers } from "hardhat";
import { expect } from "chai";
import { ReservePortal } from "../typechain/ReservePortal";
import { ReservePortal__factory } from "../typechain/factories/ReservePortal__factory";
import { OwnableMinimalForwarder } from "../typechain/OwnableMinimalForwarder";
import { OwnableMinimalForwarder__factory } from "../typechain/factories/OwnableMinimalForwarder__factory";
import { ENSRegistry } from "../typechain/ENSRegistry";
import { ENSRegistry__factory } from "../typechain/factories/ENSRegistry__factory";
import { PublicResolver } from "../typechain/PublicResolver";
import { PublicResolver__factory } from "../typechain/factories/PublicResolver__factory";
import { BaseRegistrarImplementation } from "../typechain/BaseRegistrarImplementation";
import { BaseRegistrarImplementation__factory } from "../typechain/factories/BaseRegistrarImplementation__factory";
import { NomRegistrarController } from "../typechain/NomRegistrarController";
import { NomRegistrarController__factory } from "../typechain/factories/NomRegistrarController__factory";
import { ReverseRegistrar } from "../typechain/ReverseRegistrar";
import { ReverseRegistrar__factory } from "../typechain/factories/ReverseRegistrar__factory";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { Operator } from "../src/index";
import { MockERC20 } from "../typechain/MockERC20";
import { MockERC20__factory } from "../typechain/factories/MockERC20__factory";
import { buildConfig } from "../src/configs/default";
import namehash from "eth-ens-namehash";
import ENS from "@ensdomains/ensjs";
import { BigNumberish, utils, Wallet } from "ethers";

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
const NAMEHASH_WITH_TLD = namehash.hash(`${NAME}.nom`);

const takeSnapshot = async () => {
  return await ethers.provider.send("evm_snapshot", []);
};

const revertSnapshot = async (snapshotId: number) => {
  await ethers.provider.send("evm_revert", [snapshotId]);
};

describe("Nom v2 Integration test", function () {
  let chainId: number;
  let ownerAccount: SignerWithAddress;
  let operatorAccount: SignerWithAddress;
  let userAccount: Wallet;
  let userReservePortal: ReservePortal;
  let forwarder: OwnableMinimalForwarder;
  let operatorReservePortal: ReservePortal;
  let token: MockERC20;
  let ens: ENSRegistry;
  let resolver: PublicResolver;
  let baseRegistrarImplementation: BaseRegistrarImplementation;
  let nomRegistrarController: NomRegistrarController;
  let reverseRegistrar: ReverseRegistrar;
  let operator: Operator;
  let ensjs: any;

  before(async function () {
    const network = await ethers.provider.getNetwork();
    chainId = network.chainId;

    const accounts = await ethers.getSigners();
    ownerAccount = accounts[0];
    operatorAccount = accounts[1];
    userAccount = Wallet.createRandom().connect(ethers.provider);
    await ownerAccount.sendTransaction({
      to: userAccount.address,
      value: utils.parseEther("1"),
    });

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

    // Deploy Forwarder
    const OwnableMinimalForwarder = new OwnableMinimalForwarder__factory();
    forwarder = await OwnableMinimalForwarder.connect(operatorAccount).deploy();
    await forwarder.deployed();

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
    await resolver.setTrustedForwarder(forwarder.address, true);
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
    await nomRegistrarController.addToWhitelist(forwarder.address);
    const reverseNode = namehash.hash("reverse");
    const reverseLabel = labelhash("reverse");
    reverseRegistrar = await new ReverseRegistrar__factory()
      .connect(ownerAccount)
      .deploy(ens.address, resolver.address);
    await reverseRegistrar.deployed();
    await reverseRegistrar.setTrustedForwarder(forwarder.address, true);
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
      [chainId]: {
        reservePortal: operatorReservePortal,
        forwarder,
      },
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
          [chainId]: nomRegistrarController.address,
        },
        {
          [chainId]: reverseRegistrar.address,
        },
        {
          [chainId]: resolver.address,
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

  const getTxDefaults = async () => {
    const from = userAccount.address;
    const nonce = await forwarder.getNonce(userAccount.address);
    const gas = 2e6;
    const value = 0;
    return { from, nonce, gas, value };
  };

  const getSignature = async (
    from: string,
    to: string,
    value: BigNumberish,
    gas: BigNumberish,
    nonce: BigNumberish,
    data: string
  ) => {
    const domain = {
      name: "OwnableMinimalForwarder",
      version: "0.0.1",
      chainId,
      verifyingContract: forwarder.address,
    };
    const types = {
      ForwardRequest: [
        { name: "from", type: "address" },
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
        { name: "gas", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "data", type: "bytes" },
      ],
    };
    const values = {
      from,
      to,
      value,
      gas,
      nonce,
      data,
    };
    return await userAccount._signTypedData(domain, types, values);
  };

  const register = async (name: string) => {
    const { from, nonce, gas, value } = await getTxDefaults();
    const { to, data } =
      await nomRegistrarController.populateTransaction.registerWithConfig(
        name,
        userAccount.address,
        DURATION,
        resolver.address,
        userAccount.address
      );
    if (to == null || data == null) {
      throw new Error(`Tx fields are incomplete: ${to} ${data}`);
    }
    const signature = await getSignature(from, to, value, gas, nonce, data);
    await token
      .connect(userAccount)
      .approve(userReservePortal.address, AMOUNT.toString());
    await userReservePortal.escrow(
      token.address,
      AMOUNT.toString(),
      chainId,
      {
        from,
        to,
        gas,
        value,
        nonce,
        data,
      },
      signature
    );
  };

  const setAddr = async (namehash: string, addr: string) => {
    const { from, nonce, gas, value } = await getTxDefaults();
    const { to, data } = await resolver.populateTransaction[
      "setAddr(bytes32,address)"
    ](namehash, addr);
    if (to == null || data == null) {
      throw new Error(`Tx fields are incomplete: ${to} ${data}`);
    }
    const signature = await getSignature(from, to, value, gas, nonce, data);
    await userReservePortal.escrow(
      token.address,
      0,
      chainId,
      {
        from,
        to,
        gas,
        value,
        nonce,
        data,
      },
      signature
    );
  };

  const setText = async (namehash: string, key: string, val: string) => {
    const { from, nonce, gas, value } = await getTxDefaults();
    const { to, data } = await resolver.populateTransaction["setText"](
      namehash,
      key,
      val
    );
    if (to == null || data == null) {
      throw new Error(`Tx fields are incomplete: ${to} ${data}`);
    }
    const signature = await getSignature(from, to, value, gas, nonce, data);
    await userReservePortal.escrow(
      token.address,
      0,
      chainId,
      {
        from,
        to,
        gas,
        value,
        nonce,
        data,
      },
      signature
    );
  };

  const reverseRegister = async (name: string) => {
    const { from, nonce, gas, value } = await getTxDefaults();
    const { to, data } = await reverseRegistrar.populateTransaction["setName"](
      name
    );
    if (to == null || data == null) {
      throw new Error(`Tx fields are incomplete: ${to} ${data}`);
    }
    const signature = await getSignature(from, to, value, gas, nonce, data);
    await userReservePortal.escrow(
      token.address,
      0,
      chainId,
      {
        from,
        to,
        gas,
        value,
        nonce,
        data,
      },
      signature
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
      await setAddr(NAMEHASH_WITH_TLD, ownerAccount.address);
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

    it("should not setAddr if user is not the owner", async () => {
      const snapshot = await takeSnapshot();
      const nhash = namehash.hash(`random.${TLD}`);
      await setAddr(nhash, ownerAccount.address);
      let pendingCommitments = await operator.fetchPendingCommitments();
      expect(pendingCommitments.length).to.be.equal(1);
      await operator.finalizePendingCommitments(pendingCommitments);
      expect((await userReservePortal.commitments(2)).committed).to.be.false;
      pendingCommitments = await operator.fetchPendingCommitments();
      expect(pendingCommitments.length).to.be.equal(1);

      // Address should be properly set
      expect(await resolver["addr(bytes32)"](nhash)).to.be.equal(ZERO_ADDRESS);
      revertSnapshot(snapshot);
    });

    it("should setText", async () => {
      // Set text
      const KEY = "com.github";
      const VALUE = "https://github.com/nomspace";
      await setText(NAMEHASH_WITH_TLD, KEY, VALUE);
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
      await reverseRegister(NAME);
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
