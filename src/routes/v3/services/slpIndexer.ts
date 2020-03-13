import { ISlpData } from '../interfaces/ISlpData'

import {
  TokenInterface,
} from "../interfaces/RESTInterfaces"

import axios, { AxiosResponse } from "axios"

const SLPSDK: any = require("slp-sdk")
const SLP: any = new SLPSDK()
const slpjs: any = SLP.slpjs

export class SlpIndexer implements ISlpData {
  // #region Public

  public async listAllTokens() {
    throw new Error("Deprecated")
  }

  public async listSingleToken(tokenId: string): Promise<any> {
    const url = `${process.env.SLP_INDEXER_URL}list/${tokenId}`
    const response: AxiosResponse = await axios.get(url)
    const result = response.data
    return result
  }

  public async listBulkToken(tokenIds: string []) {
    const url = `${process.env.SLP_INDEXER_URL}list/`
    const postData = {
      tokenIds: tokenIds
    }
    const response: AxiosResponse = await axios.post(url, postData)
    const result = response.data
    return result
  }

  public async getBalancesForAddressSingle(address: string) {
    const url = `${process.env.SLP_INDEXER_URL}balancesForAddress/${address}`
    const response: AxiosResponse = await axios.get(url)
    const result = response.data
    return result
  }

  public async getBalancesForTokenSingle(tokenId: string) {
    const url = `${process.env.SLP_INDEXER_URL}balancesForToken/${tokenId}`
    const response: AxiosResponse = await axios.get(url)
    const result = response.data
    return result
  }

  public async getBalancesForAddressByTokenIdSingle(address: string, tokenId: string) {
    const slpAddr: string = slpjs.Utils.toSlpAddress(address)

    const url = `${process.env.SLP_INDEXER_URL}balancesForAddress/${address}`
    const response: AxiosResponse = await axios.get(url)
    const tokenRes = response.data

    let result = {
      cashAddress: slpjs.Utils.toCashAddress(slpAddr),
      legacyAddress: slpjs.Utils.toLegacyAddress(slpAddr),
      slpAddress: slpAddr,
      tokenId: tokenId,
      balance: 0,
      balanceString: "0"
    }
    if (tokenRes.length > 0) {
      tokenRes.forEach((token: any): any => {
        if (token._id === tokenId) {
          result = {
            cashAddress: slpjs.Utils.toCashAddress(slpAddr),
            legacyAddress: slpjs.Utils.toLegacyAddress(slpAddr),
            slpAddress: slpAddr,
            tokenId: token._id,
            balance: parseFloat(token.balanceString),
            balanceString: token.balanceString
          }
        }
      })
    } else {
      result = {
        cashAddress: slpjs.Utils.toCashAddress(slpAddr),
        legacyAddress: slpjs.Utils.toLegacyAddress(slpAddr),
        slpAddress: slpAddr,
        tokenId: tokenId,
        balance: 0,
        balanceString: "0"
      }
    }

    return result
  }

  public async validateTxid(txid: string) {
    const url = `${process.env.SLP_INDEXER_URL}validateTxid/${txid}`
    const response: AxiosResponse = await axios.get(url)
    const result = response.data
    return result
  }

  public async validateTxidArray(txids: string []) {
    const url = `${process.env.SLP_INDEXER_URL}validateTxid/`
    const postData = {
      txids: txids
    }
    const response: AxiosResponse = await axios.post(url, postData)
    const result = response.data
    return result
  }

  public async getTransactionBurnTotal(txid: string) {
    const url = `${process.env.SLP_INDEXER_URL}burnTotal/${txid}`
    const response: AxiosResponse = await axios.get(url)
    const result = response.data
    return result
  }

  public async getTransactionDetails(txid: string) {
    throw new Error("Not implemented")
  }

  public async getTransactionsByTokenIdAddressSingle(tokenId: string, address: string) {
    throw new Error("Not implemented")

    // const url = `${process.env.SLP_INDEXER_URL}recentTxForTokenId/${address}`
    // const response: AxiosResponse = await axios.get(url)
    // const result = response.data
    // return result
  }

  public async getTokenStats(tokenId: string): Promise<TokenInterface> {
    const url = `${process.env.SLP_INDEXER_URL}tokenStats/${tokenId}`
    const response: AxiosResponse = await axios.get(url)
    const result = response.data
    return result
  }

  public async getTotalMinted(tokenId: string): Promise<number> {
    throw new Error("Not implemented")
  }

  public async getTotalBurned(tokenId: string): Promise<number> {
    throw new Error("Not implemented")
  }

  public async getHistoricalSlpTransactions(addressList: string [], fromBlock: number = 0) {
    throw new Error("Not implemented")

    return null
  }

  //#endregion

  // #region Private
  private formatTokenOutput(token: any): TokenInterface {
    token.tokenDetails.id = token.tokenDetails.tokenIdHex
    delete token.tokenDetails.tokenIdHex
    token.tokenDetails.documentHash = token.tokenDetails.documentSha256Hex
    delete token.tokenDetails.documentSha256Hex
    token.tokenDetails.initialTokenQty = parseFloat(
      token.tokenDetails.genesisOrMintQuantity
    )
    delete token.tokenDetails.genesisOrMintQuantity
    delete token.tokenDetails.transactionType
    delete token.tokenDetails.batonVout
    delete token.tokenDetails.sendOutputs

    token.tokenDetails.blockCreated = token.tokenStats.block_created
    token.tokenDetails.blockLastActiveSend =
      token.tokenStats.block_last_active_send
    token.tokenDetails.blockLastActiveMint =
      token.tokenStats.block_last_active_mint
    token.tokenDetails.txnsSinceGenesis =
      token.tokenStats.qty_valid_txns_since_genesis
    token.tokenDetails.validAddresses = token.tokenStats.qty_valid_token_addresses
    token.tokenDetails.mintingBatonStatus = token.tokenStats.minting_baton_status

    delete token.tokenStats.block_last_active_send
    delete token.tokenStats.block_last_active_mint
    delete token.tokenStats.qty_valid_txns_since_genesis
    delete token.tokenStats.qty_valid_token_addresses

    token.tokenDetails.timestampUnix = token.tokenDetails.timestamp_unix
    delete token.tokenDetails.timestamp_unix
    return token.tokenDetails
  }
  // #endregion
}
