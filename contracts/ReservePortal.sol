// SPDX-License-Identifier: MIT

pragma solidity ^0.8.3;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/interfaces/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract ReservePortal is Ownable {
  using SafeERC20 for IERC20;

  mapping(IERC20 => uint256) public withdrawableAmounts;
  mapping(uint256 => Commitment) public commitments;
  uint256 public nextCommitmentIndex;
  uint256 public voidDelay;
  address public operator;

  struct Commitment {
    // Commitment metadata
    uint256 index;
    address owner;
    IERC20 currency;
    uint256 amount;
    uint256 timestamp;
    // Call metadata
    uint256 chainId;
    address target;
    uint256 value;
    bytes data;
    // State metadata
    bool voided;
    bool committed;
  }

  event Escrowed(uint256 indexed index, uint256 timestamp);
  event Voided(uint256 indexed index);
  event Committed(uint256 indexed index);
  event OperatorChanged(
    address indexed previousOperator,
    address indexed nextOperator
  );
  event FundsWithdrawn(IERC20 indexed token, uint256 indexed amount);

  constructor(uint256 _initialVoidDelay, address _operator) {
    nextCommitmentIndex = 0;
    voidDelay = _initialVoidDelay;
    operator = _operator;
  }

  modifier onlyOperator() {
    require(msg.sender == operator, "Caller is not operator");
    _;
  }

  modifier onlyCommitmentOwner(uint256 _commitmentIndex) {
    Commitment storage commitment = commitments[_commitmentIndex];
    require(commitment.owner == msg.sender, "Caller is not commitment owner");
    _;
  }

  modifier pendingCommitment(uint256 _commitmentIndex) {
    Commitment storage commitment = commitments[_commitmentIndex];
    require(!commitment.voided, "Commitment is already voided");
    require(!commitment.committed, "Commitment is already committed");
    _;
  }

  // == Public write functions ==

  function escrow(
    IERC20 _currency,
    uint256 _amount,
    uint256 _chainId,
    address _target,
    uint256 _value,
    bytes memory _data,
    address _onBehalfOf
  ) external {
    _currency.safeTransferFrom(msg.sender, address(this), _amount);
    uint256 currentTime = block.timestamp;
    commitments[nextCommitmentIndex] = Commitment(
      nextCommitmentIndex,
      _onBehalfOf,
      _currency,
      _amount,
      currentTime,
      _chainId,
      _target,
      _value,
      _data,
      false,
      false
    );
    emit Escrowed(nextCommitmentIndex++, currentTime);
  }

  function void(uint256 _commitmentIndex)
    external
    onlyCommitmentOwner(_commitmentIndex)
    pendingCommitment(_commitmentIndex)
  {
    Commitment storage commitment = commitments[_commitmentIndex];
    require(
      block.timestamp > commitment.timestamp + voidDelay,
      "User is not allowed to void commitment yet"
    );
    commitment.currency.safeTransfer(commitment.owner, commitment.amount);
    commitments[_commitmentIndex].voided = true;
    emit Voided(_commitmentIndex);
  }

  // == Operator only write functions ==

  function commit(uint256 _commitmentIndex)
    external
    onlyOperator
    pendingCommitment(_commitmentIndex)
  {
    Commitment storage commitment = commitments[_commitmentIndex];
    commitment.committed = true;
    withdrawableAmounts[commitment.currency] += commitment.amount;
    emit Committed(_commitmentIndex);
  }

  // == Owner only write functions ==

  function setOperator(address _newOperator) external onlyOwner {
    emit OperatorChanged(operator, _newOperator);
    operator = _newOperator;
  }

  function withdraw(IERC20 _token, address _to) external onlyOwner {
    uint256 amount = withdrawableAmounts[_token];
    withdraw(_token, amount, _to);
  }

  function withdraw(
    IERC20 _token,
    uint256 _amount,
    address _to
  ) public onlyOwner {
    require(
      _amount <= withdrawableAmounts[_token],
      "Cannot withdraw more than is allowed"
    );
    _token.safeTransfer(_to, _amount);
    emit FundsWithdrawn(_token, _amount);
  }
}
