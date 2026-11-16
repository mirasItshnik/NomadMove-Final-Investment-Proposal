// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice Educational registry for confirmed fiat lease payments.
/// @dev The contract never receives or transfers Ether, tokens, or real money.
contract LeasePaymentRegistry {
    enum LeaseStatus { None, Active, Closed }

    struct Lease {
        address lessor;
        address driver;
        bytes32 vehicleHash;
        uint256 installmentKzt;
        uint256 intervalDays;
        uint256 nextDue;
        uint256 paidCount;
        bool overdue;
        LeaseStatus status;
    }

    address public immutable admin;
    bool public paused;
    uint256 public leaseCount;

    mapping(address => bool) public lessors;
    mapping(uint256 => Lease) public leases;
    mapping(bytes32 => bool) public paymentReferenceUsed;

    event LessorPermission(address indexed lessor, bool enabled);
    event PauseChanged(bool paused);
    event LeaseCreated(
        uint256 indexed leaseId,
        address indexed lessor,
        address indexed driver,
        bytes32 vehicleHash,
        uint256 installmentKzt,
        uint256 nextDue
    );
    event LeasePaymentConfirmed(
        uint256 indexed leaseId,
        bytes32 indexed paymentReference,
        uint256 amountKzt,
        uint256 paidCount,
        uint256 nextDue
    );
    event LeaseMarkedOverdue(uint256 indexed leaseId, uint256 dueAt);
    event LeaseClosed(uint256 indexed leaseId);

    modifier onlyAdmin() {
        require(msg.sender == admin, "Admin only");
        _;
    }

    modifier running() {
        require(!paused, "Paused");
        _;
    }

    modifier onlyLessor() {
        require(lessors[msg.sender], "Lessor only");
        _;
    }

    constructor() {
        admin = msg.sender;
    }

    function setLessor(address lessor, bool enabled) external onlyAdmin {
        require(lessor != address(0), "Zero address");
        lessors[lessor] = enabled;
        emit LessorPermission(lessor, enabled);
    }

    function setPaused(bool value) external onlyAdmin {
        paused = value;
        emit PauseChanged(value);
    }

    function createLease(
        address driver,
        bytes32 vehicleHash,
        uint256 installmentKzt,
        uint256 firstDue,
        uint256 intervalDays
    ) external running onlyLessor returns (uint256 leaseId) {
        require(driver != address(0), "Zero driver");
        require(vehicleHash != bytes32(0), "Empty vehicle hash");
        require(installmentKzt > 0 && installmentKzt <= 5_000_000, "Invalid installment");
        require(firstDue > block.timestamp, "Due date must be future");
        require(intervalDays >= 7 && intervalDays <= 31, "Invalid interval");

        leaseId = ++leaseCount;
        leases[leaseId] = Lease({
            lessor: msg.sender,
            driver: driver,
            vehicleHash: vehicleHash,
            installmentKzt: installmentKzt,
            intervalDays: intervalDays,
            nextDue: firstDue,
            paidCount: 0,
            overdue: false,
            status: LeaseStatus.Active
        });
        emit LeaseCreated(leaseId, msg.sender, driver, vehicleHash, installmentKzt, firstDue);
    }

    /// @notice Records a payment already confirmed by a regulated fiat payment partner.
    function confirmPayment(
        uint256 leaseId,
        bytes32 paymentReference,
        uint256 amountKzt
    ) external running onlyLessor {
        Lease storage lease = leases[leaseId];
        require(lease.status == LeaseStatus.Active, "Lease not active");
        require(lease.lessor == msg.sender, "Assigned lessor only");
        require(paymentReference != bytes32(0), "Empty payment reference");
        require(!paymentReferenceUsed[paymentReference], "Payment reference used");
        require(amountKzt == lease.installmentKzt, "Incorrect amount");

        paymentReferenceUsed[paymentReference] = true;
        lease.paidCount += 1;
        lease.overdue = false;
        lease.nextDue += lease.intervalDays * 1 days;
        emit LeasePaymentConfirmed(
            leaseId,
            paymentReference,
            amountKzt,
            lease.paidCount,
            lease.nextDue
        );
    }

    function markOverdue(uint256 leaseId) external running {
        Lease storage lease = leases[leaseId];
        require(lease.status == LeaseStatus.Active, "Lease not active");
        require(msg.sender == admin || msg.sender == lease.lessor, "Not authorized");
        require(block.timestamp > lease.nextDue, "Payment not overdue");
        require(!lease.overdue, "Already overdue");
        lease.overdue = true;
        emit LeaseMarkedOverdue(leaseId, lease.nextDue);
    }

    function closeLease(uint256 leaseId) external running onlyLessor {
        Lease storage lease = leases[leaseId];
        require(lease.status == LeaseStatus.Active, "Lease not active");
        require(lease.lessor == msg.sender, "Assigned lessor only");
        lease.status = LeaseStatus.Closed;
        emit LeaseClosed(leaseId);
    }
}
