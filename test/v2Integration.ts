import { ethers } from "hardhat";
import { expect } from "chai";
import { ReservePortal } from "../typechain/ReservePortal";
import { ReservePortal__factory } from "../typechain/factories/ReservePortal__factory";
import { OwnableMinimalForwarder } from "../typechain/OwnableMinimalForwarder";
import { OwnableMinimalForwarder__factory } from "../typechain/factories/OwnableMinimalForwarder__factory";
import { ENSRegistryWithContext } from "../typechain/ENSRegistryWithContext";
import { ENSRegistryWithContext__factory } from "../typechain/factories/ENSRegistryWithContext__factory";
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
import fs from "fs";

const labelhash = (label: string) => utils.keccak256(utils.toUtf8Bytes(label));

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ZERO_HASH =
  "0x0000000000000000000000000000000000000000000000000000000000000000";
const TLD = "nom";
const DAY_IN_SECONDS = 60 * 60 * 24;
const DURATION = DAY_IN_SECONDS;
const FEE_PER_SECOND = 158548959919; // $5 per year
const AMOUNT = (DURATION * FEE_PER_SECOND).toString();
const NAME = "asdf";
const NAMEHASH_WITH_TLD = namehash.hash(`${NAME}.nom`);
const NAME2 = "fdsa";
const NAMEHASH2_WITH_TLD = namehash.hash(`${NAME2}.nom`);

const takeSnapshot = async () => {
  return await ethers.provider.send("evm_snapshot", []);
};

const revertSnapshot = async (snapshotId: number) => {
  await ethers.provider.send("evm_revert", [snapshotId]);
};

const mineBlock = async () => {
  await ethers.provider.send("evm_mine", []);
};

