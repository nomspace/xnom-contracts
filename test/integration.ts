import { ethers } from "hardhat";
import { expect } from "chai";
import { ReservePortal } from "../typechain/ReservePortal";
import { ReservePortal__factory } from "../typechain/factories/ReservePortal__factory";
import { MockERC721__factory } from "../typechain/factories/MockERC721__factory";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { Operator } from "../src/index";
import { MockERC20 } from "../typechain/MockERC20";
import { MockERC20__factory } from "../typechain/factories/MockERC20__factory";
import { MockOperatorOwnedERC721 } from "../typechain/MockOperatorOwnedERC721";
import { MockOperatorOwnedERC721__factory } from "../typechain/factories/MockOperatorOwnedERC721__factory";

const increaseTime = async (seconds: number) => {
  await ethers.provider.send("evm_increaseTime", [seconds]);
  await ethers.provider.send("evm_mine", []);
};

describe("Integration test", function () {
  let chainId: number;
  let ownerAccount: SignerWithAddress;
  let operatorAccount: SignerWithAddress;
  let userAccount: SignerWithAddress;
  let userReservePortal: ReservePortal;
  let operatorReservePortal: ReservePortal;
  let token: MockERC20;
  let nft: MockOperatorOwnedERC721;
  let operator: Operator;

  const DAY_IN_SECONDS = 60 * 60 * 24;
  const AMOUNT = 10;

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
    userReservePortal = await ReservePortal.attach(
      reservePortal.address
    ).connect(userAccount);
    operatorReservePortal = await ReservePortal.attach(
      reservePortal.address
    ).connect(operatorAccount);

    // Deploy Token
    const MockERC20 = await new MockERC20__factory();
    token = await MockERC20.connect(userAccount).deploy();
    await token.deployed();

    // Deploy NFT
    const MockERC721 = await new MockERC721__factory();
    const underlyingNft = await MockERC721.connect(ownerAccount).deploy();
    await underlyingNft.deployed();

    // Deploy OperatorOwned NFT + set approval
    const MockOperatorOwnedERC721 =
      await new MockOperatorOwnedERC721__factory();
    nft = await MockOperatorOwnedERC721.connect(ownerAccount).deploy(
      underlyingNft.address,
      operatorAccount.address
    );
    await nft.deployed();
    await underlyingNft
      .connect(operatorAccount)
      .setApprovalForAll(nft.address, true);

    // Initialize Operator
    const signers = {
      [chainId]: operatorAccount,
    };
    const deployments = {
      [chainId]: operatorReservePortal,
    };
    operator = new Operator(signers, deployments, {
      [chainId]: {
        numConfirmations: 1,
      },
    });
  });

  describe("empty run", () => {
    it("should return 0 pending commitments", async () => {
      const pendingCommitments = await operator.fetchPendingCommitments();
      expect(pendingCommitments.length).to.be.equal(0);
    });
  });

  const reserveNFT = async (tokenId: number, nftRecipient?: string) => {
    const data = (
      await nft.populateTransaction.mint(userAccount.address, tokenId)
    ).data;
    if (!data) {
      throw new Error("Data is undefined");
    }
    await token.connect(userAccount).approve(userReservePortal.address, AMOUNT);
    await userReservePortal.escrow(
      token.address,
      AMOUNT,
      chainId,
      nft.address,
      0,
      data,
      nftRecipient || userAccount.address
    );
  };

  const voidCommitment = async (commitmentIndex: number) => {
    await userReservePortal.void(commitmentIndex);
  };

  describe("normal run", () => {
    it("should work", async function () {
      // Queue 3 commitments
      await reserveNFT(0);
      await reserveNFT(1);
      await reserveNFT(2);
      let pendingCommitments = await operator.fetchPendingCommitments();
      expect(pendingCommitments.length).to.be.equal(3);

      // Void a commitment
      await increaseTime(DAY_IN_SECONDS);
      await voidCommitment(2);
      pendingCommitments = await operator.fetchPendingCommitments();
      expect(pendingCommitments.length).to.be.equal(2);

      // Check that the commitments are commited
      await operator.finalizePendingCommitments(pendingCommitments);
      expect((await userReservePortal.commitments(0)).committed).to.be.true;
      expect((await userReservePortal.commitments(1)).committed).to.be.true;
      pendingCommitments = await operator.fetchPendingCommitments();
      expect(pendingCommitments.length).to.be.equal(0);

      // NFTs should be properly minted
      expect(await nft.ownerOf(0)).to.be.equal(userAccount.address);
      expect(await nft.ownerOf(1)).to.be.equal(userAccount.address);
    });
  });

  describe("races", () => {
    it("should be won by the person who committed first", async function () {
      // Queue a race for the 3rd token
      await reserveNFT(3, userAccount.address);
      await reserveNFT(3, ownerAccount.address);
      let pendingCommitments = await operator.fetchPendingCommitments();
      expect(pendingCommitments.length).to.be.equal(2);

      // Check that the commitments are commited
      await operator.finalizePendingCommitments(pendingCommitments);
      expect((await userReservePortal.commitments(3)).committed).to.be.true;
      expect((await userReservePortal.commitments(4)).canceled).to.be.true;
      pendingCommitments = await operator.fetchPendingCommitments();
      expect(pendingCommitments.length).to.be.equal(0);

      // NFTs should be properly minted
      expect(await nft.ownerOf(3)).to.be.equal(userAccount.address);
    });
  });
});
