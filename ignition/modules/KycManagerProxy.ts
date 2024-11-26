import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("KycManagerProxy", (m) => {
    // Deploy the implementation
    const implementation = m.contract("KycManagerUpgradeable");

    // Deploy the TransparentUpgradeableProxy
    const proxy = m.contract(
        "TransparentUpgradeableProxy",
        [
            implementation,
            m.getAccount(0),
            m.getParameter('initData')
        ]
    );

    return {
        implementation,
        proxy
    };
});