import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("KycManager", (m) => {
    const kycManager = m.contract("KycManager", [true]);
    return { kycManager };
});