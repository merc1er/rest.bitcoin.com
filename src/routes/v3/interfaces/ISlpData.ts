import { TokenInterface } from "./RESTInterfaces";

export interface ISlpData {
  listAllTokens(): Promise<any>
  listSingleToken(tokenId: string): Promise<any>
  listBulkToken(tokenIds: string []): Promise<any>
  getBalancesForAddressSingle(address: string): Promise<any>
  getBalancesForTokenSingle(tokenId: string): Promise<any>
  getBalancesForAddressByTokenIdSingle(address: string, tokenId: string): Promise<any>
  validateTxid(txid: string): Promise<any>
  validateTxidArray(txids: string[]): Promise<any>
  getTransactionBurnTotal(txid: string): Promise<any>
  getTransactionDetails(txid: string): Promise<any>
  getTransactionsByTokenIdAddressSingle(tokenId: string, address:string): Promise<any>
  getTokenStats(tokenId: string): Promise<TokenInterface>
  getTotalBurned(tokenId: string): Promise<number>
  getTotalMinted(tokenId: string): Promise<number>
  getHistoricalSlpTransactions(addressList: string [], fromBlock: number): Promise<object []>
}
