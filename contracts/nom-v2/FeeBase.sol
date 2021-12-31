// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@ensdomains/ens-contracts/contracts/ethregistrar/StringUtils.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";

contract FeeBase is Ownable {
  using SafeMath for uint256;
  using SafeERC20 for IERC20;
  using StringUtils for *;

  mapping(address => bool) public whitelist;
  IERC20 public feeCurrency;
  uint256 public feePerSecond;
  address public treasury;

  event CurrencyChanged(
    address indexed previousCurrency,
    address indexed nextCurrency
  );
  event FeePerSecondChanged(
    uint256 indexed previousFeePerSecond,
    uint256 indexed nextFeePerSecond
  );
  event TreasuryChanged(
    address indexed previousTreasury,
    address indexed nextTreasury
  );
  event WhitelistAdd(address indexed user);
  event WhitelistRemove(address indexed user);

  constructor(
    IERC20 _feeCurrency,
    uint256 _feePerSecond,
    address _treasury
  ) {
    feeCurrency = _feeCurrency;
    feePerSecond = _feePerSecond;
    treasury = _treasury;
  }

  function addToWhitelist(address _user) external onlyOwner {
    whitelist[_user] = true;
    emit WhitelistAdd(_user);
  }

  function removeFromWhitelist(address _user) external onlyOwner {
    whitelist[_user] = false;
    emit WhitelistRemove(_user);
  }

  // Takes into account the name and calling user
  function feeRate(string memory _name, address _user)
    external
    view
    returns (uint256)
  {
    if (whitelist[_user]) {
      return 0;
    }
    uint256 len = _name.strlen();
    if (len == 1) {
      return feePerSecond.mul(4);
    } else if (len == 2) {
      return feePerSecond.mul(3);
    } else if (len == 3) {
      return feePerSecond.mul(2);
    }
    return feePerSecond;
  }

  function setCurrency(IERC20 _feeCurrency) external onlyOwner {
    IERC20 previousCurrency = feeCurrency;
    feeCurrency = _feeCurrency;
    emit CurrencyChanged(address(previousCurrency), address(feeCurrency));
  }

  function setFeePerSecond(uint256 _feePerSecond) external onlyOwner {
    uint256 previousFeePerSecond = feePerSecond;
    feePerSecond = _feePerSecond;
    emit FeePerSecondChanged(previousFeePerSecond, feePerSecond);
  }

  function setTreasury(address treasury_) external onlyOwner {
    address previousTreasury = treasury;
    treasury = treasury_;
    emit TreasuryChanged(previousTreasury, treasury);
  }
}
