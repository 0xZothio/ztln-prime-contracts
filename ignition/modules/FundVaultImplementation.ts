import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("FundVaultImplementation", (m) => {

    // Deploy the implementation
    const implementation = m.contract("FundVaultV3Upgradeable");

    // Return only the implementation
    return {
        implementation
    };
});