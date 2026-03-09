import { AzureSttProvider } from "./azure-provider.js";
import type { SttProvider } from "./types.js";

export type SttProviderType = "azure" | "google" | "openai"; // OpenAI/Google would be future ones

export function createSttProvider(
  type: SttProviderType,
  config: { key: string; region: string },
  getSdk: () => Promise<unknown>,
): SttProvider {
  switch (type) {
    case "azure":
      return new AzureSttProvider(config, getSdk);
    default:
      throw new Error(`Provider type ${type} not supported yet.`);
  }
}
