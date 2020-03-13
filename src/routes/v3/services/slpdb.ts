import { ISlpData } from '../interfaces/ISlpData'

import {
  BalanceForAddressByTokenId,
  BalancesForAddress,
  BalancesForToken,
  BurnTotalResult,
  ConvertResult,
  TokenInterface,
  ValidateTxidResult,
  TransactionInterface,
} from "../interfaces/RESTInterfaces"

import axios, { AxiosResponse } from "axios"

const SLPSDK: any = require("slp-sdk")
const SLP: any = new SLPSDK()
const slpjs: any = SLP.slpjs

export class Slpdb implements ISlpData {
  // #region Public
  public async listAllTokens() {
    const query: {
      v: number
      q: {
        db: string[]
        find: any
        project: {
          tokenDetails: number
          tokenStats: number
          _id: number
        }
        sort: any
        limit: number
      }
    } = {
      v: 3,
      q: {
        db: ["t"],
        find: {
          $query: {}
        },
        project: { tokenDetails: 1, tokenStats: 1, _id: 0 },
        sort: { "tokenStats.block_created": -1 },
        limit: 10000
      }
    }

    const tokenRes: AxiosResponse = await this.runQuery(query)

    const formattedTokens: TokenInterface[] = []

    if (tokenRes.data.t.length) {
      tokenRes.data.t.forEach((token: any) => {
        token = this.formatTokenOutput(token)
        formattedTokens.push(token)
      })
    }

    return formattedTokens
  }

  public async listSingleToken(tokenId: string) {
    const query: {
      v: number
      q: {
        db: string[]
        find: any
        project: {
          tokenDetails: number
          tokenStats: number
          _id: number
        }
        limit: number
      }
    } = {
      v: 3,
      q: {
        db: ["t"],
        find: {
          $query: {
            "tokenDetails.tokenIdHex": tokenId
          }
        },
        project: { tokenDetails: 1, tokenStats: 1, _id: 0 },
        limit: 1000
      }
    }

    const tokenRes: AxiosResponse = await this.runQuery(query)

    let token
    if (tokenRes.data.t.length == 0) {
      return {
        id: "not found"
      }
    }

    token = this.formatTokenOutput(tokenRes.data.t[0])

    const [totalMinted, totalBurned] = await Promise.all([
      this.getTotalMinted(tokenId),
      this.getTotalBurned(tokenId),
    ])

    token.totalMinted = token.initialTokenQty + totalMinted
    token.totalBurned = totalBurned
    token.circulatingSupply = token.totalMinted - token.totalBurned

    return token
  }

  public async listBulkToken(tokenIds: string []) {
    const query: {
      v: number
      q: {
        db: string[]
        find: any
        project: {
          tokenDetails: number
          tokenStats: number
          _id: number
        }
        sort: any
        limit: number
      }
    } = {
      v: 3,
      q: {
        db: ["t"],
        find: {
          "tokenDetails.tokenIdHex": {
            $in: tokenIds
          }
        },
        project: { tokenDetails: 1, tokenStats: 1, _id: 0 },
        sort: { "tokenStats.block_created": -1 },
        limit: 10000
      }
    }

    const tokenRes: AxiosResponse = await this.runQuery(query)

    const formattedTokens: any[] = []
    const txids: string[] = []

    if (tokenRes.data.t.length) {
      tokenRes.data.t.forEach((token: any) => {
        txids.push(token.tokenDetails.tokenIdHex)
        token = this.formatTokenOutput(token)

        // Add null calculated stats (only populated on single token stats call)
        token.circulatingSupply = null
        token.totalBurned = null
        token.totalMinted = null

        formattedTokens.push(token)
      })
    }

    tokenIds.forEach((tokenId: string) => {
      if (!txids.includes(tokenId)) {
        formattedTokens.push({
          id: tokenId,
          valid: false
        })
      }
    })

    return formattedTokens
  }

