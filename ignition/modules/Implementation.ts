import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("Implementation", (m) => {

    // Deploy the implementation
    const implementation = m.contract("ZTLNPrime");

    // Return only the implementation
    return {
        implementation
    };
});