// SPDX-License-Identifier: MIT

pragma solidity ^0.8.3;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/interfaces/IERC721Metadata.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/utils/ERC721Holder.sol";

contract OperatorOwnedERC721 is Ownable, ERC721, ERC721Holder {
  mapping(uint256 => bool) operatorRevoked;
  mapping(uint256 => address) _owners;
  address public operator;
  IERC721 public immutable underlying;

  event OperatorChanged(
    address indexed previousOperator,
    address indexed nextOperator
  );

  constructor(IERC721Metadata _underlying, address _operator)
    ERC721(_underlying.symbol(), _underlying.name())
  {
    underlying = _underlying;
    operator = _operator;
  }

  modifier onlyOperator() {
    require(msg.sender == operator, "Only operator can call this function");
    _;
  }

  modifier onlyOperatorOrTokenOwner(uint256 tokenId) {
    if (msg.sender == operator) {
      require(!operatorRevoked[tokenId], "Operator not allowed");
    } else {
      require(msg.sender == ownerOf(tokenId), "Non-token owner not allowed");
    }
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
    require(
      underlyingTokenOwner == address(this),
      "token is not under this contract's management"
    );
    return super.ownerOf(tokenId);
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

  // == Owner only write functions ==

  function setOperator(address _newOperator) external onlyOwner {
    emit OperatorChanged(operator, _newOperator);
    operator = _newOperator;
  }
}
