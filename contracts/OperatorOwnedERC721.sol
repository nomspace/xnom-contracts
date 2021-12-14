// SPDX-License-Identifier: MIT

pragma solidity ^0.8.3;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/interfaces/IERC721Metadata.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/utils/ERC721Holder.sol";

import "./OperatorOwned.sol";

contract OperatorOwnedERC721 is OperatorOwned, ERC721, ERC721Holder {
  IERC721 public immutable underlying;

  constructor(IERC721Metadata _underlying, address _operator)
    OperatorOwned(_operator)
    ERC721(_underlying.symbol(), _underlying.name())
  {
    underlying = _underlying;
  }

  modifier onlyOperatorOrTokenOwner(uint256 tokenId) {
    require(
      msg.sender == operator || msg.sender == ownerOf(tokenId),
      "Only operator or token owner is allowed"
    );
    _;
  }

  // == IERC721 ==
  /**
   * @dev Returns the owner of the `tokenId` token.
   *
   * Requirements:
   *
   * - `tokenId` must exist.
   */
  function ownerOf(uint256 tokenId)
    public
    view
    override
    returns (address owner)
  {
    address underlyingTokenOwner = underlying.ownerOf(tokenId);
    if (underlyingTokenOwner == address(this)) {
      return super.ownerOf(tokenId);
    }
    return underlyingTokenOwner;
  }

  function migrateIn(uint256 _tokenId, address _onBehalfOf) external {
    underlying.safeTransferFrom(msg.sender, address(this), _tokenId);
    _safeMint(_onBehalfOf, _tokenId);
  }

  function migrateOut(uint256 _tokenId, address _to)
    external
    onlyOperatorOrTokenOwner(_tokenId)
  {
    require(ownerOf(_tokenId) == msg.sender, "Caller is not token owner");
    underlying.safeTransferFrom(address(this), _to, _tokenId);
    _burn(_tokenId);
  }
}