  public async getBalancesForAddressSingle(address: string) {
    const query = {
      v: 3,
      q: {
        db: ["g"],
        aggregate: [
          {
            "$match": {
              "graphTxn.outputs": {
                "$elemMatch": {
                  "address": SLP.Address.toSLPAddress(address),
                  "status": "UNSPENT",
                  "slpAmount": { "$gte": 0 }
                }
              }
            }
          },
          {
            "$unwind": "$graphTxn.outputs"
          },
          {
            "$match": {
              "graphTxn.outputs.address": SLP.Address.toSLPAddress(address),
              "graphTxn.outputs.status": "UNSPENT",
              "graphTxn.outputs.slpAmount": { "$gte": 0 }
            }
          },
          {
            "$project": {
              "amount": "$graphTxn.outputs.slpAmount",
              "address": "$graphTxn.outputs.address",
              "txid": "$graphTxn.txid",
              "vout": "$graphTxn.outputs.vout",
              "tokenId": "$tokenDetails.tokenIdHex"
            }
          },
          {
            "$group": {
              "_id": "$tokenId",
              "balanceString": {
                "$sum": "$amount"
              },
              "slpAddress": {
                "$first": "$address"
              }
            }
          }
        ],
        limit: 10000
      }
    }

    const tokenRes: AxiosResponse = await this.runQuery(query)

    const tokenIds: string[] = []
    if (tokenRes.data.g.length === 0) {
      return []
    }

    tokenRes.data.g = tokenRes.data.g.map(token => {
      token.tokenId = token._id
      tokenIds.push(token.tokenId)
      token.balance = parseFloat(token.balanceString)
      delete token._id
      return token
    })

    const promises = tokenIds.map(async tokenId => {
      try {
        const query2: {
          v: number
          q: {
            db: string[]
            find: any
            project: any
            limit: number
          }
        } = {
          v: 3,
          q: {
            db: ["t"],
            find: {
              $query: {
                "tokenDetails.tokenIdHex": tokenId
              }
            },
            project: {
              "tokenDetails.decimals": 1,
              "tokenDetails.tokenIdHex": 1,
              _id: 0
            },
            limit: 1000
          }
        }

        const tokenRes2: AxiosResponse = await this.runQuery(query2)
        return tokenRes2.data
      } catch (err) {
        throw err
      }
    })

    const details: BalancesForAddress[] = await Promise.all(promises)
    tokenRes.data.g = tokenRes.data.g.map((token: any): any => {
      details.forEach((detail: any): any => {
        if (detail.t[0].tokenDetails.tokenIdHex === token.tokenId)
          token.decimalCount = detail.t[0].tokenDetails.decimals
      })
      return token
    })
    return tokenRes.data.g
  }

  public async getBalancesForTokenSingle(tokenId: string) {
    const query = {
      v: 3,
      q: {
        db: ["g"],
        aggregate: [
          {
            "$match": {
              "graphTxn.outputs": {
                "$elemMatch": {
                  "status": "UNSPENT",
                  "slpAmount": { "$gte": 0 }
                }
              },
              "tokenDetails.tokenIdHex": tokenId
            }
          },
          {
            "$unwind": "$graphTxn.outputs"
          },
          {
            "$match": {
              "graphTxn.outputs.status": "UNSPENT",
              "graphTxn.outputs.slpAmount": { "$gte": 0 },
              "tokenDetails.tokenIdHex": tokenId
            }
          },
          {
            "$project": {
              "token_balance": "$graphTxn.outputs.slpAmount",
              "address": "$graphTxn.outputs.address",
              "txid": "$graphTxn.txid",
              "vout": "$graphTxn.outputs.vout",
              "tokenId": "$tokenDetails.tokenIdHex"
            }
          },
          {
            "$group": {
              "_id": "$address",
              "token_balance": {
                "$sum": "$token_balance"
              }
            }
          }
        ],
        limit: 10000
      }
    }

    // Get data from SLPDB.
    const tokenRes: AxiosResponse = await this.runQuery(query)
    const resBalances: BalancesForToken[] = tokenRes.data.g.map(
      (addy: any): any => {
        addy.tokenBalance = parseFloat(addy.token_balance)
        addy.tokenBalanceString = addy.token_balance
        addy.slpAddress = addy._id
        addy.tokenId = tokenId
        delete addy._id
        delete addy.token_balance
        return addy
      }
    )

    return resBalances
  }

