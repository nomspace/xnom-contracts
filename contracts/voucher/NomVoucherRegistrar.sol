// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/interfaces/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";

import "../nom-v2/NomRegistrarController.sol";

contract NomVoucherRegistrar is Ownable {
  using SafeMath for uint256;
  using SafeERC20 for IERC20;

  NomRegistrarController public immutable nomRegistrarController;
  IERC20 public immutable nomVoucher;
  uint256 public constant YEAR_IN_SECONDS = 31449600;

  constructor(
    NomRegistrarController _nomRegistrarController,
    IERC20 _nomVoucher
  ) {
    nomRegistrarController = _nomRegistrarController;
    nomVoucher = _nomVoucher;
  }

  function rentPrice(
    string memory name,
    uint256 duration,
    address payer
  ) external view returns (uint256) {
    uint256 standardCost = nomRegistrarController.rentPrice(
      "example",
      duration,
      payer
    );
    uint256 price = nomRegistrarController.rentPrice(name, duration, payer);
    return
      (duration).mul(1 ether).mul(price).div(standardCost).div(
        YEAR_IN_SECONDS
      );
  }

  function registerWithConfig(
    string memory name,
    address owner,
    uint256 duration,
    address resolver,
    address addr
  ) external {
    uint256 cost = this.rentPrice(name, duration, msg.sender);
    nomVoucher.safeTransferFrom(msg.sender, address(this), cost);
    nomRegistrarController.registerWithConfig(
      name,
      owner,
      duration,
      resolver,
      addr
    );
  }

  function renew(string calldata name, uint256 duration) external {
    uint256 cost = this.rentPrice(name, duration, msg.sender);
    nomVoucher.safeTransferFrom(msg.sender, address(this), cost);
    nomRegistrarController.renew(name, duration);
  }
}
