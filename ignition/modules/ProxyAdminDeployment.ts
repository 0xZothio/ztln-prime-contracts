import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("ProxyDeployment", (m) => {
    const proxyAdmin = m.contract("ProxyAdmin");

    return { proxyAdmin };
});