/*
  This library controls the communication between Blockbook indexer.
*/

const axios = require("axios")
const wlogger = require("../../../util/winston-logging")

const BITBOX = require("slp-sdk")
const bitbox = new BITBOX()

const BLOCKBOOK_URL = process.env.BLOCKBOOK_URL
  ? process.env.BLOCKBOOK_URL
  : "https://127.0.0.1:9131/"
process.env.NODE_TLS_REJECT_UNAUTHORIZED = 0

const axiosOptions = { timeout: 15000 }

let _this

class Blockbook {
  constructor() {
    _this = this

    // Encapsulate dependencies for easier unit testing.
    _this.bitbox = bitbox
    _this.axios = axios
  }

  // Query the Blockbook API for a balance on a single BCH address.
  // Returns a Promise.
  async balance(thisAddress) {
    try {
      // console.log(`BLOCKBOOK_URL: ${BLOCKBOOK_URL}`)

      // Convert the address to a cashaddr without a prefix.
      const addr = _this.bitbox.Address.toCashAddress(thisAddress)

      const path = `${BLOCKBOOK_URL}api/v2/address/${addr}`
      // console.log(`path: ${path}`)

      // Query the Blockbook Node API.
      const axiosResponse = await _this.axios.get(path, axiosOptions)
      const retData = axiosResponse.data
      // console.log(`retData: ${JSON.stringify(retData, null, 2)}`)

      // Convert the data to meet the spec defined in /docs/v3/api-spec.md
      const specData = {
        balance: _this.bitbox.BitcoinCash.toBitcoinCash(
          Number(retData.balance)
        ),
        balanceSat: Number(retData.balance),
        totalReceived: _this.bitbox.BitcoinCash.toBitcoinCash(
          Number(retData.totalReceived)
        ),
        totalReceivedSat: Number(retData.totalReceived),
        totalSent: _this.bitbox.BitcoinCash.toBitcoinCash(
          Number(retData.totalSent)
        ),
        totalSentSat: Number(retData.totalSent),
        unconfirmedBalance: _this.bitbox.BitcoinCash.toBitcoinCash(
          Number(retData.unconfirmedBalance)
        ),
        unconfirmedBalanceSat: Number(retData.unconfirmedBalance),
        unconfirmedTxAppearances: retData.unconfirmedTxs,
        txAppearances: retData.txs,
        slpData: {},
        transactions: retData.txids,
        address: retData.address,
        addressLegacy: _this.bitbox.Address.toLegacyAddress(retData.address),
        addressSlp: _this.bitbox.Address.toSLPAddress(retData.address)
      }

      return specData
    } catch (err) {
      // Dev Note: Do not log error messages here. Throw them instead and let the
      // parent function handle it.
      wlogger.debug("Error in blockbook.js/balance()")
      throw err
    }
  }
}

module.exports = Blockbook
