// SPDX-License-Identifier: MIT

pragma solidity ^0.8.3;

import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract ManagePortal is Ownable {
  using SafeMath for uint256;

  struct Request {
    address from;
    address to;
    uint256 value;
    uint256 gas;
    uint256 nonce;
    bytes data;
    uint256 chainId;
    bytes signature;
  }

  mapping(uint256 => Request) public requests;
  uint256 public nextRequestIndex;
  uint256 public gasPrice;

  event RequestAdded(uint256 indexed index, uint256 timestamp);
  event GasPriceChanged(
    uint256 indexed previousGasPrice,
    uint256 indexed nextGasPrice
  );
  event FundsWithdrawn(uint256 indexed amount);

  constructor() {
    nextRequestIndex = 0;
    gasPrice = 1000000000; // 1 gwei
  }

  // == Public write functions ==

  function addRequest(Request calldata request) external payable {
    require(
      msg.value >= request.gas.mul(gasPrice),
      "Not enough msg.value to cover gas"
    );
    requests[nextRequestIndex] = request;
    uint256 currentTime = block.timestamp;
    emit RequestAdded(nextRequestIndex++, currentTime);
  }

  // == Owner only write functions ==

  function setGasPrice(uint256 _nextGasPrice) external onlyOwner {
    emit GasPriceChanged(gasPrice, _nextGasPrice);
    gasPrice = _nextGasPrice;
  }

  function withdraw(address payable _to) external onlyOwner {
    uint256 amount = address(this).balance;
    _to.transfer(amount);
    emit FundsWithdrawn(amount);
  }
}
