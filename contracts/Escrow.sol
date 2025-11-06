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
    error BidNotFound();
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

    uint256 private _locked = 1;
    modifier nonReentrant() {
      require(_locked == 1, "REENTRANCY");
      _locked = 2;
      _;
      _locked = 1;
    }

    function createProject(uint64 projectId) external {
        if (projects[projectId].exists) revert ProjectExists();

        projects[projectId] = Project({
            client: msg.sender,
            freelancer: address(0),
            status: ProjectStatus.Open,
            vaultBalance: 0,
            exists: true
        });

        emit ProjectCreated(projectId, msg.sender);
    }

    function placeBid(uint64 projectId, uint256 amountWei) external {
        Project storage project = projects[projectId];
        if (!project.exists) revert ProjectNotFound();
        if (project.status != ProjectStatus.Open) revert InvalidStatus();
        if (amountWei == 0) revert ZeroAmount();
      
        Bid storage bid = bids[projectId][msg.sender]
        bid.amountWei = amountWei;
        bid.exists = true;

        emit BidPlaced(projectId, msg.sender, amountWei);
    }

    function acceptBid(uint64 projectId, address bidder) external {
        Project storage project = projects[projectId];
        if (!project.exists) revert ProjectNotFound();
        if (msg.sender != project.client) revert Unauthorized();
        if (project.status != ProjectStatus.Open) revert InvalidStatus();

        Bid storage bid = bids[projectId][bidder];
        if (!bid.exists) revert BidNotFound();

        project.freelancer = bidder;
        project.status = ProjectStatus.InProgress;

        emit BidAccepted(projectId, bidder);
    }

    function createMilestone(uint64 projectId, uint16 index, uint256 amountWei) external {
        Project storage project = projects[projectId];
        if (!project.exists) revert ProjectNotFound();
        if (msg.sender != project.client) revert Unauthorized();
        if (project.status != ProjectStatus.InProgress) revert InvalidStatus();
        if (amountWei == 0) revert ZeroAmount();

        Milestone storage milestone = milestones[projectId][index];
        if (milestone.exists) revert MilestoneExists();

        milestones[projectId][index] = Milestone({
          amountWei: amountWei,
          fundedWei: 0,
          submitted: false,
          released: false,
          exists: true
        });

        emit MilestoneCreated(projectId, index, amountWei);
    }

    function fundMilestone(uint64 projectId, uint16 index) external payable nonReentrant {
        Project storage project = projects[projectId];
        if (!project.exists) revert ProjectNotFound();
        if (msg.sender != project.client) revert Unauthorized();
        if (project.status != ProjectStatus.InProgress) revert InvalidStatus();
        if (msg.value == 0) revert ZeroAmount();

        Milestone storage milestone = milestones[projectId][index];
        if (!milestone.exists) revert MilestoneNotFound();
        if (milestone.released) revert AlreadyReleased();

        unchecked {
          milestone.fundedWei += msg.value;
          project.vaultBalance += msg.value;
        }

        emit MilestoneFunded(projectId, index, msg.value, milestone.fundedWei);
    }

    function submitMilestone(uint64 projectId, uint16 index) external {
        Project storage project = projects[projectId];
        if (!project.exists) revert ProjectNotFound();
        if (project.freelancer == address(0)) revert NoFreelancer();
        if (msg.sender != project.freelancer) revert Unauthorized();
        if (project.status != ProjectStatus.InProgress) revert InvalidStatus();

        Milestone storage milestone = milestones[projectId][index];
        if (!milestone.exists) revert MilestoneNotFound();
        if (milestone.released) revert AlreadyReleased();

        milestone.submitted = true;
        emit MilestoneSubmitted(projectId, index);
    }

    function releaseMilestone(uint64 projectId, uint16 index) external nonReentrant {
        Project storage project = projects[projectId];
        if (!project.exists) revert ProjectNotFound();
        if (msg.sender != project.client) revert Unauthorized();
        if (project.status != ProjectStatus.InProgress) revert InvalidStatus();

        Milestone storage milestone = milestones[projectId][index];
        if (!milestone.exists) revert MilestoneNotFound();
        if (milestone.released) revert AlreadyReleased();
        if (!milestone.submitted) revert NotSubmitted();

        uint256 amount = milestone.amountWei;
        if (amount == 0) revert NothingToRelease();

        require(milestone.fundedWei >= amount, "Insufficient milestone funds");

        milestone.released = true;

        unchecked {
            milestone.fundedWei -= amount;
            project.vaultBalance -= amount;
        }

        _pay(project.freelancer, amount);
        emit MilestoneReleased(projectId, index, amount);
    }

    function closeProject(uint64 projectId) external nonReentrant {
        Project storage project = projects[projectId];
        if (!project.exists) revert ProjectNotFound();
        if (msg.sender != project.client) revert Unauthorized();
        if (project.status == ProjectStatus.Closed) revert InvalidStatus();

        uint256 refund = project.vaultBalance;
        project.vaultBalance = 0;
        project.status = ProjectStatus.Closed;

        if (refund > 0) {
            _pay(project.client, refund);
        }

        emit ProjectClosed(projectId, refund);
    }

    function _pay(address to, uint256 amount) internal {
        (bool ok, ) = payable(to).call{value: amount}("");
        require(ok, "ETH_TRANSFER_FAILED");
    }

    receive() external payable {
        revert("DIRECT_ETH_DISABLED")
    }
    
    fallback() external payable {
        revert("DIRECT_ETH_DISABLED")
    }
}
