import { ethers } from "hardhat";
import { expect } from "chai";
import { ReservePortal } from "../typechain/ReservePortal";
import { ReservePortal__factory } from "../typechain/factories/ReservePortal__factory";
import { MockERC20 } from "../typechain/MockERC20";
import { MockERC20__factory } from "../typechain/factories/MockERC20__factory";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

const increaseTime = async (seconds: number) => {
  await ethers.provider.send("evm_increaseTime", [seconds]);
  await ethers.provider.send("evm_mine", []);
};

describe("ReservePortal", function () {
  let chainId: number;
  let owner: SignerWithAddress;
  let operator: SignerWithAddress;
  let target: SignerWithAddress;
  let reservePortal: ReservePortal;
  let token: MockERC20;

  const DAY_IN_SECONDS = 60 * 60 * 24;
  const AMOUNT = 10;

  before(async function () {
    const network = await ethers.provider.getNetwork();
    chainId = network.chainId;

    const accounts = await ethers.getSigners();
    owner = accounts[0];
    operator = accounts[1];
    target = accounts[2];

    // Deploy ReservePortal
    const ReservePortal = new ReservePortal__factory();
    reservePortal = await ReservePortal.connect(owner).deploy(
      DAY_IN_SECONDS,
      operator.address
    );
    await reservePortal.deployed();

    // Deploy Token and set minimum
    const MockERC20 = await new MockERC20__factory();
    token = await MockERC20.connect(owner).deploy();
    await token.deployed();
  });

  describe("escrow", () => {
    it("should work", async function () {
      await token.approve(reservePortal.address, AMOUNT);
      const balanceBefore = await token.balanceOf(owner.address);
      await reservePortal.escrow(
        token.address,
        AMOUNT,
        chainId,
        target.address,
        0,
        "0x00",
        owner.address
      );
      const balanceAfter = await token.balanceOf(owner.address);
      expect(balanceBefore.sub(balanceAfter)).to.be.equal(AMOUNT);

      const commitment = await reservePortal.commitments(0);
      expect(commitment.index).to.be.equal(0);
      expect(commitment.owner).to.be.equal(owner.address);
      expect(commitment.currency).to.be.equal(token.address);
      expect(commitment.amount).to.be.equal(AMOUNT);
      expect(commitment.chainId).to.be.equal(chainId);
      expect(commitment.target).to.be.equal(target.address);
      expect(commitment.value).to.be.equal(0);
      expect(commitment.data).to.be.equal("0x00");
      expect(commitment.voided).to.be.false;
      expect(commitment.committed).to.be.false;
      expect(commitment.canceled).to.be.false;
    });
  });

  describe("void", () => {
    it("should fail if voidDelay is not yet over", async function () {
      await expect(reservePortal.void(0)).to.be.revertedWith(
        "User is not allowed to void commitment yet"
      );
    });
    it("should work once voidDelay is over", async function () {
      await increaseTime(DAY_IN_SECONDS);
      const balanceBefore = await token.balanceOf(owner.address);
      await reservePortal.void(0);
      const balanceAfter = await token.balanceOf(owner.address);
      expect(balanceAfter.sub(balanceBefore)).to.be.equal(AMOUNT);
      const commitment = await reservePortal.commitments(0);
      expect(commitment.voided).to.be.true;
    });
  });
});
