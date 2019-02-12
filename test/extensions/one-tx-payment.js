/* globals artifacts */

import chai from "chai";
import bnChai from "bn-chai";

import { INITIAL_FUNDING, ZERO_ADDRESS } from "../../helpers/constants";
import { checkErrorRevert } from "../../helpers/test-helper";
import { setupColonyNetwork, setupMetaColonyWithLockedCLNYToken, setupRandomColony, fundColonyWithTokens } from "../../helpers/test-data-generator";

const { expect } = chai;
chai.use(bnChai(web3.utils.BN));

const OneTxPayment = artifacts.require("OneTxPayment");
const IReputationMiningCycle = artifacts.require("IReputationMiningCycle");

contract("One transaction payments", accounts => {
  let colony;
  let token;
  let colonyNetwork;
  let oneTxExtension;
  let globalSkillId;

  before(async () => {
    colonyNetwork = await setupColonyNetwork();
    await setupMetaColonyWithLockedCLNYToken(colonyNetwork);
    await colonyNetwork.initialiseReputationMining();
    await colonyNetwork.startNextCycle();
    oneTxExtension = await OneTxPayment.new();
    globalSkillId = await colonyNetwork.getRootGlobalSkillId();
  });

  beforeEach(async () => {
    ({ colony, token } = await setupRandomColony(colonyNetwork));

    // Give oneTxExtension admin rights
    await colony.setAdminRole(oneTxExtension.address);
  });

  describe("Under normal conditions", () => {
    it("should allow a single transaction payment of tokens to occur", async () => {
      const inactiveReputationMiningCycleAddress = await colonyNetwork.getReputationMiningCycle(false);
      const inactiveReputationMiningCycle = await IReputationMiningCycle.at(inactiveReputationMiningCycleAddress);
      const lengthBefore = await inactiveReputationMiningCycle.getReputationUpdateLogLength();
      const balanceBefore = await token.balanceOf(accounts[4]);
      expect(balanceBefore).to.eq.BN(0);
      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);
      // This is the one transactions. Those ones above don't count...
      await oneTxExtension.makePayment(colony.address, accounts[4], token.address, 10, 1, globalSkillId);
      // Check it completed
      const balanceAfter = await token.balanceOf(accounts[4]);
      expect(balanceAfter).to.eq.BN(9);
      // This should have added entries to the reputation log
      const lengthAfter = await inactiveReputationMiningCycle.getReputationUpdateLogLength();
      expect(lengthAfter.sub(lengthBefore)).to.eq.BN(2);
    });

    it("should allow a single transaction payment of ETH to occur", async () => {
      const inactiveReputationMiningCycleAddress = await colonyNetwork.getReputationMiningCycle(false);
      const inactiveReputationMiningCycle = await IReputationMiningCycle.at(inactiveReputationMiningCycleAddress);
      const lengthBefore = await inactiveReputationMiningCycle.getReputationUpdateLogLength();
      const balanceBefore = await web3.eth.getBalance(accounts[4]);
      await colony.send(10); // NB 10 wei, not ten ether!
      await colony.claimColonyFunds(ZERO_ADDRESS);
      // This is the one transactions. Those ones above don't count...
      await oneTxExtension.makePayment(colony.address, accounts[4], ZERO_ADDRESS, 10, 1, globalSkillId);
      // Check it completed
      const balanceAfter = await web3.eth.getBalance(accounts[4]);
      // So only 9 here, because of the same rounding errors as applied to the token
      expect(new web3.utils.BN(balanceAfter).sub(new web3.utils.BN(balanceBefore))).to.eq.BN(9);
      // This should not have added entries to the reputation log
      const lengthAfter = await inactiveReputationMiningCycle.getReputationUpdateLogLength();
      expect(lengthAfter).to.eq.BN(lengthBefore);
    });

    it("should not allow a non-admin to make a single-transaction payment", async () => {
      await checkErrorRevert(
        oneTxExtension.makePayment(colony.address, accounts[4], token.address, 10, 1, globalSkillId, { from: accounts[4] }),
        "colony-one-tx-payment-not-authorized"
      );
    });

    it("should not allow an admin to specify a non-global skill", async () => {
      await checkErrorRevert(oneTxExtension.makePayment(colony.address, accounts[4], token.address, 10, 1, 3), "colony-not-global-skill");
    });

    it("should not allow an admin to specify a non-existent domain", async () => {
      await checkErrorRevert(
        oneTxExtension.makePayment(colony.address, accounts[4], token.address, 10, 99, globalSkillId),
        "colony-domain-does-not-exist"
      );
    });

    it("should not allow an admin to specify a non-existent skill", async () => {
      await checkErrorRevert(oneTxExtension.makePayment(colony.address, accounts[4], token.address, 10, 1, 99), "colony-skill-does-not-exist");
    });

    it("should not allow an admin to call makePayment on the colony directly", async () => {
      await checkErrorRevert(colony.makePayment(accounts[4], token.address, 10, 1, globalSkillId), "colony-do-not-call-function-directly");
    });
  });
});
