/*
  This library controls the communication between Blockbook indexer.
*/

const axios = require("axios")
const wlogger = require("../../../util/winston-logging")

const BITBOX = require("slp-sdk")
const bitbox = new BITBOX()

const NINSIGHT_URL = process.env.NINSIGHT_URL
  ? process.env.NINSIGHT_URL
  : "https://bch-explorer.api.bitcoin.com/v1/"

const axiosOptions = { timeout: 15000 }

let _this

class Ninsight {
  constructor() {
    _this = this

    _this.bitbox = bitbox
  }

  // Query the Ninsight API for a balance on a single BCH address.
  // Returns a Promise.
  async balance(thisAddress) {
    try {
      // console.log(`BLOCKBOOK_URL: ${BLOCKBOOK_URL}`)

      // Convert the address to a cashaddr without a prefix.
      const addr = _this.bitbox.Address.toCashAddress(thisAddress)

      const path = `${NINSIGHT_URL}addr/${addr}`
      // console.log(`path: ${path}`)

      // Query the Blockbook Node API.
      const axiosResponse = await axios.get(path, axiosOptions)
      const retData = axiosResponse.data
      // console.log(`retData: ${util.inspect(retData)}`)

      // Convert the data to meet the spec defined in /docs/v3/api-spec.md
      const specData = {
        balance: retData.balance,
        balanceSat: retData.balanceSat,
        totalReceived: retData.totalReceived,
        totalReceivedSat: retData.totalReceivedSat,
        totalSent: retData.totalSent,
        totalSentSat: retData.totalSentSat,
        unconfirmedBalance: retData.unconfirmedBalance,
        unconfirmedBalanceSat: retData.unconfirmedBalanceSat,
        unconfirmedTxAppearances: retData.unconfirmedTxAppearances,
        txAppearances: retData.txAppearances,
        slpData: {},
        transactions: retData.transactions,
        address: retData.addrStr,
        addressLegacy: _this.bitbox.Address.toLegacyAddress(retData.addrStr),
        addressSlp: _this.bitbox.Address.toSLPAddress(retData.addrStr)
      }

      return specData
    } catch (err) {
      // Dev Note: Do not log error messages here. Throw them instead and let the
      // parent function handle it.
      wlogger.debug("Error in ninsight.js/balance()")
      throw err
    }
  }
}

module.exports = Ninsight
