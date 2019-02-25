import chai from "chai";
import bnChai from "bn-chai";

import { SPECIFICATION_HASH, ZERO_ADDRESS } from "../helpers/constants";
import { web3GetStorageAt, checkErrorRevert } from "../helpers/test-helper";
import { setupColonyNetwork, setupMetaColonyWithLockedCLNYToken, setupRandomColony } from "../helpers/test-data-generator";

const { expect } = chai;
chai.use(bnChai(web3.utils.BN));

contract("Colony Recovery", accounts => {
  let colony;
  let colonyNetwork;
  let metaColony;

  before(async () => {
    colonyNetwork = await setupColonyNetwork();
    ({ metaColony } = await setupMetaColonyWithLockedCLNYToken(colonyNetwork));

    await colonyNetwork.initialiseReputationMining();
    await colonyNetwork.startNextCycle();
  });

  beforeEach(async () => {
    ({ colony } = await setupRandomColony(colonyNetwork));
  });

  describe("when using recovery mode", () => {
    it("should be able to check whether we are in recovery mode", async () => {
      const founder = accounts[0];
      await colony.setRecoveryRole(founder);

      let recoveryMode = await colony.isInRecoveryMode();
      expect(recoveryMode).to.be.false;
      await colony.enterRecoveryMode();

      recoveryMode = await colony.isInRecoveryMode();
      expect(recoveryMode).to.be.true;
    });

    it("should be able to add and remove recovery roles when not in recovery", async () => {
      const founder = accounts[0];
      let numRecoveryRoles;

      numRecoveryRoles = await colony.numRecoveryRoles();
      expect(numRecoveryRoles).to.be.zero;

      await colony.setRecoveryRole(founder);
      await colony.setRecoveryRole(accounts[1]);
      await colony.setRecoveryRole(accounts[2]);
      numRecoveryRoles = await colony.numRecoveryRoles();
      expect(numRecoveryRoles).to.eq.BN(3);

      // Can remove recovery roles
      await colony.removeRecoveryRole(accounts[2]);
      numRecoveryRoles = await colony.numRecoveryRoles();
      expect(numRecoveryRoles).to.eq.BN(2);

      // Can't remove twice
      await colony.removeRecoveryRole(accounts[2]);
      numRecoveryRoles = await colony.numRecoveryRoles();
      expect(numRecoveryRoles).to.eq.BN(2);

      // Can remove founder
      await colony.removeRecoveryRole(founder);
      numRecoveryRoles = await colony.numRecoveryRoles();
      expect(numRecoveryRoles).to.eq.BN(1);
    });

    it("should not error when adding recovery roles for existing recovery users", async () => {
      const founder = accounts[0];
      let numRecoveryRoles;

      numRecoveryRoles = await colony.numRecoveryRoles();
      expect(numRecoveryRoles).to.be.zero;

      await colony.setRecoveryRole(founder);
      await colony.setRecoveryRole(accounts[1]);
      numRecoveryRoles = await colony.numRecoveryRoles();
      expect(numRecoveryRoles).to.eq.BN(2);

      // Can add twice
      await colony.setRecoveryRole(founder);
      await colony.setRecoveryRole(accounts[1]);
      numRecoveryRoles = await colony.numRecoveryRoles();
      expect(numRecoveryRoles).to.eq.BN(2);
    });

    it("should not be able to add and remove roles when in recovery", async () => {
      const founder = accounts[0];
      await colony.setRecoveryRole(founder);
      await colony.enterRecoveryMode();
      await checkErrorRevert(colony.setAdminRole(accounts[1]), "colony-in-recovery-mode");
      await checkErrorRevert(colony.removeAdminRole(accounts[1]), "colony-in-recovery-mode");
      await checkErrorRevert(colony.setRecoveryRole(accounts[1]), "colony-in-recovery-mode");
      await checkErrorRevert(colony.removeRecoveryRole(accounts[1]), "colony-in-recovery-mode");
      await checkErrorRevert(colony.setFounderRole(accounts[1]), "colony-in-recovery-mode");
    });

    it("should not be able to call normal functions while in recovery", async () => {
      const founder = accounts[0];
      await colony.setRecoveryRole(founder);
      await colony.enterRecoveryMode();

      await metaColony.setRecoveryRole(founder);
      await metaColony.enterRecoveryMode();

      await checkErrorRevert(colony.initialiseColony(ZERO_ADDRESS, ZERO_ADDRESS), "colony-in-recovery-mode");
      await checkErrorRevert(colony.mintTokens(1000), "colony-in-recovery-mode");
      await checkErrorRevert(metaColony.addGlobalSkill(0), "colony-in-recovery-mode");
      await checkErrorRevert(colony.makeTask(1, 0, SPECIFICATION_HASH, 0, 0, 0), "colony-in-recovery-mode");
    });

    it("should exit recovery mode with sufficient approvals", async () => {
      const founder = accounts[0];
      await colony.setRecoveryRole(founder);
      await colony.setRecoveryRole(accounts[1]);
      await colony.setRecoveryRole(accounts[2]);

      await colony.enterRecoveryMode();
      await colony.setStorageSlotRecovery(5, "0xdeadbeef");

      // 0/3 approve
      await checkErrorRevert(colony.exitRecoveryMode(), "colony-recovery-exit-insufficient-approvals");

      // 1/3 approve
      await colony.approveExitRecovery();
      await checkErrorRevert(colony.exitRecoveryMode(), "colony-recovery-exit-insufficient-approvals");

      // 2/3 approve
      await colony.approveExitRecovery({ from: accounts[1] });
      await colony.exitRecoveryMode();
    });

    it("recovery users can work in recovery mode", async () => {
      const founder = accounts[0];
      await colony.setRecoveryRole(founder);
      await colony.setRecoveryRole(accounts[1]);

      await colony.enterRecoveryMode();
      await colony.setStorageSlotRecovery(5, "0xdeadbeef", { from: accounts[1] });

      // 2/2 approve
      await colony.approveExitRecovery();
      await colony.approveExitRecovery({ from: accounts[1] });
      await colony.exitRecoveryMode({ from: accounts[1] });
    });

    it("users cannot approve twice", async () => {
      const founder = accounts[0];
      await colony.setRecoveryRole(founder);
      await colony.enterRecoveryMode();
      await colony.setStorageSlotRecovery(5, "0xdeadbeef");

      await colony.approveExitRecovery();
      await checkErrorRevert(colony.approveExitRecovery(), "colony-recovery-approval-already-given");
    });

    it("users cannot approve if unauthorized", async () => {
      const founder = accounts[0];
      await colony.setRecoveryRole(founder);
      await colony.enterRecoveryMode();
      await checkErrorRevert(colony.approveExitRecovery({ from: accounts[1] }), "ds-auth-unauthorized");
    });

    it("should allow editing of general variables", async () => {
      const founder = accounts[0];
      await colony.setRecoveryRole(founder);
      await colony.enterRecoveryMode();
      await colony.setStorageSlotRecovery(5, "0xdeadbeef");

      const unprotected = await web3GetStorageAt(colony.address, 5);
      expect(unprotected).to.eq.BN(`0xdeadbeef${"0".repeat(56)}`);
    });

    it("should not allow editing of protected variables", async () => {
      const founder = accounts[0];

      await colony.setRecoveryRole(founder);
      await colony.enterRecoveryMode();
      await checkErrorRevert(colony.setStorageSlotRecovery(0, "0xdeadbeef"), "colony-common-protected-variable");
      await checkErrorRevert(colony.setStorageSlotRecovery(1, "0xdeadbeef"), "colony-common-protected-variable");
      await checkErrorRevert(colony.setStorageSlotRecovery(2, "0xdeadbeef"), "colony-common-protected-variable");
      // '6' is a protected location in Colony, but not ColonyNetwork. We get a different error.
      await checkErrorRevert(colony.setStorageSlotRecovery(6, "0xdeadbeef"), "colony-protected-variable");
    });

    it("should allow upgrade to be called on a colony in and out of recovery mode", async () => {
      const founder = accounts[0];
      // Note that we can't upgrade, because we don't have a new version. But this test is still valid, because we're getting the
      // 'version must be newer' error, not a `colony-not-in-recovery-mode` or `colony-in-recovery-mode` error.
      await checkErrorRevert(colony.upgrade(1), "colony-version-must-be-newer");
      await colony.setRecoveryRole(founder);
      await colony.enterRecoveryMode();
      await checkErrorRevert(colony.upgrade(1), "colony-version-must-be-newer");
    });
  });
});
