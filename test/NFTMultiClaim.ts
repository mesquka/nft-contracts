import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import { ethers } from 'hardhat';

import { StandardMerkleTree } from '@openzeppelin/merkle-tree';

function arrayifyLeaf(leaf: { claimer: string; balance: number }) {
  return [leaf.claimer, leaf.balance];
}

function hashLeaf(leaf: { claimer: string; balance: number }) {
  return ethers.utils.keccak256(
    ethers.utils.keccak256(
      ethers.utils.defaultAbiCoder.encode(['address', 'uint256'], arrayifyLeaf(leaf)),
    ),
  );
}

function buildTree(leaves: { claimer: string; balance: number }[]) {
  const leavesArrayified = leaves.map(arrayifyLeaf);
  return StandardMerkleTree.of(leavesArrayified, ['address', 'uint256']);
}

describe('NFT Multi Claim', function () {
  async function deploy() {
    const [owner, otherAccount] = await ethers.getSigners();

    const NFTMultiClaim = await ethers.getContractFactory('NFTMultiClaim');
    const nftMultiClaim = await NFTMultiClaim.deploy('Test NFT', 'TEST');
    const nftMultiClaimOtherAccount = nftMultiClaim.connect(otherAccount);

    return { nftMultiClaim, nftMultiClaimOtherAccount };
  }

  describe('Admin Functions', function () {
    it('Should not allow calling from non-owner', async function () {
      const { nftMultiClaimOtherAccount } = await loadFixture(deploy);

      await expect(
        nftMultiClaimOtherAccount.addClaimBatch(ethers.constants.HashZero),
      ).to.be.revertedWith('Ownable: caller is not the owner');

      await expect(nftMultiClaimOtherAccount.setActiveStatus(1, false)).to.be.revertedWith(
        'Ownable: caller is not the owner',
      );
    });

    it('Should set new batches', async function () {
      const { nftMultiClaim } = await loadFixture(deploy);

      await expect(nftMultiClaim.addClaimBatch(ethers.utils.keccak256(ethers.constants.HashZero)))
        .to.emit(nftMultiClaim, 'NewBatch')
        .withArgs(ethers.utils.keccak256(ethers.constants.HashZero), 0);

      await expect(nftMultiClaim.addClaimBatch(ethers.utils.keccak256(ethers.constants.HashZero)))
        .to.emit(nftMultiClaim, 'NewBatch')
        .withArgs(ethers.utils.keccak256(ethers.constants.HashZero), 1);

      const batch = await nftMultiClaim.claimBatches(1);
      expect(batch.root).to.equal(ethers.utils.keccak256(ethers.constants.HashZero));
      expect(batch.active).to.equal(false);
    });

    it('Should set batch status', async function () {
      const { nftMultiClaim } = await loadFixture(deploy);

      await nftMultiClaim.addClaimBatch(ethers.utils.keccak256(ethers.constants.HashZero));

      let batch = await nftMultiClaim.claimBatches(0);
      expect(batch.root).to.equal(ethers.utils.keccak256(ethers.constants.HashZero));
      expect(batch.active).to.equal(false);

      await expect(nftMultiClaim.setActiveStatus(0, true))
        .to.emit(nftMultiClaim, 'BatchStatusChange')
        .withArgs(0, true);
      await expect(nftMultiClaim.setActiveStatus(0, true)).to.not.emit(
        nftMultiClaim,
        'BatchStatusChange',
      );

      batch = await nftMultiClaim.claimBatches(0);
      expect(batch.root).to.equal(ethers.utils.keccak256(ethers.constants.HashZero));
      expect(batch.active).to.equal(true);

      await expect(nftMultiClaim.setActiveStatus(0, false))
        .to.emit(nftMultiClaim, 'BatchStatusChange')
        .withArgs(0, false);
      await expect(nftMultiClaim.setActiveStatus(0, false)).to.not.emit(
        nftMultiClaim,
        'BatchStatusChange',
      );

      batch = await nftMultiClaim.claimBatches(0);
      expect(batch.root).to.equal(ethers.utils.keccak256(ethers.constants.HashZero));
      expect(batch.active).to.equal(false);
    });
  });

  describe('Claim functions', function () {
    it('Should hash leaf', async function () {
      const { nftMultiClaim } = await loadFixture(deploy);

      const signers = await ethers.getSigners();

      const leaves = signers.map((signer, i) => ({
        claimer: signer.address,
        balance: i,
      }));

      for (const leaf of leaves) {
        expect(await nftMultiClaim.hashLeaf(leaf)).to.equal(hashLeaf(leaf));
      }
    });

    it('Should claim', async function () {
      const { nftMultiClaim } = await loadFixture(deploy);

      // Create tree
      const signers = await ethers.getSigners();

      const leaves = signers.map((signer, i) => ({
        claimer: signer.address,
        balance: i,
      }));

      const tree = buildTree(leaves);

      // Set tree as batch
      await nftMultiClaim.addClaimBatch(tree.root);
      await nftMultiClaim.setActiveStatus(0, true);

      // Claim each leaf
      for (const leaf of leaves) {
        // Skip 0 balance claim
        if (leaf.balance == 0) continue;

        // Leaf shouldn't be marked as claimed initially
        expect(await nftMultiClaim.isClaimed(0, hashLeaf(leaf))).to.equal(false);

        // Claim and check event
        await expect(nftMultiClaim.claim(leaf, tree.getProof(arrayifyLeaf(leaf)), 0))
          .to.emit(nftMultiClaim, 'Claim')
          .withArgs(0, hashLeaf(leaf), leaf.claimer, leaf.balance);

        // Double claiming should fail
        await expect(
          nftMultiClaim.claim(leaf, tree.getProof(arrayifyLeaf(leaf)), 0),
        ).to.be.revertedWith('NFTMultiClaim: Invalid Claim');

        // Leaf should be marked as claimed
        expect(await nftMultiClaim.isClaimed(0, hashLeaf(leaf))).to.equal(true);

        // Address should have NFT balance
        expect(await nftMultiClaim.balanceOf(leaf.claimer)).to.equal(leaf.balance);
      }
    });

    it("Shouldn't claim non-active batches", async function () {
      const { nftMultiClaim } = await loadFixture(deploy);

      // Create tree
      const signers = await ethers.getSigners();

      const leaves = signers.map((signer, i) => ({
        claimer: signer.address,
        balance: i,
      }));

      const tree = buildTree(leaves);

      // Set tree as batch
      await nftMultiClaim.addClaimBatch(tree.root);

      // Claiming should fail on inactive batch
      await expect(
        nftMultiClaim.claim(leaves[0], tree.getProof(arrayifyLeaf(leaves[0])), 0),
      ).to.be.revertedWith('NFTMultiClaim: Invalid Claim');
    });
  });
});
