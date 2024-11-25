import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("FundVaultImplementation", (m) => {
    const implementation = m.contract("FundVaultV3Upgradeable");
    return { implementation };
});