  public async getBalancesForAddressByTokenIdSingle(address: string, tokenId: string) {
    const slpAddr: string = slpjs.Utils.toSlpAddress(address)

    const query: {
      v: number
      q: {
        db: string[]
        aggregate: any[]
        limit: number
      }
    } = {
      v: 3,
      q: {
        db: ["g"],
        aggregate: [
          {
            "$match": {
              "graphTxn.outputs": {
                "$elemMatch": {
                  "address": slpAddr,
                  "status": "UNSPENT",
                  "slpAmount": { "$gte": 0 }
                }
              }
            }
          },
          {
            "$unwind": "$graphTxn.outputs"
          },
          {
            "$match": {
              "graphTxn.outputs.address": slpAddr,
              "graphTxn.outputs.status": "UNSPENT",
              "graphTxn.outputs.slpAmount": { "$gte": 0 }
            }
          },
          {
            "$project": {
              "amount": "$graphTxn.outputs.slpAmount",
              "address": "$graphTxn.outputs.address",
              "txid": "$graphTxn.txid",
              "vout": "$graphTxn.outputs.vout",
              "tokenId": "$tokenDetails.tokenIdHex"
            }
          },
          {
            "$group": {
              "_id": "$tokenId",
              "balanceString": {
                "$sum": "$amount"
              },
              "slpAddress": {
                "$first": "$address"
              }
            }
          }
        ],
        limit: 10000
      }
    }

    const tokenRes: AxiosResponse<any> = await this.runQuery(query)

    let resVal: BalanceForAddressByTokenId = {
      cashAddress: slpjs.Utils.toCashAddress(slpAddr),
      legacyAddress: slpjs.Utils.toLegacyAddress(slpAddr),
      slpAddress: slpAddr,
      tokenId: tokenId,
      balance: 0,
      balanceString: "0"
    }
    if (tokenRes.data.g.length > 0) {
      tokenRes.data.g.forEach((token: any): any => {
        if (token._id === tokenId) {
          resVal = {
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
      resVal = {
        cashAddress: slpjs.Utils.toCashAddress(slpAddr),
        legacyAddress: slpjs.Utils.toLegacyAddress(slpAddr),
        slpAddress: slpAddr,
        tokenId: tokenId,
        balance: 0,
        balanceString: "0"
      }
    }

    return resVal
  }

  public async validateTxid(txid: string) {
    const query = {
      v: 3,
      q: {
        db: ["c", "u"],
        find: {
          "tx.h": txid
        },
        limit: 300,
        project: { "slp.valid": 1, "tx.h": 1, "slp.invalidReason": 1 }
      }
    }

    // Get data from SLPDB.
    const tokenRes = await this.runQuery(query)

    let result: any = {
      txid: txid,
      valid: false
    }

    const concatArray: any[] = tokenRes.data.c.concat(tokenRes.data.u)
    if (concatArray.length > 0) {
      result = {
        txid: concatArray[0].tx.h,
        valid: concatArray[0].slp.valid
      }
      if (!result.valid) result.invalidReason = concatArray[0].slp.invalidReason
    }

    return result
  }

  public async validateTxidArray(txids: string[]) {
    const query = {
      v: 3,
      q: {
        db: ["c", "u"],
        find: {
          "tx.h": { $in: txids }
        },
        limit: 300,
        project: { "slp.valid": 1, "tx.h": 1, "slp.invalidReason": 1 }
      }
    }

    const tokenRes = await this.runQuery(query)

    let formattedTokens: any[] = []

    // Combine confirmed 'c' and unconfirmed 'u' collections.
    const concatArray: any[] = tokenRes.data.c.concat(tokenRes.data.u)

    const tokenIds: string[] = []

    if (concatArray.length > 0) {
      concatArray.forEach((token: any) => {
        tokenIds.push(token.tx.h)

        const validationResult: any = {
          txid: token.tx.h,
          valid: token.slp.valid
        }

        // If the txid is invalid, add the reason it's invalid.
        if (!validationResult.valid)
          validationResult.invalidReason = token.slp.invalidReason

        formattedTokens.push(validationResult)
      })

      // If a user-provided txid doesn't exist in the data, add it with
      // valid:false property.
      txids.forEach((tokenId: string) => {
        if (!tokenIds.includes(tokenId)) {
          formattedTokens.push({
            txid: tokenId,
            valid: false
          })
        }
      })
    }

    // Catch a corner case of repeated txids. SLPDB will remove redundent TXIDs,
    // which will cause the output array to be smaller than the input array.
    if (txids.length > formattedTokens.length) {
      const newOutput = []
      for (let i = 0; i < txids.length; i++) {
        const thisTxid = txids[i]

        // Find the element that matches the current txid.
        const elem = formattedTokens.filter(x => x.txid === thisTxid)

        newOutput.push(elem[0])
      }

      // Replace the original output object with the new output object.
      formattedTokens = newOutput
    }

    return formattedTokens
  }

  public async getTransactionBurnTotal(txid: string) {
    const query: {
      v: number
      q: {
        db: string[]
        aggregate: any
        limit: number
      }
    } = {
      v: 3,
      q: {
        db: ["g"],
        aggregate: [
          {
            $match: {
              "graphTxn.txid": txid
            }
          },
          {
            $project: {
              "graphTxn.txid": 1,
              inputTotal: { $sum: "$graphTxn.inputs.slpAmount" },
              outputTotal: { $sum: "$graphTxn.outputs.slpAmount" }
            }
          }
        ],
        limit: 1000
      }
    }

    // Get data from SLPDB.
    const tokenRes: AxiosResponse = await this.runQuery(query)

    const burnTotal: BurnTotalResult = {
      transactionId: txid,
      inputTotal: 0,
      outputTotal: 0,
      burnTotal: 0
    }

    if (tokenRes.data.g.length) {
      const inputTotal: number = parseFloat(tokenRes.data.g[0].inputTotal)
      const outputTotal: number = parseFloat(tokenRes.data.g[0].outputTotal)
      burnTotal.inputTotal = inputTotal
      burnTotal.outputTotal = outputTotal
      burnTotal.burnTotal = inputTotal - outputTotal
    }

    return burnTotal
  }

  public async getTransactionDetails(txid: string) {
    const query = {
      v: 3,
      db: ["g"],
      q: {
        find: {
          "tx.h": txid
        },
        limit: 300
      }
    }

    const result = this.runQuery(query)
    return result
  }

  public async getTransactionsByTokenIdAddressSingle(tokenId: string, address: string) {
    const slpAddr: string = slpjs.Utils.toSlpAddress(address)

    const query: {
      v: number
      q: any
      r: any
    } = {
      v: 3,
      q: {
        find: {
          db: ["c", "u"],
          $query: {
            $or: [
              {
                "in.e.a": slpAddr
              },
              {
                "out.e.a": slpAddr
              }
            ],
            "slp.detail.tokenIdHex": tokenId
          },
          $orderby: {
            "blk.i": -1
          }
        },
        limit: 100
      },
      r: {
        f: "[.[] | { txid: .tx.h, tokenDetails: .slp } ]"
      }
    }

    // Get data from SLPDB.
    const tokenRes: AxiosResponse = await this.runQuery(query)

    return tokenRes.data.c
  }

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
          "out.e": 1,
          "out.a": 1,
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

  // #endregion

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

    token.tokenDetails.timestampUnix = token.tokenDetails.timestamp_unix
    delete token.tokenDetails.timestamp_unix
    return token.tokenDetails
  }
}
