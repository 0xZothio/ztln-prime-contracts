import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import { ethers } from "ethers";

const FUND_VAULT_ABI = [
    "function initialize(address operator, address custodian, address kycManager) public"
];

export default buildModule("FundVaultImplementation", (m) => {
    // Get parameters individually
    const operatorAddress = m.getParameter('operatorAddress');
    const custodianAddress = m.getParameter('custodianAddress');
    const kycManagerAddress = m.getParameter('kycManagerAddress');

    // Deploy the implementation
    const implementation = m.contract("FundVaultV3Upgradeable");

    // Create initialization data
    const iface = new ethers.Interface(FUND_VAULT_ABI);
    const initData = iface.encodeFunctionData("initialize", [
        operatorAddress,
        custodianAddress,
        kycManagerAddress
    ]);

    // Deploy the TransparentUpgradeableProxy
    const proxy = m.contract(
        "TransparentUpgradeableProxy",
        [
            implementation,
            m.getAccount(0),
            initData
        ]
    );

    return {
        implementation,
        proxy
    };
});