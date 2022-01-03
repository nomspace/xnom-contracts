// SPDX-License-Identifier: MIT

pragma solidity >=0.8.4;

import "@ensdomains/ens-contracts/contracts/registry/ENS.sol";
import "@ensdomains/ens-contracts/contracts/resolvers/profiles/ABIResolver.sol";
import "@ensdomains/ens-contracts/contracts/resolvers/profiles/AddrResolver.sol";
import "@ensdomains/ens-contracts/contracts/resolvers/profiles/ContentHashResolver.sol";
import "@ensdomains/ens-contracts/contracts/resolvers/profiles/DNSResolver.sol";
import "@ensdomains/ens-contracts/contracts/resolvers/profiles/InterfaceResolver.sol";
import "@ensdomains/ens-contracts/contracts/resolvers/profiles/NameResolver.sol";
import "@ensdomains/ens-contracts/contracts/resolvers/profiles/PubkeyResolver.sol";
import "@ensdomains/ens-contracts/contracts/resolvers/profiles/TextResolver.sol";
import "@ensdomains/ens-contracts/contracts/resolvers/Multicallable.sol";
import "../metatx/RelayRecipient.sol";

interface INameWrapper {
  function ownerOf(uint256 id) external view returns (address);
}

/**
 * A simple resolver anyone can use; only allows the owner of a node to set its
 * address.
 */
contract PublicResolver is
  Multicallable,
  ABIResolver,
  AddrResolver,
  ContentHashResolver,
  DNSResolver,
  InterfaceResolver,
  NameResolver,
  PubkeyResolver,
  TextResolver,
  RelayRecipient
{
  ENS ens;
  INameWrapper nameWrapper;

  /**
   * A mapping of operators. An address that is authorised for an address
   * may make any changes to the name that the owner could, but may not update
   * the set of authorisations.
   * (owner, operator) => approved
   */
  mapping(address => mapping(address => bool)) private _operatorApprovals;

  // Logged when an operator is added or removed.
  event ApprovalForAll(
    address indexed owner,
    address indexed operator,
    bool approved
  );

  constructor(ENS _ens, INameWrapper wrapperAddress) {
    ens = _ens;
    nameWrapper = wrapperAddress;
  }

  /**
   * @dev See {IERC1155-setApprovalForAll}.
   */
  function setApprovalForAll(address operator, bool approved) external {
    require(
      _msgSender() != operator,
      "ERC1155: setting approval status for self"
    );

    _operatorApprovals[_msgSender()][operator] = approved;
    emit ApprovalForAll(_msgSender(), operator, approved);
  }

  function isAuthorised(bytes32 node) internal view override returns (bool) {
    address owner = ens.owner(node);
    if (owner == address(nameWrapper)) {
      owner = nameWrapper.ownerOf(uint256(node));
    }
    return owner == _msgSender() || isApprovedForAll(owner, _msgSender());
  }

  /**
   * @dev See {IERC1155-isApprovedForAll}.
   */
  function isApprovedForAll(address account, address operator)
    public
    view
    returns (bool)
  {
    return _operatorApprovals[account][operator];
  }

  function supportsInterface(bytes4 interfaceID)
    public
    pure
    override(
      Multicallable,
      ABIResolver,
      AddrResolver,
      ContentHashResolver,
      DNSResolver,
      InterfaceResolver,
      NameResolver,
      PubkeyResolver,
      TextResolver
    )
    returns (bool)
  {
    return
      interfaceID == type(IMulticallable).interfaceId ||
      super.supportsInterface(interfaceID);
  }
}
