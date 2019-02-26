/* global artifacts */
import chai from "chai";
import bnChai from "bn-chai";
import { BN } from "bn.js";

import { WAD, ZERO_ADDRESS } from "../helpers/constants";
import { checkErrorRevert, getTokenArgs } from "../helpers/test-helper";
import { fundColonyWithTokens, setupRandomColony } from "../helpers/test-data-generator";

const { expect } = chai;
chai.use(bnChai(web3.utils.BN));

const EtherRouter = artifacts.require("EtherRouter");
const IColonyNetwork = artifacts.require("IColonyNetwork");
const DSToken = artifacts.require("DSToken");

contract("Colony Payment", accounts => {
  const RECIPIENT = accounts[3];
  const COLONY_ADMIN = accounts[4];

  let colony;
  let token;
  let otherToken;
  let colonyNetwork;

  before(async () => {
    const etherRouter = await EtherRouter.deployed();
    colonyNetwork = await IColonyNetwork.at(etherRouter.address);

    ({ colony, token } = await setupRandomColony(colonyNetwork));
    await colony.setRewardInverse(100);
    await colony.setAdminRole(COLONY_ADMIN);
    await fundColonyWithTokens(colony, token, WAD.muln(20));

    const tokenArgs = getTokenArgs();
    otherToken = await DSToken.new(tokenArgs[1]);
  });

  describe("when adding payments", () => {
    it("should allow admins to add payment", async () => {
      const paymentsCountBefore = await colony.getPaymentCount();
      await colony.addPayment(RECIPIENT, token.address, WAD, 1, 0, { from: COLONY_ADMIN });

      const paymentsCountAfter = await colony.getPaymentCount();
      expect(paymentsCountAfter.sub(paymentsCountBefore)).to.eq.BN(1);

      const fundingPotId = await colony.getFundingPotCount();
      const payment = await colony.getPayment(paymentsCountAfter);

      expect(payment.recipient).to.equal(RECIPIENT);
      expect(payment.fundingPotId).to.eq.BN(fundingPotId);
      expect(payment.domainId).to.eq.BN(1);

      const fundingPot = await colony.getFundingPot(fundingPotId);
      expect(fundingPot.associatedType).to.eq.BN(3); // 3 = FundingPotAssociatedType.Payment
      expect(fundingPot.associatedTypeId).to.eq.BN(paymentsCountAfter);
      expect(fundingPot.payoutsWeCannotMake).to.eq.BN(1);

      const payout = await colony.getFundingPotPayout(fundingPotId, token.address);
      expect(payout).to.eq.BN(WAD);
    });

    it("should not allow admins to add payment with no domain set", async () => {
      await checkErrorRevert(colony.addPayment(RECIPIENT, token.address, WAD, 0, 0, { from: COLONY_ADMIN }), "colony-domain-does-not-exist");
    });

    it("should not allow admins to add payment with no recipient set", async () => {
      await checkErrorRevert(colony.addPayment(ZERO_ADDRESS, token.address, WAD, 1, 0, { from: COLONY_ADMIN }), "colony-payment-invalid-recipient");
    });

    it("should not allow admins to add payment with zero token amount set", async () => {
      await checkErrorRevert(colony.addPayment(RECIPIENT, token.address, 0, 1, 0, { from: COLONY_ADMIN }), "colony-payment-invalid-amount");
    });

    it("should not allow non-admins to add payment", async () => {
      await checkErrorRevert(colony.addPayment(RECIPIENT, token.address, WAD, 1, 0, { from: accounts[10] }), "ds-auth-unauthorized");
    });
  });

  describe("when updating payments", () => {
    it("should allow admins to update recipient", async () => {
      await colony.addPayment(RECIPIENT, token.address, WAD, 1, 0, { from: COLONY_ADMIN });
      const paymentId = await colony.getPaymentCount();

      await colony.setPaymentRecipient(paymentId, accounts[10], { from: COLONY_ADMIN });
      const payment = await colony.getPayment(paymentId);
      expect(payment.recipient).to.equal(accounts[10]);
    });

    it("should not allow admins to update to empty recipient", async () => {
      await colony.addPayment(RECIPIENT, token.address, WAD, 1, 0, { from: COLONY_ADMIN });
      const paymentId = await colony.getPaymentCount();

      await checkErrorRevert(colony.setPaymentRecipient(paymentId, ZERO_ADDRESS, { from: COLONY_ADMIN }), "colony-payment-invalid-recipient");
    });

    it("should allow admins to update domain", async () => {
      await colony.addDomain(1);
      await colony.addPayment(RECIPIENT, token.address, WAD, 1, 0, { from: COLONY_ADMIN });
      const paymentId = await colony.getPaymentCount();

      let payment = await colony.getPayment(paymentId);
      expect(payment.domainId).to.eq.BN(1);
      await colony.setPaymentDomain(paymentId, 2, { from: COLONY_ADMIN });
      payment = await colony.getPayment(paymentId);
      expect(payment.domainId).to.eq.BN(2);
    });

    it("should not allow admins to update to empty domain", async () => {
      await colony.addPayment(RECIPIENT, token.address, WAD, 1, 0, { from: COLONY_ADMIN });
      const paymentId = await colony.getPaymentCount();

      const { domainId } = await colony.getPayment(paymentId);
      expect(domainId).to.eq.BN(1);
      await checkErrorRevert(colony.setPaymentDomain(paymentId, 10, { from: COLONY_ADMIN }), "colony-domain-does-not-exist");
    });

    it("should allow admins to update skill", async () => {
      await colony.addPayment(RECIPIENT, token.address, WAD, 1, 0, { from: COLONY_ADMIN });
      const paymentId = await colony.getPaymentCount();

      let payment = await colony.getPayment(paymentId);
      expect(payment.skills[0]).to.eq.BN(0);
      await colony.setPaymentSkill(paymentId, 1, { from: COLONY_ADMIN });
      payment = await colony.getPayment(paymentId);
      expect(payment.skills[0]).to.eq.BN(1);
    });

    it("should not allow non-admins to update recipient", async () => {
      await colony.addPayment(RECIPIENT, token.address, WAD, 1, 0, { from: COLONY_ADMIN });
      const paymentId = await colony.getPaymentCount();

      await checkErrorRevert(colony.setPaymentRecipient(paymentId, accounts[7], { from: accounts[10] }), "ds-auth-unauthorized");
    });

    it("should be able to add multiple payouts", async () => {
      await colony.addPayment(RECIPIENT, token.address, WAD, 1, 0, { from: COLONY_ADMIN });
      const paymentId = await colony.getPaymentCount();
      const payment = await colony.getPayment(paymentId);
      await colony.setPayout(payment.fundingPotId, otherToken.address, 100);

      const fundingPotPayoutForToken = await colony.getFundingPotPayout(payment.fundingPotId, token.address);
      const fundingPotPayoutForOtherToken = await colony.getFundingPotPayout(payment.fundingPotId, otherToken.address);
      expect(fundingPotPayoutForToken).to.eq.BN(WAD);
      expect(fundingPotPayoutForOtherToken).to.eq.BN(100);
    });

    it("should allow admins to fund a payment", async () => {
      await colony.addPayment(RECIPIENT, token.address, WAD, 1, 0);
      const paymentId = await colony.getPaymentCount();
      const payment = await colony.getPayment(paymentId);
      const fundingPotPayoutForToken = await colony.getFundingPotPayout(payment.fundingPotId, token.address);
      expect(fundingPotPayoutForToken).to.eq.BN(WAD);

      await fundColonyWithTokens(colony, token, 40);
      await colony.moveFundsBetweenPots(1, payment.fundingPotId, 40, token.address);
      const fundingPotBalanceForToken = await colony.getFundingPotBalance(payment.fundingPotId, token.address);
      expect(fundingPotBalanceForToken).to.eq.BN(40);
    });

    it("should set the payment as finalized when it is fully funded", async () => {
      await colony.addPayment(RECIPIENT, token.address, 40, 1, 0);
      const paymentId = await colony.getPaymentCount();
      let payment = await colony.getPayment(paymentId);
      expect(payment.finalized).to.be.false;

      await fundColonyWithTokens(colony, token, 40);

      await colony.moveFundsBetweenPots(1, payment.fundingPotId, 30, token.address);
      payment = await colony.getPayment(paymentId);
      expect(payment.finalized).to.be.false;

      await colony.moveFundsBetweenPots(1, payment.fundingPotId, 10, token.address);
      payment = await colony.getPayment(paymentId);
      expect(payment.finalized).to.be.true;
    });
  });

  describe("when payment is finalized", () => {
    let paymentId;

    beforeEach(async () => {
      await colony.addPayment(RECIPIENT, token.address, 40, 1, 0);
      paymentId = await colony.getPaymentCount();
      const payment = await colony.getPayment(paymentId);
      await fundColonyWithTokens(colony, token, 40);
      await colony.moveFundsBetweenPots(1, payment.fundingPotId, 40, token.address);
    });

    it("should not allow admins to update recipient", async () => {
      await checkErrorRevert(colony.setPaymentRecipient(paymentId, accounts[6], { from: COLONY_ADMIN }), "colony-payment-finalized");
    });

    it("should not allow admins to update to empty domain", async () => {
      await checkErrorRevert(colony.setPaymentDomain(paymentId, 2, { from: COLONY_ADMIN }), "colony-payment-finalized");
    });

    it("should not allow admins to update skill", async () => {
      await checkErrorRevert(colony.setPaymentSkill(paymentId, 1, { from: COLONY_ADMIN }), "colony-payment-finalized");
    });
  });

  describe("when claiming payments", () => {
    it("should allow recipient to claim their payment and network fee is deducated", async () => {
      await colony.addPayment(RECIPIENT, token.address, WAD, 1, 0);
      const paymentId = await colony.getPaymentCount();
      const payment = await colony.getPayment(paymentId);

      await colony.moveFundsBetweenPots(1, payment.fundingPotId, WAD.add(WAD.divn(10)), token.address);

      const recipientBalanceBefore = await token.balanceOf(RECIPIENT);
      const networkBalanceBefore = await token.balanceOf(colonyNetwork.address);
      await colony.claimPayment(paymentId, token.address, { from: RECIPIENT });

      const recipientBalanceAfter = await token.balanceOf(RECIPIENT);
      const networkBalanceAfter = await token.balanceOf(colonyNetwork.address);
      expect(recipientBalanceAfter.sub(recipientBalanceBefore)).to.eq.BN(new BN("989999999999999999"));
      expect(networkBalanceAfter.sub(networkBalanceBefore)).to.eq.BN(new BN("10000000000000001"));
    });

    it("should allow anyone to claim on behalf of the recipient", async () => {
      await colony.addPayment(RECIPIENT, token.address, WAD, 1, 0);
      const paymentId = await colony.getPaymentCount();
      const payment = await colony.getPayment(paymentId);

      await colony.moveFundsBetweenPots(1, payment.fundingPotId, WAD.add(WAD.divn(10)), token.address);

      const recipientBalanceBefore = await token.balanceOf(RECIPIENT);
      const networkBalanceBefore = await token.balanceOf(colonyNetwork.address);
      await colony.claimPayment(paymentId, token.address, { from: accounts[10] });

      const recipientBalanceAfter = await token.balanceOf(RECIPIENT);
      const networkBalanceAfter = await token.balanceOf(colonyNetwork.address);
      expect(recipientBalanceAfter.sub(recipientBalanceBefore)).to.eq.BN(new BN("989999999999999999"));
      expect(networkBalanceAfter.sub(networkBalanceBefore)).to.eq.BN(new BN("10000000000000001"));
    });

    it("should error when payment is insufficiently funded (i.e. not finalized)", async () => {
      await colony.addPayment(RECIPIENT, token.address, 10000, 1, 0);
      const paymentId = await colony.getPaymentCount();
      const payment = await colony.getPayment(paymentId);

      await colony.moveFundsBetweenPots(1, payment.fundingPotId, 9999, token.address);
      await checkErrorRevert(colony.claimPayment(paymentId, token.address), "colony-payment-not-finalized");
    });
  });
});
