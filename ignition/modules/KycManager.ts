import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("KycManagerProxy", (m) => {
    // Deploy the implementation
    const implementation = m.contract("KycManagerUpgradeable", [true]);

    return {
        implementation
    };
});