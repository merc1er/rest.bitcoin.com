import { TokenInterface } from "./RESTInterfaces";

export interface ISlpData {
  getTokenStats(tokenId: string): Promise<TokenInterface>
}
