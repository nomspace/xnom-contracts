// SPDX-License-Identifier: MIT

pragma solidity ^0.8.3;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/interfaces/IERC721Metadata.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/utils/ERC721Holder.sol";

contract OperatorOwned is Ownable {
  address public operator;

  event OperatorChanged(
    address indexed previousOperator,
    address indexed nextOperator
  );

  constructor(address _operator) {
    operator = _operator;
  }

  modifier onlyOperator() {
    require(msg.sender == operator, "Only operator can call this function");
    _;
  }

  function setOperator(address _newOperator) external onlyOwner {
    emit OperatorChanged(operator, _newOperator);
    operator = _newOperator;
  }
}
