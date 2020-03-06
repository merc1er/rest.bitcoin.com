import { TokenInterface } from "./RESTInterfaces";

export interface ISlpData {
  getTokenStats(tokenId: string): Promise<TokenInterface>
  getTotalBurned(tokenId: string): Promise<number>
  getTotalMinted(tokenId: string): Promise<number>
  getHistoricalSlpTransactions(addressList: string []): Promise<object []>
}
