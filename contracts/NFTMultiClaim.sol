// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

// OpenZeppelin v4
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { MerkleProof } from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

import { ERC721A } from "erc721a/contracts/ERC721A.sol";

contract NFTMultiClaim is ERC721A, Ownable {
  /* CLAIM STORAGE */

  // Should be double hashed when constructing tree as per https://github.com/OpenZeppelin/merkle-tree
  struct Leaf {
    address claimer;
    uint256 balance;
  }

  struct ClaimBatch {
    bytes32 root;
    bool active;
  }

  // Merkle roots of claim batches
  ClaimBatch[] public claimBatches;

  // Consumed claims
  // Claim batch index => leaf hash => claimed
  // We are assuming that all claims for a single address will be merged into a single leaf
  // ensuring that the 'claimer' field is always unique preventing duplicate leaf hashes
  // Duplicate leaf hashes can still occur across different batches
  mapping(uint256 => mapping(bytes32 => bool)) private claimed;

  /* CLAIM EVENTS */

  event NewBatch(bytes32 root, uint256 index);
  event BatchStatusChange(uint256 index, bool active);
  event Claim(uint256 index, bytes32 leaf, address to, uint256 amount);

  /* CONSTRUCTOR */

  constructor(string memory _name, string memory _symbol) ERC721A(_name, _symbol) {}

  /* CLAIM FUNCTIONS */

  function hashLeaf(Leaf calldata _leaf) public pure returns (bytes32) {
    // Compute leaf hash, double hashed as per https://github.com/OpenZeppelin/merkle-tree
    return keccak256(abi.encode(keccak256(abi.encode(_leaf))));
  }

  /**
   * @notice Checks if a leaf hash is already claimed
   * @param _batchIndex - batch index the
   * @param _leafHash - leaf hash to check
   * @return claimed
   */
  function isClaimed(uint256 _batchIndex, bytes32 _leafHash) public view returns (bool) {
    return claimed[_batchIndex][_leafHash];
  }

  /**
   * @notice Verifies claim validity
   * @param _leafHash - Leaf hash
   * @param _proof - Merkle proof
   * @param _batchIndex - Index of claimable batch
   * @return valid - claim validity
   */
  function verifyClaim(
    bytes32 _leafHash,
    bytes32[] calldata _proof,
    uint256 _batchIndex
  ) public view returns (bool) {
    // If leaf is already marked as claimed, return false
    if (isClaimed(_batchIndex, _leafHash)) return false;

    // If batch is not active return false
    if (!claimBatches[_batchIndex].active) return false;

    // Return result of merkle proof verification
    return MerkleProof.verifyCalldata(_proof, claimBatches[_batchIndex].root, _leafHash);
  }

  /**
   * @notice claims NFTs
   * @param _leaf - Leaf to claim
   * @param _proof - Merkle Proof
   * @param _batchIndex - index of batch claim belongs to
   */
  function claim(Leaf calldata _leaf, bytes32[] calldata _proof, uint256 _batchIndex) external {
    bytes32 leafHash = hashLeaf(_leaf);

    // Verify claim
    require(verifyClaim(leafHash, _proof, _batchIndex), "NFTMultiClaim: Invalid Claim");

    // Mark claim as consumed
    claimed[_batchIndex][leafHash] = true;

    // Mint NFTs
    // Since we're determining minting addresses ahead of time when constructing the merkle tree
    // We assume that contracts addresses are filtered out OR ensured they don't lock NFTs
    ERC721A._mint(_leaf.claimer, _leaf.balance);

    // Emit event
    emit Claim(_batchIndex, leafHash, _leaf.claimer, _leaf.balance);
  }

  /* ADMIN FUNCTIONS */

  /**
   * @notice Add new batch of claims
   * @param _root - Merkle Root of batch
   * @return index - Batch index
   */
  function addClaimBatch(bytes32 _root) public onlyOwner returns (uint256) {
    // Fetch index of new batch
    uint256 index = claimBatches.length;

    // Push batch to array
    claimBatches.push(ClaimBatch({ root: _root, active: false }));

    // Emit event
    emit NewBatch(_root, index);

    // Return index of new batch
    return index;
  }

  /**
   * @notice Set batch active status
   * @param _batchIndex - Index of batch
   * @param _active - Status to set
   */
  function setActiveStatus(uint256 _batchIndex, bool _active) public onlyOwner {
    // No-op if status will not change
    if (claimBatches[_batchIndex].active != _active) {
      // Set claim status
      claimBatches[_batchIndex].active = _active;

      // Emit event
      emit BatchStatusChange(_batchIndex, _active);
    }
  }
}
