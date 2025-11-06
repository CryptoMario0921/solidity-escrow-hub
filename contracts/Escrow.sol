// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

// Uncomment this line to use console.log
// import "hardhat/console.sol";

contract Escrow {
    error Unauthorized();
    error InvalidStatus();
    error NoFreelancer();
    error NotSubmitted();
    error AlreadyReleased();
    error NothingToRelease();
    error MathOverflow();
    error MismatchedProject();
    error BidNotExist();
    error MilestoneExists();
    error MilestoneNotFound();
    error ZeroAmount();
    error ProjectExists();
    error ProjectNotFound();

    event ProjectCreated(uint64 indexed projectId, address indexed client);
    event BidPlaced(
        uint64 indexed projectId,
        address indexed bidder,
        uint256 amountWei
    );
    event BidAccepted(uint64 indexed projectId, address indexed bidder);
    event MilestoneCreated(
        uint64 indexed projectId,
        uint16 indexed index,
        uint256 amountWei
    );
    event MilestoneFunded(
        uint64 indexed projectId,
        uint16 indexed index,
        uint256 fundedWei,
        uint256 totalFundedWei
    );
    event MilestoneSubmitted(uint64 indexed projectId, uint16 indexed index);
    event MilestoneReleased(
        uint64 indexed projectId,
        uint16 indexed index,
        uint256 amountWei
    );
    event ProjectClosed(uint64 indexed projectId, uint256 refundedWei);

    enum ProjectStatus {
        Open,
        InProgress,
        Closed
    }

    struct Project {
        address client;
        address freelancer;
        ProjectStatus status;
        uint256 vaultBalance;
        bool exists;
    }

    struct Bid {
        uint256 amountWei;
        bool exists;
    }

    struct Milestone {
        uint256 amountWei;
        uint256 fundedWei;
        bool submitted;
        bool released;
        bool exists;
    }

    mapping(uint64 => Project) public projects;
    mapping(uint64 => mapping(address => Bid)) public bids;
    mapping(uint64 => mapping(uint16 => Milestone)) public milestones;
}
