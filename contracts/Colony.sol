pragma solidity ^0.4.0;

import "Modifiable.sol";
import "IRootColonyResolver.sol";
import "TokenLibrary.sol";
import "Ownable.sol";
import "ColonyPaymentProvider.sol";
import "TaskLibrary.sol";
import "SecurityLibrary.sol";
import "VotingLibrary.sol";


contract Colony is Modifiable {

  modifier onlyRootColony(){
    if(msg.sender != IRootColonyResolver(rootColonyResolver).rootColonyAddress()) { throw; }
    _;
  }

  modifier onlyAdminOrOwner {
    if (!(this.userIsInRole(msg.sender, 0) || this.userIsInRole(msg.sender, 1))) { throw; }
    _;
  }

  modifier onlyColonyOwners {
    if (!this.userIsInRole(msg.sender, 0)) { throw; }
    _;
  }

  IRootColonyResolver public rootColonyResolver;

  // Link libraries containing business logic to EternalStorage
  using TaskLibrary for address;
  using SecurityLibrary for address;
  using TokenLibrary for address;
  using VotingLibrary for address;

  address public eternalStorage;

  function Colony(address rootColonyResolverAddress_, address _eternalStorage)
  payable
  {
    rootColonyResolver = IRootColonyResolver(rootColonyResolverAddress_);
    eternalStorage = _eternalStorage;
  }

  /// @notice returns the number of users in a given role for this colony
  function countUsersInRole(uint _role)
  constant returns(uint256)
  {
    return eternalStorage.countUsersInRole(_role);
  }

  /// @notice returns user info based in a given address
  /// @param _user the address to be verified
  /// @param _role the role to be verified
  /// @return a boolean value indicating if the user is in this role or not
  function userIsInRole(address _user, uint _role)
  constant returns (bool)
  {
    return eternalStorage.userIsInRole(_user, _role);
  }

  /// @notice adds a new user to a given role in this colony
  /// @param _user the address of the user
  /// @param _role the user role
  function addUserToRole(address _user, uint _role)
  onlyAdminOrOwner
  {
    eternalStorage.addUserToRole(_user, _role);
  }

  /// @notice removes an admin from the colony
  /// @param _user the address of the owner to be removed
  /// @param _role the role of the user to be removed
  function removeUserFromRole(address _user, uint _role)
  onlyAdminOrOwner
  {
    eternalStorage.removeUserFromRole(_user, _role);
  }

  /// @notice gets the reserved colony tokens for funding tasks
  /// This is to understand the amount of 'unavailable' tokens due to them been promised to be paid once a task completes.
  /// @return a uint value indicating if the amount of reserved colony tokens
  function reservedTokensWei()
  constant returns (uint256)
  {
    return eternalStorage.getReservedTokensWei();
  }

  /// @notice contribute ETH to a task
  /// @param taskId the task ID
  function contributeEthToTask(uint256 taskId)
  onlyAdminOrOwner
  payable
  {
    eternalStorage.contributeEthToTask(taskId, msg.value);
  }

  /// @notice contribute tokens from an admin to fund a task
  /// @param taskId the task ID
  /// @param tokensWei the amount of tokens wei to fund the task
  function contributeTokensWeiToTask(uint256 taskId, uint256 tokensWei)
  onlyAdminOrOwner
  {
    var isAddressLocked = eternalStorage.isAddressLocked(msg.sender);
    // When a user funds a task, the actually is a transfer of tokens ocurring from their address to the colony's one.
    if (eternalStorage.transfer(this, tokensWei, isAddressLocked)) {
      eternalStorage.contributeTokensWeiToTask(taskId, tokensWei, false);
    } else {
      throw;
    }
  }

  /// @notice contribute tokens from the colony pool to fund a task
  /// @param taskId the task ID
  /// @param tokensWei the amount of tokens wei to fund the task
  function contributeTokensWeiFromPool(uint256 taskId, uint256 tokensWei)
  onlyAdminOrOwner
  {
    // When tasks are funded from the pool of unassigned tokens,
    // no transfer takes place - we just mark them as assigned.
    var reservedTokensWei = eternalStorage.getReservedTokensWei();
    if ((reservedTokensWei + tokensWei) <= eternalStorage.balanceOf(this)) {
      eternalStorage.contributeTokensWeiToTask(taskId, tokensWei, true);
    } else {
      throw;
    }
  }

  function getTaskCount()
  constant returns (uint256)
  {
    return eternalStorage.getTaskCount();
  }

  /// @notice this function adds a task to the task DB.
  /// @param _name the task name
  /// @param _summary an IPFS hash
  function makeTask(
    string _name,
    string _summary
  )
  onlyAdminOrOwner
  throwIfIsEmptyString(_name)
  {
      eternalStorage.makeTask(_name, _summary);
  }

  /// @notice this function updates the 'accepted' flag in the task
  /// @param _id the task id
  function acceptTask(uint256 _id)
  onlyAdminOrOwner
  {
    eternalStorage.acceptTask(_id);
  }

  /// @notice this function is used to update task data.
  /// @param _id the task id
  /// @param _name the task name
  /// @param _summary an IPFS hash
  function updateTask(
    uint256 _id,
    string _name,
    string _summary
  )
  onlyAdminOrOwner
  throwIfIsEmptyString(_name)
  {
    eternalStorage.updateTask(_id, _name, _summary);
  }

  /// @notice set the colony tokens symbol
  /// @param symbol_ the symbol of the colony tokens
  function setTokensSymbol(bytes symbol_)
  onlyAdminOrOwner
  {
    eternalStorage.setTokensSymbol(symbol_);
  }

  /// @notice set the colony tokens title
  /// @param title_ the title of the colony tokens
  function setTokensTitle(bytes title_)
  onlyAdminOrOwner
  {
    eternalStorage.setTokensTitle(title_);
  }

  /// @notice mark a task as completed, pay the user who completed it and root colony fee
  /// @param taskId the task ID to be completed and paid
  /// @param paymentAddress the address of the user to be paid
  function completeAndPayTask(uint256 taskId, address paymentAddress)
  onlyAdminOrOwner
  {
    var (taskEth, taskTokens) = eternalStorage.getTaskBalance(taskId);
    // Check token balance is sufficient to pay the worker
    if (eternalStorage.balanceOf(this) < taskTokens) { return; }

    eternalStorage.acceptTask(taskId);

    if (taskEth > 0) {
      if (!paymentAddress.send(taskEth)) {
        throw;
      }
    }

    if (taskTokens > 0) {
      var isRecipientAddressLocked = eternalStorage.isAddressLocked(paymentAddress);
      if (eternalStorage.transferFromColony(paymentAddress, taskTokens, isRecipientAddressLocked)) {
        eternalStorage.removeReservedTokensWeiForTask(taskId);
      } else {
        throw;
      }
    }
  }

  function transfer(address _to, uint256 _value)
  returns (bool)
  {
    if(eternalStorage.isAddressLocked(msg.sender)) {
      return false;
    }

    var isRecipientAddressLocked = eternalStorage.isAddressLocked(_to);
    return eternalStorage.transfer(_to, _value, isRecipientAddressLocked);
  }

   function transferFrom(address _from, address _to, uint256 _value)
   returns (bool)
   {
     if(eternalStorage.isAddressLocked(_from)) { return false; }

     var isRecipientAddressLocked = eternalStorage.isAddressLocked(_to);
     return eternalStorage.transferFrom(_from, _to, _value, isRecipientAddressLocked);
   }

   function balanceOf(address _account)
   constant returns (uint256 balance)
   {
     return eternalStorage.balanceOf(_account);
   }

   function allowance(address _owner, address _spender)
   constant returns (uint256)
   {
     return eternalStorage.allowance(_owner, _spender);
   }

   function approve(address _spender, uint256 _value)
   returns (bool)
   {
     return eternalStorage.approve(_spender, _value);
   }

  /// @notice this function is used to generate Colony tokens
  /// @param _tokensWei The amount of tokens wei to be generated
  function generateTokensWei(uint256 _tokensWei)
  onlyAdminOrOwner
  {
    eternalStorage.generateTokensWei(_tokensWei);
  }

  function totalSupply()
  onlyAdminOrOwner
  constant returns (uint256)
  {
    return eternalStorage.totalSupply();
  }

  /// @notice upgrade the colony migrating its data to another colony instance
  /// @param newColonyAddress_ the address of the new colony instance
  function upgrade(address newColonyAddress_)
  onlyRootColony
  {
    var tokensBalance = eternalStorage.balanceOf(this);
    if(tokensBalance > 0 && !eternalStorage.transferFromColony(newColonyAddress_, tokensBalance, false)) {
      throw;
    }

    Ownable(eternalStorage).changeOwner(newColonyAddress_);
    selfdestruct(newColonyAddress_);
  }

  function createPoll(string description)
  onlyAdminOrOwner
  returns (bool)
  {
    return eternalStorage.createPoll(description);
  }

  function addPollOption(uint256 pollId, string pollOptionDescription)
  onlyAdminOrOwner
  returns (bool)
  {
    return eternalStorage.addPollOption(pollId, pollOptionDescription);
  }

  function openPoll(uint256 pollId, uint256 pollDuration)
  onlyAdminOrOwner
  returns (bool)
  {
    return eternalStorage.openPoll(pollId, pollDuration);
  }

  function resolvePoll(uint256 pollId)
  onlyAdminOrOwner
  returns (bool)
  {
    return eternalStorage.resolvePoll(pollId);
  }

  function submitVote(uint256 pollId, bytes32 secret, uint256 prevTimestamp, uint256 prevPollId)
  returns (bool)
  {
    return eternalStorage.submitVote(pollId, secret, prevTimestamp, prevPollId);
  }

  function revealVote(uint256 pollId, uint256 idx,  bytes32 salt)
  returns (bool)
  {
    uint256 voteWeight = eternalStorage.balanceOf(msg.sender);
    bool revealVote = eternalStorage.revealVote(pollId, idx, salt, voteWeight);
    if (revealVote && !eternalStorage.isAddressLocked(msg.sender)) {
      // Release 'on hold' tokens, if there are no more locks
      eternalStorage.releaseTokens(msg.sender);
    }

    return revealVote;
  }

  function ()
  payable
  {
      // Contracts that want to receive Ether with a plain "send" have to implement
      // a fallback function with the payable modifier. Contracts now throw if no payable
      // fallback function is defined and no function matches the signature.
  }
}
