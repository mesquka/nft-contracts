import { task } from 'hardhat/config';

task('deploy', 'Deploys to chain')
  .addParam('name', 'Name of Rail ERC20 governance token')
  .addParam('symbol', 'Symbol of Rail ERC20 governance token')
  .setAction(async function ({ name, symbol }: { name: string; symbol: string }, hre) {
    const { ethers } = hre;
    const NFTMultiClaim = await ethers.getContractFactory('NFTMultiClaim');
    const nftMultiClaim = await NFTMultiClaim.deploy(name, symbol);

    console.log(`Deployed to ${nftMultiClaim.address}`);
  });

async function main() {}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
