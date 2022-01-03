// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/metatx/ERC2771Context.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

abstract contract RelayRecipient is ERC2771Context, Ownable {
  mapping(address => bool) trustedForwarder;

  event SetTrustedForwarder(address indexed user, bool allowed);

  constructor() ERC2771Context(msg.sender) {}

  function isTrustedForwarder(address forwarder)
    public
    view
    override
    returns (bool)
  {
    return trustedForwarder[forwarder];
  }

  function _msgSender()
    internal
    view
    virtual
    override(ERC2771Context, Context)
    returns (address sender)
  {
    return super._msgSender();
  }

  function _msgData()
    internal
    view
    virtual
    override(ERC2771Context, Context)
    returns (bytes calldata)
  {
    return super._msgData();
  }

  function setTrustedForwarder(address _user, bool _allowed)
    external
    onlyOwner
  {
    trustedForwarder[_user] = _allowed;
    emit SetTrustedForwarder(_user, _allowed);
  }
}
