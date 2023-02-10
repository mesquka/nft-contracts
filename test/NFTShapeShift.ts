import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import { ethers } from 'hardhat';

describe('NFT ShapeShift', function () {
  async function deploy() {
    const [owner, otherAccount] = await ethers.getSigners();

    const NFTShapeShift = await ethers.getContractFactory('NFTShapeShiftTestStub');
    const nftShapeShift = await NFTShapeShift.deploy('Test NFT', 'TEST');
    const nftShapeShiftOtherAccount = nftShapeShift.connect(otherAccount);

    return { nftShapeShift, nftShapeShiftOtherAccount };
  }

  describe('Admin Functions', function () {
    it('Should not allow calling from non-owner', async function () {
      const { nftShapeShiftOtherAccount } = await loadFixture(deploy);

      await expect(
        nftShapeShiftOtherAccount.setRailgunAddress(ethers.constants.AddressZero),
      ).to.be.revertedWith('Ownable: caller is not the owner');

      await expect(nftShapeShiftOtherAccount.setBaseURI('abc')).to.be.revertedWith(
        'Ownable: caller is not the owner',
      );
    });

    it('Should change variables', async function () {
      const { nftShapeShift } = await loadFixture(deploy);

      await nftShapeShift.setBaseURI('123');
      expect(await nftShapeShift.baseURI()).to.equal('123');

      await nftShapeShift.setBaseURI('abc');
      expect(await nftShapeShift.baseURI()).to.equal('abc');

      await nftShapeShift.setRailgunAddress('0x1234567890123456789012345678901234567890');
      expect(await nftShapeShift.railgun()).to.equal('0x1234567890123456789012345678901234567890');

      await nftShapeShift.setRailgunAddress(ethers.constants.AddressZero);
      expect(await nftShapeShift.railgun()).to.equal(ethers.constants.AddressZero);
    });
  });

  describe('Shapeshifting', function () {
    it('Should change URI based on owner', async function () {
      const { nftShapeShift, nftShapeShiftOtherAccount } = await loadFixture(deploy);

      await nftShapeShift.setRailgunAddress(await nftShapeShiftOtherAccount.signer.getAddress());
      await nftShapeShift.setBaseURI('ipfs://123');
      await nftShapeShift.mint();

      expect(await nftShapeShift.tokenURI(0)).to.equal('ipfs://123/normal/0');

      await nftShapeShift.transferFrom(
        await nftShapeShift.signer.getAddress(),
        await nftShapeShiftOtherAccount.signer.getAddress(),
        0,
      );

      expect(await nftShapeShift.tokenURI(0)).to.equal('ipfs://123/special/0');
    });
  });
});
