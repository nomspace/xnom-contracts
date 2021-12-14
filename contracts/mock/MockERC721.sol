// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

contract MockERC721 is ERC721 {
  constructor() ERC721("Mock NFT", "MOCK") {}

  function mint(address _to, uint256 _tokenId) external {
    _safeMint(_to, _tokenId);
  }
}
