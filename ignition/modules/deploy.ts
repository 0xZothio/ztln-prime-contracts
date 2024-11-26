import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("USDC", (m) => {
    const usdc = m.contract("USDC");
    return { usdc };
});