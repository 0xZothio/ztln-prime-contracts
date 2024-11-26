import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import { ethers } from "ethers";

const KYC_MANAGER_ABI = [
    "function initialize(bool _strictOn, address operator) public"
];

export default buildModule("KycManagerProxy", (m) => {
    const OPERATOR_ADDRESS = process.env.OPERATOR_ADDRESS!;
    const STRICT_MODE = true;

    // Deploy the implementation
    const implementation = m.contract("KycManagerUpgradeable");

    // Create initialization data
    const iface = new ethers.Interface(KYC_MANAGER_ABI);
    const initData = iface.encodeFunctionData("initialize", [
        STRICT_MODE,
        OPERATOR_ADDRESS
    ]);

    // Deploy the TransparentUpgradeableProxy
    const proxy = m.contract(
        "TransparentUpgradeableProxy",
        [
            implementation, // implementation address
            m.getAccount(0),             // admin (deployer)
            initData                     // initialization data
        ]
    );

    return {
        implementation,
        proxy
    };
});