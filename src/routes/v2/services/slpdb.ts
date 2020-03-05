import { ISlpData } from '../interfaces/ISlpData'

import {
  TokenInterface,
} from "../interfaces/RESTInterfaces"

import axios, { AxiosResponse } from "axios"

const SLPSDK: any = require("slp-sdk")
const SLP: any = new SLPSDK()

export class Slpdb implements ISlpData {
  public async getHistoricalSlpTransactions(addressList: string [], fromBlock: number = 0) {

    // Build SLPDB or query from addressList
    const orQueryArray = []
    for (let address of addressList) {
      const cashAddress = SLP.Address.toCashAddress(address)
      const slpAddress = SLP.Address.toSLPAddress(address)

      const cashQuery = {
        'in.e.a': cashAddress.slice(12),
      }
      const slpQuery = {
        'slp.detail.outputs.address': slpAddress,
      }

      orQueryArray.push(cashQuery)
      orQueryArray.push(slpQuery)
    }

    const query = {
      v: 3,
      q: {
        find: {
          db: ['c', 'u'],
          $query: {
            $or: orQueryArray,
            'slp.valid': true,
            'blk.i': {
              $not: {
                $lte: fromBlock,
              },
            },
          },
          $orderby: {
            'blk.i': -1,
          },
        },
        project: {
          '_id': 0,
          'tx.h': 1,
          'in.i': 1,
          'in.e': 1,
          'slp.detail': 1,
          'blk': 1,
        },
        limit: 500,
      },
    }

    const result = await this.runQuery(query)

    let transactions = []
    if (result.data && result.data.c) {
      transactions = transactions.concat(result.data.c)
    }
    if (result.data && result.data.u) {
      transactions = transactions.concat(result.data.u)
    }

    return transactions
  }

  public async getTokenStats(tokenId: string): Promise<TokenInterface> {
    const [totalMinted, totalBurned, tokenDetails] = await Promise.all([
      this.getTotalMinted(tokenId),
      this.getTotalBurned(tokenId),
      this.getTokenDetails(tokenId),
    ])

    tokenDetails.totalMinted = tokenDetails.initialTokenQty + totalMinted
    tokenDetails.totalBurned = totalBurned
    tokenDetails.circulatingSupply = tokenDetails.totalMinted - tokenDetails.totalBurned

    return tokenDetails
  }

  private generateCredentials() {
    // Generate the Basic Authentication header for a private instance of SLPDB.
    const SLPDB_PASS = process.env.SLPDB_PASS ? process.env.SLPDB_PASS : "BITBOX"
    const username = "BITBOX"
    const password = SLPDB_PASS
    const combined = `${username}:${password}`
    var base64Credential = Buffer.from(combined).toString("base64")
    var readyCredential = `Basic ${base64Credential}`

    const options = {
      headers: {
        authorization: readyCredential,
        timeout: 30000
      }
    }

    return options
  }

  private async runQuery(query: string | object): Promise<any> {
    const queryString: string = JSON.stringify(query)
    const queryBase64: string = Buffer.from(queryString).toString("base64")
    const url: string = `${process.env.SLPDB_URL}q/${queryBase64}`

    const options = this.generateCredentials()

    const response: AxiosResponse = await axios.get(url, options)
    return response
  }

  public async getTotalMinted(tokenId: string): Promise<number> {
    const query: any = {
      "v": 3,
      "q": {
        "db": ["g"],
        "aggregate": [
          {
            "$match": {
              "tokenDetails.tokenIdHex": tokenId,
              "graphTxn.outputs.status": {
                "$in": [
                  "BATON_SPENT_IN_MINT",
                  "BATON_UNSPENT",
                  "BATON_SPENT_NOT_IN_MINT"
                ]
              }
            }
          },
          {
            "$unwind": "$graphTxn.outputs"
          },
          {
            "$group": {
              "_id": null,
              "count": {
                "$sum": "$graphTxn.outputs.slpAmount"
              }
            }
          }
        ],
        "limit": 1
      },
    }

    const result = await this.runQuery(query)

    if (!result.data.g.length) {
      return 0
    }

    return parseFloat(result.data.g[0].count)
  }

  public async getTotalBurned(tokenId: string): Promise<number> {
    const query: any = {
      "v": 3,
      "q": {
        "db": ["g"],
        "aggregate": [
          {
            "$match": {
              "tokenDetails.tokenIdHex": tokenId,
              "graphTxn.outputs.status": {
                "$in": [
                  "SPENT_NON_SLP",
                  "BATON_SPENT_INVALID_SLP",
                  "SPENT_INVALID_SLP",
                  "BATON_SPENT_NON_SLP",
                  "MISSING_BCH_VOUT",
                  "BATON_MISSING_BCH_VOUT",
                  "BATON_SPENT_NOT_IN_MINT",
                  "EXCESS_INPUT_BURNED"
                ]
              }
            }
          },
          {
            "$unwind": "$graphTxn.outputs"
          },
          {
            "$match": {
              "graphTxn.outputs.status": {
                "$in": [
                  "SPENT_NON_SLP",
                  "BATON_SPENT_INVALID_SLP",
                  "SPENT_INVALID_SLP",
                  "BATON_SPENT_NON_SLP",
                  "MISSING_BCH_VOUT",
                  "BATON_MISSING_BCH_VOUT",
                  "BATON_SPENT_NOT_IN_MINT",
                  "EXCESS_INPUT_BURNED"
                ]
              }
            }
          },
          {
            "$group": {
              "_id": null,
              "count": {
                "$sum": "$graphTxn.outputs.slpAmount"
              }
            }
          }
        ],
        "limit": 1
      },
    }

    const result = await this.runQuery(query)

    if (!result.data.g.length) {
      return 0
    }

    return parseFloat(result.data.g[0].count)
  }

  private async getTokenDetails(tokenId: string): Promise<TokenInterface> {
    const query: any = {
      v: 3,
      q: {
        db: ["t"],
        find: {
          $query: {
            "tokenDetails.tokenIdHex": tokenId
          }
        },
        project: { tokenDetails: 1, tokenStats: 1, _id: 0 },
        limit: 1
      },
    }

    const result = await this.runQuery(query)

    if (!result.data.t.length) {
      throw new Error("Token could not be found")
    }

    const token = this.formatTokenOutput(result.data.t[0])

    return token
  }

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
}
