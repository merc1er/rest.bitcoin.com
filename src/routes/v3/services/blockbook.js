/*
  This library controls the communication between Blockbook indexer.
*/

const axios = require("axios")
const wlogger = require("../../../util/winston-logging")

const BITBOX = require("bitbox-sdk").BITBOX
const bitbox = new BITBOX()

const BLOCKBOOK_URL = process.env.BLOCKBOOK_URL
  ? process.env.BLOCKBOOK_URL
  : "https://127.0.0.1:9131/"

const axiosOptions = { timeout: 15000 }

let _this

class Blockbook {
  constructor() {
    _this = this

    _this.bitbox = bitbox
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
      const axiosResponse = await axios.get(path, axiosOptions)
      const retData = axiosResponse.data
      // console.log(`retData: ${util.inspect(retData)}`)

      return retData
    } catch (err) {
      // Dev Note: Do not log error messages here. Throw them instead and let the
      // parent function handle it.
      wlogger.debug("Error in blockbook.js/balance()")
      throw err
    }
  }
}

module.exports = Blockbook