describe("Nom v2 Integration test", function () {
  let chainId: number;
  const anotherChainId = 4;
  let ownerAccount: SignerWithAddress;
  let operatorAccount: SignerWithAddress;
  let userAccount: Wallet;
  let userAccount2: Wallet;
  let userReservePortal: ReservePortal;
  let forwarder: OwnableMinimalForwarder;
  let operatorReservePortal: ReservePortal;
  let token: MockERC20;
  let ens: ENSRegistryWithContext;
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
    userAccount2 = Wallet.createRandom().connect(ethers.provider);
    await ownerAccount.sendTransaction({
      to: userAccount2.address,
      value: utils.parseEther("1"),
    });

    // Deploy ReservePortal
    const ReservePortal = new ReservePortal__factory();
    const reservePortal = await ReservePortal.connect(ownerAccount).deploy(
      DAY_IN_SECONDS,
      operatorAccount.address
    );
    await reservePortal.deployed();
    const basePath = `/tmp/${chainId}_${reservePortal.address}`;
    const topics = [
      "0x023ad9f3cfd45bbf91919354cab651602c11b3d4267df2f095331f1e31c0c429",
      "0x2e5fd7be03546a23e6d8b061de2bbf82f42e6940f38eab48de2846e96fb5fc12",
      "0xa0add9b3f251e0c65ca063f300e2f04bc423f4b29b11f0149bd33d75f0160172",
    ];
    for (const topic of topics) {
      try {
        fs.unlinkSync(`${basePath}_${topic}_events.txt`);
      } catch (e) {}
      try {
        fs.unlinkSync(`${basePath}_${topic}_lastBlock.txt`);
      } catch (e) {}
    }
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
    ens = await new ENSRegistryWithContext__factory()
      .connect(ownerAccount)
      .deploy();
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
    await baseRegistrarImplementation.setTrustedForwarder(
      forwarder.address,
      true
    );
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
    const portals = {
      [chainId]: operatorReservePortal,
    };
    const forwarders = {
      [chainId]: forwarder,
    };
    operator = new Operator(
      signers,
      portals,
      forwarders,
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
        {}, // no vNOM
        {
          [chainId]: baseRegistrarImplementation.address,
        },
        {
          [chainId]: nomRegistrarController.address,
        },
        {
          [chainId]: nomRegistrarController.address, // dummy vNOMRegistrar
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

  afterEach(async () => {
    await mineBlock();
  });

  describe("empty run", () => {
    it("should return 0 pending commitments", async () => {
      const pendingCommitments = await operator.fetchPendingCommitments();
      expect(pendingCommitments.length).to.be.equal(0);
    });
  });

  const getTxDefaults = async (from: string = userAccount.address) => {
    const nonce = await forwarder.getNonce(from);
    const gas = 2e6;
    const value = 0;
    return { from, nonce, gas, value };
  };

  const getSignature = async (
    account: Wallet,
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
      chainId: anotherChainId,
      verifyingContract: forwarder.address,
    };
    const types = {
      ForwardRequest: [
        { name: "from", type: "address" },
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
        { name: "gas", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "chainId", type: "uint256" },
        { name: "data", type: "bytes" },
      ],
    };
    const values = {
      from,
      to,
      value,
      gas,
      nonce,
      chainId: anotherChainId,
      data,
    };
    return await account._signTypedData(domain, types, values);
  };

  const register = async (
    name: string,
    nomRegistrarController: NomRegistrarController
  ) => {
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
    const signature = await getSignature(
      userAccount,
      from,
      to,
      value,
      gas,
      nonce,
      data
    );
    await token.connect(userAccount).approve(userReservePortal.address, AMOUNT);
    await userReservePortal.escrow(
      token.address,
      AMOUNT,
      chainId,
      {
        from,
        to,
        gas,
        value,
        nonce,
        chainId: anotherChainId,
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
    const signature = await getSignature(
      userAccount,
      from,
      to,
      value,
      gas,
      nonce,
      data
    );
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
        chainId: anotherChainId,
        data,
      },
      signature
    );
  };

  const setTexts = async (namehash: string, keys: string[], vals: string[]) => {
    const { from, nonce, gas, value } = await getTxDefaults();
    const currencies = [];
    const amounts = [];
    const chainIds = [];
    const requests = [];
    const signatures = [];
    for (let i = 0; i < keys.length; i++) {
      const { to, data } = await resolver.populateTransaction["setText"](
        namehash,
        keys[i],
        vals[i]
      );
      if (to == null || data == null) {
        throw new Error(`Tx fields are incomplete: ${to} ${data}`);
      }
      const signature = await getSignature(
        userAccount,
        from,
        to,
        value,
        gas,
        nonce.add(i),
        data
      );
      currencies.push(token.address);
      amounts.push(0);
      chainIds.push(chainId);
      requests.push({
        from,
        to,
        gas,
        value,
        nonce: nonce.add(i),
        chainId: anotherChainId,
        data,
      });
      signatures.push(signature);
    }
    await userReservePortal.batchEscrow(
      currencies,
      amounts,
      chainIds,
      requests,
      signatures
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
    const signature = await getSignature(
      userAccount,
      from,
      to,
      value,
      gas,
      nonce,
      data
    );
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
        chainId: anotherChainId,
        data,
      },
      signature
    );
  };

  const transferOwnership = async (tokenId: string, newOwner: string) => {
    const { from, nonce, gas, value } = await getTxDefaults();
    const { to, data } = await baseRegistrarImplementation.populateTransaction[
      "safeTransferFrom(address,address,uint256)"
    ](from, newOwner, tokenId);
    if (to == null || data == null) {
      throw new Error(`Tx fields are incomplete: ${to} ${data}`);
    }
    const signature = await getSignature(
      userAccount,
      from,
      to,
      value,
      gas,
      nonce,
      data
    );
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
        chainId: anotherChainId,
        data,
      },
      signature
    );
  };

  const reclaim = async (tokenId: string, from: string) => {
    const { nonce, gas, value } = await getTxDefaults(from);
    const { to, data } = await baseRegistrarImplementation.populateTransaction[
      "reclaim"
    ](tokenId, from);
    if (to == null || data == null) {
      throw new Error(`Tx fields are incomplete: ${to} ${data}`);
    }
    const signature = await getSignature(
      userAccount2,
      from,
      to,
      value,
      gas,
      nonce,
      data
    );
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
        chainId: anotherChainId,
        data,
      },
      signature
    );
  };

  describe("normal x-chain run", () => {
    it("should register", async () => {
      await register(NAME, nomRegistrarController);
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
      const KEYS = ["com.github"];
      const VALUES = ["https://github.com/nomspace"];
      await setTexts(NAMEHASH_WITH_TLD, KEYS, VALUES);
      let pendingCommitments = await operator.fetchPendingCommitments();
      expect(pendingCommitments.length).to.be.equal(1);
      await operator.finalizePendingCommitments(pendingCommitments);
      expect((await userReservePortal.commitments(2)).committed).to.be.true;
      pendingCommitments = await operator.fetchPendingCommitments();
      expect(pendingCommitments.length).to.be.equal(0);

      // Address should be properly set
      for (let i = 0; i < KEYS.length; i++) {
        expect(await resolver.text(NAMEHASH_WITH_TLD, KEYS[i])).to.be.equal(
          VALUES[i]
        );
      }
    });

    it("should batch setText", async () => {
      // Set text
      const KEYS = ["com.github", "url"];
      const VALUES = ["https://github.com/nomspace2", "someurl"];
      await setTexts(NAMEHASH_WITH_TLD, KEYS, VALUES);
      let pendingCommitments = await operator.fetchPendingCommitments();
      expect(pendingCommitments.length).to.be.equal(2);
      await operator.finalizePendingCommitments(pendingCommitments);
      expect((await userReservePortal.commitments(2)).committed).to.be.true;
      expect((await userReservePortal.commitments(3)).committed).to.be.true;
      pendingCommitments = await operator.fetchPendingCommitments();
      expect(pendingCommitments.length).to.be.equal(0);

      // Address should be properly set
      for (let i = 0; i < KEYS.length; i++) {
        expect(await resolver.text(NAMEHASH_WITH_TLD, KEYS[i])).to.be.equal(
          VALUES[i]
        );
      }
    });

    it("should reverse register", async () => {
      // Set reverse register
      await reverseRegister(NAME);
      let pendingCommitments = await operator.fetchPendingCommitments();
      expect(pendingCommitments.length).to.be.equal(1);
      await operator.finalizePendingCommitments(pendingCommitments);
      expect((await userReservePortal.commitments(4)).committed).to.be.true;
      pendingCommitments = await operator.fetchPendingCommitments();
      expect(pendingCommitments.length).to.be.equal(0);

      // Address should be properly set
      const { name } = await ensjs.getName(userAccount.address);
      expect(name).to.be.equal(NAME);
    });

    it("should transfer ownership", async () => {
      const tokenId = labelhash(NAME);
      await transferOwnership(tokenId, userAccount2.address);
      let pendingCommitments = await operator.fetchPendingCommitments();
      expect(pendingCommitments.length).to.be.equal(1);
      await operator.finalizePendingCommitments(pendingCommitments);
      expect((await userReservePortal.commitments(5)).committed).to.be.true;
      pendingCommitments = await operator.fetchPendingCommitments();
      expect(pendingCommitments.length).to.be.equal(0);

      // userAccount2 is new owner, but userAccount still owns the record
      const owner = await baseRegistrarImplementation.ownerOf(tokenId);
      expect(owner).to.be.equal(userAccount2.address);
      const recordOwner = await ensjs.name(`${NAME}.nom`).getOwner();
      expect(recordOwner).to.be.equal(userAccount.address);
    });

    it("should reclaim", async () => {
      const tokenId = labelhash(NAME);
      await reclaim(tokenId, userAccount2.address);
      let pendingCommitments = await operator.fetchPendingCommitments();
      expect(pendingCommitments.length).to.be.equal(1);
      await operator.finalizePendingCommitments(pendingCommitments);
      expect((await userReservePortal.commitments(6)).committed).to.be.true;
      pendingCommitments = await operator.fetchPendingCommitments();
      expect(pendingCommitments.length).to.be.equal(0);

      // userAccount2 is new owner and userAccount2 owns the record
      const owner = await baseRegistrarImplementation.ownerOf(tokenId);
      expect(owner).to.be.equal(userAccount2.address);
      const recordOwner = await ensjs.name(`${NAME}.nom`).getOwner();
      expect(recordOwner).to.be.equal(userAccount2.address);
    });
  });

  describe("normal run", () => {
    it("should register", async () => {
      await token.approve(nomRegistrarController.address, AMOUNT);
      const balanceBefore = await token.balanceOf(userAccount.address);
      await nomRegistrarController
        .connect(userAccount)
        .registerWithConfig(
          NAME2,
          userAccount.address,
          DURATION,
          resolver.address,
          ZERO_ADDRESS
        );
      const balanceAfter = await token.balanceOf(userAccount.address);
      expect(balanceBefore.sub(balanceAfter)).to.be.equal(AMOUNT);

      // NFT should be properly minted
      const tokenId = labelhash(NAME2);
      expect(await baseRegistrarImplementation.ownerOf(tokenId)).to.be.equal(
        userAccount.address
      );
      expect(await resolver["addr(bytes32)"](NAMEHASH2_WITH_TLD)).to.be.equal(
        ZERO_ADDRESS
      );
    });

    it("should setAddr", async () => {
      await resolver
        .connect(userAccount)
        ["setAddr(bytes32,address)"](NAMEHASH2_WITH_TLD, userAccount.address);

      expect(await resolver["addr(bytes32)"](NAMEHASH2_WITH_TLD)).to.be.equal(
        userAccount.address
      );
    });

    it("should not setAddr if user is not the owner", async () => {
      const nhash = namehash.hash(`random.${TLD}`);
      await expect(
        resolver
          .connect(userAccount)
          ["setAddr(bytes32,address)"](nhash, userAccount.address)
      ).to.be.revertedWith("Transaction reverted");
    });

    it("should setText", async () => {
      const KEY = "com.github";
      const VALUE = "https://github.com/nomspace";
      await resolver
        .connect(userAccount)
        .setText(NAMEHASH2_WITH_TLD, KEY, VALUE);

      expect(await resolver.text(NAMEHASH2_WITH_TLD, KEY)).to.be.equal(VALUE);
    });

    it("should reverse register", async () => {
      await reverseRegistrar.connect(userAccount).setName(NAME2);

      const { name } = await ensjs.getName(userAccount.address);
      expect(name).to.be.equal(NAME2);
    });

    it("should transfer ownership", async () => {
      const tokenId = labelhash(NAME2);
      await baseRegistrarImplementation
        .connect(userAccount)
        ["safeTransferFrom(address,address,uint256)"](
          userAccount.address,
          userAccount2.address,
          tokenId
        );

      // userAccount2 is new owner, but userAccount still owns the record
      const owner = await baseRegistrarImplementation.ownerOf(tokenId);
      expect(owner).to.be.equal(userAccount2.address);
      const recordOwner = await ensjs.name(`${NAME2}.nom`).getOwner();
      expect(recordOwner).to.be.equal(userAccount.address);
    });

    it("should reclaim", async () => {
      const tokenId = labelhash(NAME2);
      await baseRegistrarImplementation
        .connect(userAccount2)
        .reclaim(tokenId, userAccount2.address);

      // userAccount2 is new owner and userAccount2 owns the record
      const owner = await baseRegistrarImplementation.ownerOf(tokenId);
      expect(owner).to.be.equal(userAccount2.address);
      const recordOwner = await ensjs.name(`${NAME}.nom`).getOwner();
      expect(recordOwner).to.be.equal(userAccount2.address);
    });

    it("should batch register", async () => {
      await nomRegistrarController.addToWhitelist(operatorAccount.address);
      let args: any = [[], [], [], [], []];
      for (let i = 0; i < 10; i++) {
        args[0].push(`${i}`);
        args[1].push(userAccount.address);
        args[2].push(DURATION);
        args[3].push(resolver.address);
        args[4].push(ZERO_ADDRESS);
      }
      await nomRegistrarController
        .connect(operatorAccount)
        .batchRegisterWithConfig(args[0], args[1], args[2], args[3], args[4]);
      for (let i = 0; i < 10; i++) {
        const name = `${i}`;
        const tokenId = labelhash(name);
        expect(await baseRegistrarImplementation.ownerOf(tokenId)).to.be.equal(
          userAccount.address
        );
        expect(
          await resolver["addr(bytes32)"](namehash.hash(`${name}.nom`))
        ).to.be.equal(ZERO_ADDRESS);
      }
      await nomRegistrarController.removeFromWhitelist(operatorAccount.address);
    });
  });
});
