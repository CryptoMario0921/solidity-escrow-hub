const {
  loadFixture,
} = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { expect } = require("chai");

describe("Escrow", function () {
  // We define a fixture to reuse the same setup in every test.
  async function deployEscrowFixture() {
    const [client, freelancer, otherAccount] = await ethers.getSigners();

    const Escrow = await ethers.getContractFactory("Escrow");
    const escrow = await Escrow.deploy();

    return { escrow, client, freelancer, otherAccount };
  }

  describe("Project Creation", function () {
    it("Should create a project successfully", async function () {
      const { escrow, client } = await loadFixture(deployEscrowFixture);
      const projectId = 1n;

      await expect(escrow.connect(client).createProject(projectId))
        .to.emit(escrow, "ProjectCreated")
        .withArgs(projectId, client.address);

      const project = await escrow.projects(projectId);
      expect(project.client).to.equal(client.address);
      expect(project.freelancer).to.equal(ethers.ZeroAddress);
      expect(project.status).to.equal(0); // Open
      expect(project.vaultBalance).to.equal(0n);
      expect(project.exists).to.be.true;
    });

    it("Should revert if project already exists", async function () {
      const { escrow, client } = await loadFixture(deployEscrowFixture);
      const projectId = 1n;

      await escrow.connect(client).createProject(projectId);
      await expect(escrow.connect(client).createProject(projectId))
        .to.be.revertedWithCustomError(escrow, "ProjectExists");
    });
  });

  describe("Bidding", function () {
    it("Should allow placing a bid", async function () {
      const { escrow, client, freelancer } = await loadFixture(deployEscrowFixture);
      const projectId = 1n;
      const bidAmount = ethers.parseEther("1.0");

      await escrow.connect(client).createProject(projectId);
      await expect(escrow.connect(freelancer).placeBid(projectId, bidAmount))
        .to.emit(escrow, "BidPlaced")
        .withArgs(projectId, freelancer.address, bidAmount);

      const bid = await escrow.bids(projectId, freelancer.address);
      expect(bid.amountWei).to.equal(bidAmount);
      expect(bid.exists).to.be.true;
    });

    it("Should revert if project doesn't exist", async function () {
      const { escrow, freelancer } = await loadFixture(deployEscrowFixture);
      const projectId = 1n;
      const bidAmount = ethers.parseEther("1.0");

      await expect(escrow.connect(freelancer).placeBid(projectId, bidAmount))
        .to.be.revertedWithCustomError(escrow, "ProjectNotFound");
    });

    it("Should revert if project is not open", async function () {
      const { escrow, client, freelancer } = await loadFixture(deployEscrowFixture);
      const projectId = 1n;
      const bidAmount = ethers.parseEther("1.0");

      await escrow.connect(client).createProject(projectId);
      await escrow.connect(freelancer).placeBid(projectId, bidAmount);
      await escrow.connect(client).acceptBid(projectId, freelancer.address);

      await expect(escrow.connect(freelancer).placeBid(projectId, bidAmount))
        .to.be.revertedWithCustomError(escrow, "InvalidStatus");
    });

    it("Should revert if bid amount is zero", async function () {
      const { escrow, client, freelancer } = await loadFixture(deployEscrowFixture);
      const projectId = 1n;

      await escrow.connect(client).createProject(projectId);
      await expect(escrow.connect(freelancer).placeBid(projectId, 0))
        .to.be.revertedWithCustomError(escrow, "ZeroAmount");
    });
  });

  describe("Accepting Bids", function () {
    it("Should allow client to accept a bid", async function () {
      const { escrow, client, freelancer } = await loadFixture(deployEscrowFixture);
      const projectId = 1n;
      const bidAmount = ethers.parseEther("1.0");

      await escrow.connect(client).createProject(projectId);
      await escrow.connect(freelancer).placeBid(projectId, bidAmount);
      
      await expect(escrow.connect(client).acceptBid(projectId, freelancer.address))
        .to.emit(escrow, "BidAccepted")
        .withArgs(projectId, freelancer.address);

      const project = await escrow.projects(projectId);
      expect(project.freelancer).to.equal(freelancer.address);
      expect(project.status).to.equal(1); // InProgress
    });

    it("Should revert if not called by client", async function () {
      const { escrow, client, freelancer, otherAccount } = await loadFixture(deployEscrowFixture);
      const projectId = 1n;
      const bidAmount = ethers.parseEther("1.0");

      await escrow.connect(client).createProject(projectId);
      await escrow.connect(freelancer).placeBid(projectId, bidAmount);
      
      await expect(escrow.connect(otherAccount).acceptBid(projectId, freelancer.address))
        .to.be.revertedWithCustomError(escrow, "Unauthorized");
    });

    it("Should revert if bid doesn't exist", async function () {
      const { escrow, client, freelancer } = await loadFixture(deployEscrowFixture);
      const projectId = 1n;

      await escrow.connect(client).createProject(projectId);
      
      await expect(escrow.connect(client).acceptBid(projectId, freelancer.address))
        .to.be.revertedWithCustomError(escrow, "BidNotFound");
    });

    it("Should revert if project is not open", async function () {
      const { escrow, client, freelancer } = await loadFixture(deployEscrowFixture);
      const projectId = 1n;
      const bidAmount = ethers.parseEther("1.0");

      await escrow.connect(client).createProject(projectId);
      await escrow.connect(freelancer).placeBid(projectId, bidAmount);
      await escrow.connect(client).acceptBid(projectId, freelancer.address);
      
      await expect(escrow.connect(client).acceptBid(projectId, freelancer.address))
        .to.be.revertedWithCustomError(escrow, "InvalidStatus");
    });
  });

  describe("Milestones", function () {
    it("Should allow client to create a milestone", async function () {
      const { escrow, client, freelancer } = await loadFixture(deployEscrowFixture);
      const projectId = 1n;
      const milestoneIndex = 0;
      const milestoneAmount = ethers.parseEther("0.5");

      await escrow.connect(client).createProject(projectId);
      await escrow.connect(freelancer).placeBid(projectId, ethers.parseEther("1.0"));
      await escrow.connect(client).acceptBid(projectId, freelancer.address);

      await expect(escrow.connect(client).createMilestone(projectId, milestoneIndex, milestoneAmount))
        .to.emit(escrow, "MilestoneCreated")
        .withArgs(projectId, milestoneIndex, milestoneAmount);

      const milestone = await escrow.milestones(projectId, milestoneIndex);
      expect(milestone.amountWei).to.equal(milestoneAmount);
      expect(milestone.fundedWei).to.equal(0n);
      expect(milestone.submitted).to.be.false;
      expect(milestone.released).to.be.false;
      expect(milestone.exists).to.be.true;
    });

    it("Should revert if milestone already exists", async function () {
      const { escrow, client, freelancer } = await loadFixture(deployEscrowFixture);
      const projectId = 1n;
      const milestoneIndex = 0;
      const milestoneAmount = ethers.parseEther("0.5");

      await escrow.connect(client).createProject(projectId);
      await escrow.connect(freelancer).placeBid(projectId, ethers.parseEther("1.0"));
      await escrow.connect(client).acceptBid(projectId, freelancer.address);
      await escrow.connect(client).createMilestone(projectId, milestoneIndex, milestoneAmount);

      await expect(escrow.connect(client).createMilestone(projectId, milestoneIndex, milestoneAmount))
        .to.be.revertedWithCustomError(escrow, "MilestoneExists");
    });

    it("Should revert if not called by client", async function () {
      const { escrow, client, freelancer } = await loadFixture(deployEscrowFixture);
      const projectId = 1n;
      const milestoneIndex = 0;
      const milestoneAmount = ethers.parseEther("0.5");

      await escrow.connect(client).createProject(projectId);
      await escrow.connect(freelancer).placeBid(projectId, ethers.parseEther("1.0"));
      await escrow.connect(client).acceptBid(projectId, freelancer.address);

      await expect(escrow.connect(freelancer).createMilestone(projectId, milestoneIndex, milestoneAmount))
        .to.be.revertedWithCustomError(escrow, "Unauthorized");
    });

    it("Should revert if milestone amount is zero", async function () {
      const { escrow, client, freelancer } = await loadFixture(deployEscrowFixture);
      const projectId = 1n;
      const milestoneIndex = 0;

      await escrow.connect(client).createProject(projectId);
      await escrow.connect(freelancer).placeBid(projectId, ethers.parseEther("1.0"));
      await escrow.connect(client).acceptBid(projectId, freelancer.address);

      await expect(escrow.connect(client).createMilestone(projectId, milestoneIndex, 0))
        .to.be.revertedWithCustomError(escrow, "ZeroAmount");
    });
  });

  describe("Funding Milestones", function () {
    it("Should allow client to fund a milestone", async function () {
      const { escrow, client, freelancer } = await loadFixture(deployEscrowFixture);
      const projectId = 1n;
      const milestoneIndex = 0;
      const milestoneAmount = ethers.parseEther("0.5");
      const fundAmount = ethers.parseEther("0.3");

      await escrow.connect(client).createProject(projectId);
      await escrow.connect(freelancer).placeBid(projectId, ethers.parseEther("1.0"));
      await escrow.connect(client).acceptBid(projectId, freelancer.address);
      await escrow.connect(client).createMilestone(projectId, milestoneIndex, milestoneAmount);

      await expect(escrow.connect(client).fundMilestone(projectId, milestoneIndex, { value: fundAmount }))
        .to.emit(escrow, "MilestoneFunded")
        .withArgs(projectId, milestoneIndex, fundAmount, fundAmount);

      const milestone = await escrow.milestones(projectId, milestoneIndex);
      expect(milestone.fundedWei).to.equal(fundAmount);

      const project = await escrow.projects(projectId);
      expect(project.vaultBalance).to.equal(fundAmount);
    });

    it("Should allow partial funding of milestone", async function () {
      const { escrow, client, freelancer } = await loadFixture(deployEscrowFixture);
      const projectId = 1n;
      const milestoneIndex = 0;
      const milestoneAmount = ethers.parseEther("1.0");
      const fundAmount1 = ethers.parseEther("0.3");
      const fundAmount2 = ethers.parseEther("0.4");

      await escrow.connect(client).createProject(projectId);
      await escrow.connect(freelancer).placeBid(projectId, ethers.parseEther("1.0"));
      await escrow.connect(client).acceptBid(projectId, freelancer.address);
      await escrow.connect(client).createMilestone(projectId, milestoneIndex, milestoneAmount);

      await escrow.connect(client).fundMilestone(projectId, milestoneIndex, { value: fundAmount1 });
      await escrow.connect(client).fundMilestone(projectId, milestoneIndex, { value: fundAmount2 });

      const milestone = await escrow.milestones(projectId, milestoneIndex);
      expect(milestone.fundedWei).to.equal(fundAmount1 + fundAmount2);
    });

    it("Should revert if funding amount is zero", async function () {
      const { escrow, client, freelancer } = await loadFixture(deployEscrowFixture);
      const projectId = 1n;
      const milestoneIndex = 0;
      const milestoneAmount = ethers.parseEther("0.5");

      await escrow.connect(client).createProject(projectId);
      await escrow.connect(freelancer).placeBid(projectId, ethers.parseEther("1.0"));
      await escrow.connect(client).acceptBid(projectId, freelancer.address);
      await escrow.connect(client).createMilestone(projectId, milestoneIndex, milestoneAmount);

      await expect(escrow.connect(client).fundMilestone(projectId, milestoneIndex, { value: 0 }))
        .to.be.revertedWithCustomError(escrow, "ZeroAmount");
    });

    it("Should revert if milestone is already released", async function () {
      const { escrow, client, freelancer } = await loadFixture(deployEscrowFixture);
      const projectId = 1n;
      const milestoneIndex = 0;
      const milestoneAmount = ethers.parseEther("0.5");

      await escrow.connect(client).createProject(projectId);
      await escrow.connect(freelancer).placeBid(projectId, ethers.parseEther("1.0"));
      await escrow.connect(client).acceptBid(projectId, freelancer.address);
      await escrow.connect(client).createMilestone(projectId, milestoneIndex, milestoneAmount);
      await escrow.connect(client).fundMilestone(projectId, milestoneIndex, { value: milestoneAmount });
      await escrow.connect(freelancer).submitMilestone(projectId, milestoneIndex);
      await escrow.connect(client).releaseMilestone(projectId, milestoneIndex);

      await expect(escrow.connect(client).fundMilestone(projectId, milestoneIndex, { value: ethers.parseEther("0.1") }))
        .to.be.revertedWithCustomError(escrow, "AlreadyReleased");
    });
  });

  describe("Submitting Milestones", function () {
    it("Should allow freelancer to submit a milestone", async function () {
      const { escrow, client, freelancer } = await loadFixture(deployEscrowFixture);
      const projectId = 1n;
      const milestoneIndex = 0;
      const milestoneAmount = ethers.parseEther("0.5");

      await escrow.connect(client).createProject(projectId);
      await escrow.connect(freelancer).placeBid(projectId, ethers.parseEther("1.0"));
      await escrow.connect(client).acceptBid(projectId, freelancer.address);
      await escrow.connect(client).createMilestone(projectId, milestoneIndex, milestoneAmount);
      await escrow.connect(client).fundMilestone(projectId, milestoneIndex, { value: milestoneAmount });

      await expect(escrow.connect(freelancer).submitMilestone(projectId, milestoneIndex))
        .to.emit(escrow, "MilestoneSubmitted")
        .withArgs(projectId, milestoneIndex);

      const milestone = await escrow.milestones(projectId, milestoneIndex);
      expect(milestone.submitted).to.be.true;
    });

    it("Should revert if not called by freelancer", async function () {
      const { escrow, client, freelancer } = await loadFixture(deployEscrowFixture);
      const projectId = 1n;
      const milestoneIndex = 0;
      const milestoneAmount = ethers.parseEther("0.5");

      await escrow.connect(client).createProject(projectId);
      await escrow.connect(freelancer).placeBid(projectId, ethers.parseEther("1.0"));
      await escrow.connect(client).acceptBid(projectId, freelancer.address);
      await escrow.connect(client).createMilestone(projectId, milestoneIndex, milestoneAmount);
      await escrow.connect(client).fundMilestone(projectId, milestoneIndex, { value: milestoneAmount });

      await expect(escrow.connect(client).submitMilestone(projectId, milestoneIndex))
        .to.be.revertedWithCustomError(escrow, "Unauthorized");
    });

    it("Should revert if no freelancer assigned", async function () {
      const { escrow, client } = await loadFixture(deployEscrowFixture);
      const projectId = 1n;
      const milestoneIndex = 0;
      const milestoneAmount = ethers.parseEther("0.5");

      await escrow.connect(client).createProject(projectId);
      await escrow.connect(client).createMilestone(projectId, milestoneIndex, milestoneAmount);

      await expect(escrow.connect(client).submitMilestone(projectId, milestoneIndex))
        .to.be.revertedWithCustomError(escrow, "NoFreelancer");
    });
  });

  describe("Releasing Milestones", function () {
    it("Should allow client to release a submitted milestone", async function () {
      const { escrow, client, freelancer } = await loadFixture(deployEscrowFixture);
      const projectId = 1n;
      const milestoneIndex = 0;
      const milestoneAmount = ethers.parseEther("0.5");

      await escrow.connect(client).createProject(projectId);
      await escrow.connect(freelancer).placeBid(projectId, ethers.parseEther("1.0"));
      await escrow.connect(client).acceptBid(projectId, freelancer.address);
      await escrow.connect(client).createMilestone(projectId, milestoneIndex, milestoneAmount);
      await escrow.connect(client).fundMilestone(projectId, milestoneIndex, { value: milestoneAmount });
      await escrow.connect(freelancer).submitMilestone(projectId, milestoneIndex);

      const freelancerBalanceBefore = await ethers.provider.getBalance(freelancer.address);
      
      await expect(escrow.connect(client).releaseMilestone(projectId, milestoneIndex))
        .to.emit(escrow, "MilestoneReleased")
        .withArgs(projectId, milestoneIndex, milestoneAmount);

      const milestone = await escrow.milestones(projectId, milestoneIndex);
      expect(milestone.released).to.be.true;

      const project = await escrow.projects(projectId);
      expect(project.vaultBalance).to.equal(0n);

      const freelancerBalanceAfter = await ethers.provider.getBalance(freelancer.address);
      expect(freelancerBalanceAfter - freelancerBalanceBefore).to.equal(milestoneAmount);
    });

    it("Should revert if milestone not submitted", async function () {
      const { escrow, client, freelancer } = await loadFixture(deployEscrowFixture);
      const projectId = 1n;
      const milestoneIndex = 0;
      const milestoneAmount = ethers.parseEther("0.5");

      await escrow.connect(client).createProject(projectId);
      await escrow.connect(freelancer).placeBid(projectId, ethers.parseEther("1.0"));
      await escrow.connect(client).acceptBid(projectId, freelancer.address);
      await escrow.connect(client).createMilestone(projectId, milestoneIndex, milestoneAmount);
      await escrow.connect(client).fundMilestone(projectId, milestoneIndex, { value: milestoneAmount });

      await expect(escrow.connect(client).releaseMilestone(projectId, milestoneIndex))
        .to.be.revertedWithCustomError(escrow, "NotSubmitted");
    });

    it("Should revert if already released", async function () {
      const { escrow, client, freelancer } = await loadFixture(deployEscrowFixture);
      const projectId = 1n;
      const milestoneIndex = 0;
      const milestoneAmount = ethers.parseEther("0.5");

      await escrow.connect(client).createProject(projectId);
      await escrow.connect(freelancer).placeBid(projectId, ethers.parseEther("1.0"));
      await escrow.connect(client).acceptBid(projectId, freelancer.address);
      await escrow.connect(client).createMilestone(projectId, milestoneIndex, milestoneAmount);
      await escrow.connect(client).fundMilestone(projectId, milestoneIndex, { value: milestoneAmount });
      await escrow.connect(freelancer).submitMilestone(projectId, milestoneIndex);
      await escrow.connect(client).releaseMilestone(projectId, milestoneIndex);

      await expect(escrow.connect(client).releaseMilestone(projectId, milestoneIndex))
        .to.be.revertedWithCustomError(escrow, "AlreadyReleased");
    });

    it("Should revert if not called by client", async function () {
      const { escrow, client, freelancer } = await loadFixture(deployEscrowFixture);
      const projectId = 1n;
      const milestoneIndex = 0;
      const milestoneAmount = ethers.parseEther("0.5");

      await escrow.connect(client).createProject(projectId);
      await escrow.connect(freelancer).placeBid(projectId, ethers.parseEther("1.0"));
      await escrow.connect(client).acceptBid(projectId, freelancer.address);
      await escrow.connect(client).createMilestone(projectId, milestoneIndex, milestoneAmount);
      await escrow.connect(client).fundMilestone(projectId, milestoneIndex, { value: milestoneAmount });
      await escrow.connect(freelancer).submitMilestone(projectId, milestoneIndex);

      await expect(escrow.connect(freelancer).releaseMilestone(projectId, milestoneIndex))
        .to.be.revertedWithCustomError(escrow, "Unauthorized");
    });
  });

  describe("Closing Projects", function () {
    it("Should allow client to close a project and refund remaining balance", async function () {
      const { escrow, client, freelancer } = await loadFixture(deployEscrowFixture);
      const projectId = 1n;
      const milestoneIndex = 0;
      const milestoneAmount = ethers.parseEther("0.5");
      const fundAmount = ethers.parseEther("1.0");

      await escrow.connect(client).createProject(projectId);
      await escrow.connect(freelancer).placeBid(projectId, ethers.parseEther("1.0"));
      await escrow.connect(client).acceptBid(projectId, freelancer.address);
      await escrow.connect(client).createMilestone(projectId, milestoneIndex, milestoneAmount);
      await escrow.connect(client).fundMilestone(projectId, milestoneIndex, { value: fundAmount });

      const clientBalanceBefore = await ethers.provider.getBalance(client.address);
      const refundAmount = fundAmount - milestoneAmount; // Remaining after milestone amount

      await expect(escrow.connect(client).closeProject(projectId))
        .to.emit(escrow, "ProjectClosed")
        .withArgs(projectId, fundAmount);

      const project = await escrow.projects(projectId);
      expect(project.status).to.equal(2); // Closed
      expect(project.vaultBalance).to.equal(0n);

      const clientBalanceAfter = await ethers.provider.getBalance(client.address);
      // Note: We can't check exact balance due to gas costs, but we can verify the refund happened
      expect(clientBalanceAfter).to.be.greaterThan(clientBalanceBefore);
    });

    it("Should allow closing project with zero balance", async function () {
      const { escrow, client, freelancer } = await loadFixture(deployEscrowFixture);
      const projectId = 1n;

      await escrow.connect(client).createProject(projectId);
      await escrow.connect(freelancer).placeBid(projectId, ethers.parseEther("1.0"));
      await escrow.connect(client).acceptBid(projectId, freelancer.address);

      await expect(escrow.connect(client).closeProject(projectId))
        .to.emit(escrow, "ProjectClosed")
        .withArgs(projectId, 0n);

      const project = await escrow.projects(projectId);
      expect(project.status).to.equal(2); // Closed
    });

    it("Should revert if not called by client", async function () {
      const { escrow, client, freelancer } = await loadFixture(deployEscrowFixture);
      const projectId = 1n;

      await escrow.connect(client).createProject(projectId);
      await escrow.connect(freelancer).placeBid(projectId, ethers.parseEther("1.0"));
      await escrow.connect(client).acceptBid(projectId, freelancer.address);

      await expect(escrow.connect(freelancer).closeProject(projectId))
        .to.be.revertedWithCustomError(escrow, "Unauthorized");
    });

    it("Should revert if project already closed", async function () {
      const { escrow, client, freelancer } = await loadFixture(deployEscrowFixture);
      const projectId = 1n;

      await escrow.connect(client).createProject(projectId);
      await escrow.connect(freelancer).placeBid(projectId, ethers.parseEther("1.0"));
      await escrow.connect(client).acceptBid(projectId, freelancer.address);
      await escrow.connect(client).closeProject(projectId);

      await expect(escrow.connect(client).closeProject(projectId))
        .to.be.revertedWithCustomError(escrow, "InvalidStatus");
    });
  });

  describe("Direct ETH Transfers", function () {
    it("Should revert on direct ETH transfer via receive", async function () {
      const { escrow, client } = await loadFixture(deployEscrowFixture);

      await expect(
        client.sendTransaction({
          to: await escrow.getAddress(),
          value: ethers.parseEther("1.0"),
        })
      ).to.be.revertedWith("DIRECT_ETH_DISABLED");
    });

    it("Should revert on direct ETH transfer via fallback", async function () {
      const { escrow, client } = await loadFixture(deployEscrowFixture);

      await expect(
        client.sendTransaction({
          to: await escrow.getAddress(),
          value: ethers.parseEther("1.0"),
          data: "0x1234",
        })
      ).to.be.revertedWith("DIRECT_ETH_DISABLED");
    });
  });
});
