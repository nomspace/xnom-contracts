// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "./MockERC721.sol";
import "../OperatorOwnedERC721.sol";

contract MockOperatorOwnedERC721 is OperatorOwnedERC721 {
  constructor(IERC721Metadata _underlying, address _operator)
    OperatorOwnedERC721(_underlying, _operator)
  {}

  function mint(
    address _to,
    uint256 _tokenId,
    uint256 // rentTime
  ) public {
    MockERC721(address(underlying)).mint(address(this), _tokenId);
    this.migrateIn(_tokenId, _to);
  }
}
