# Security analysis of the local prototype

| Threat | Implemented control | Evidence and remaining limitation |
|---|---|---|
| Broken contract access control | Immutable admin; allowlisted driver addresses; assigned-driver checks; creator-only cancellation | Tests reject unauthorized grants, pause, acceptance, start, completion and cancellation. UI role switcher remains intentionally unrestricted for the local demonstration. |
| Replayed completion or invalid workflow | Explicit status preconditions; terminal completed/cancelled states; one active ride per participant | Tests verify no duplicate earnings, skipped transitions or second active requests. No dispute workflow after acceptance. |
| Modified off-chain route | Salted Keccak-256 commitment in contract; recomputation and comparison | Browser verifies original and modified copies. This proves integrity relative to a commitment, not truth of the trip; loss of local data removes the verification input. |
| Accidental mainnet or real-fund use | Only in-process Hardhat provider; chain ID check; no external RPC setting, wallet import or payable methods | Contract rejects Ether. Only automatically supplied local test accounts are used. |
| Cross-origin requests to local server | Loopback binding; Host and Origin checks; session header; JSON-only writes; bounded body; fixed action allowlist; serialized mutations | Browser/API checks reject requests without session/origin. This is not authentication against another user or compromised software on the same machine. |
| Reentrancy | Contract has no external calls, Ether transfers or token callbacks | No current interaction path enabling a reentrancy callback. Adding payment execution requires renewed analysis and appropriate guards. |
| Administrator compromise or loss | Emergency pause; limited admin functions; no key export in project | Local test keys are not secret production credentials. No multisignature or key recovery implemented; a production design would need separate key management. |

The contract rounds 5% commission down to whole KZT and credits the exact remainder to the driver. A bounded maximum fare and Solidity checked arithmetic prevent overflow in this scope. The rounding policy must match the financial model.

No independent security audit has been performed. Before any hypothetical production use, plan an external contract and API audit. The team must add a justified cost assumption or a cited quotation to its financial plan; no audit price is invented here. Automated tests are evidence of tested behavior, not proof of complete security.

Design reference: https://docs.soliditylang.org/en/latest/security-considerations.html
