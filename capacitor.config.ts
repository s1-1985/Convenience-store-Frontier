import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "jp.csf.frontier",
  appName: "Convenience-store Frontier",
  webDir: "dist",
  server: {
    androidScheme: "https",
  },
  android: {
    backgroundColor: "#172318",
  },
};

export default config;
