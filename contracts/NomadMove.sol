// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice Educational KZT accounting only. No Ether/token payments or personal data.
contract NomadMove {
    enum Status { None, Requested, Accepted, InProgress, Completed, Cancelled }
    struct Ride {
        address passenger;
        address driver;
        bytes32 routeHash;
        uint256 fare;
        uint256 commission;
        uint256 driverNet;
        Status status;
    }
    address public immutable admin;
    uint256 public constant COMMISSION_BPS = 500;
    uint256 public constant MAX_FARE = 1000000;
    bool public paused;
    uint256 public rideCount;
    uint256 public completedCount;
    uint256 public totalGross;
    uint256 public totalCommission;
    mapping(uint256 => Ride) public rides;
    mapping(address => bool) public drivers;
    mapping(address => uint256) public activePassengerRide;
    mapping(address => uint256) public activeDriverRide;
    mapping(address => uint256) public netEarnings;

    event RideCreated(uint256 indexed rideId, address indexed passenger, bytes32 routeHash, uint256 fare);
    event RideAccepted(uint256 indexed rideId, address indexed driver);
    event RideStarted(uint256 indexed rideId);
    event RideCompleted(uint256 indexed rideId, uint256 fare, uint256 commission, uint256 driverNet);
    event RideCancelled(uint256 indexed rideId);
    event DriverPermission(address indexed driver, bool enabled);
    event PauseChanged(bool paused);

    modifier onlyAdmin() { require(msg.sender == admin, 'Admin only'); _; }
    modifier running() { require(!paused, 'Paused'); _; }
    constructor() { admin = msg.sender; }

    function setDriver(address driver, bool enabled) external onlyAdmin {
        require(driver != address(0), 'Zero address');
        require(activeDriverRide[driver] == 0, 'Driver has active ride');
        drivers[driver] = enabled;
        emit DriverPermission(driver, enabled);
    }
    function setPaused(bool value) external onlyAdmin {
        paused = value;
        emit PauseChanged(value);
    }
    function createRide(bytes32 routeHash, uint256 fare) external running returns (uint256 id) {
        require(routeHash != bytes32(0), 'Empty route hash');
        require(fare > 0 && fare <= MAX_FARE, 'Invalid fare');
        require(activePassengerRide[msg.sender] == 0, 'Passenger has active ride');
        id = ++rideCount;
        rides[id] = Ride(msg.sender, address(0), routeHash, fare, 0, 0, Status.Requested);
        activePassengerRide[msg.sender] = id;
        emit RideCreated(id, msg.sender, routeHash, fare);
    }
    function acceptRide(uint256 id) external running {
        Ride storage r = rides[id];
        require(drivers[msg.sender], 'Driver only');
        require(r.status == Status.Requested, 'Not requested');
        require(r.passenger != msg.sender, 'Cannot accept own ride');
        require(activeDriverRide[msg.sender] == 0, 'Driver has active ride');
        r.driver = msg.sender;
        r.status = Status.Accepted;
        activeDriverRide[msg.sender] = id;
        emit RideAccepted(id, msg.sender);
    }
    function startRide(uint256 id) external running {
        Ride storage r = rides[id];
        require(r.status == Status.Accepted, 'Not accepted');
        require(r.driver == msg.sender, 'Assigned driver only');
        r.status = Status.InProgress;
        emit RideStarted(id);
    }
    function completeRide(uint256 id) external running {
        Ride storage r = rides[id];
        require(r.status == Status.InProgress, 'Not in progress');
        require(r.driver == msg.sender, 'Assigned driver only');
        r.status = Status.Completed;
        // Integer KZT accounting: round commission down; net is exact remainder.
        r.commission = r.fare * COMMISSION_BPS / 10000;
        r.driverNet = r.fare - r.commission;
        totalGross += r.fare;
        totalCommission += r.commission;
        netEarnings[r.driver] += r.driverNet;
        completedCount++;
        activePassengerRide[r.passenger] = 0;
        activeDriverRide[r.driver] = 0;
        emit RideCompleted(id, r.fare, r.commission, r.driverNet);
    }
    // Cancellation is available during an emergency pause, before acceptance only.
    function cancelRide(uint256 id) external {
        Ride storage r = rides[id];
        require(r.status == Status.Requested, 'Not requested');
        require(r.passenger == msg.sender, 'Passenger only');
        r.status = Status.Cancelled;
        activePassengerRide[msg.sender] = 0;
        emit RideCancelled(id);
    }
}
